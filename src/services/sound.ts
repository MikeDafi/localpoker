import type { AudioPlayer } from 'expo-audio';
import type { ChipSoundStyle } from '../game/settings';
import { captureError } from './telemetry';

export type SoundName =
  | 'tap' | 'select' | 'deal' | 'chip'
  | 'chipCall' | 'chipRaise'
  | 'chipCall-toss' | 'chipRaise-toss'
  | 'chipCall-splash' | 'chipRaise-splash'
  | 'chipCall-riffle' | 'chipRaise-riffle'
  | 'check' | 'fold'
  | 'turn' | 'turnOther' | 'coins' | 'win' | 'lose' | 'error' | 'start' | 'tick' | 'tickUrgent';

type ChipSoundAction = 'call' | 'raise';
type AudioModule = Pick<typeof import('expo-audio'), 'createAudioPlayer' | 'setAudioModeAsync'>;
type SoundVoice = {
  player: AudioPlayer;
  rearming: boolean;
  rewindTimer?: ReturnType<typeof setTimeout>;
};

const CHIP_SOUND_NAMES: Record<ChipSoundStyle, Record<ChipSoundAction, SoundName>> = {
  toss: { call: 'chipCall-toss', raise: 'chipRaise-toss' },
  splash: { call: 'chipCall-splash', raise: 'chipRaise-splash' },
  riffle: { call: 'chipCall-riffle', raise: 'chipRaise-riffle' },
};

export function resolveChipSoundName(action: ChipSoundAction, style: unknown): SoundName {
  if (typeof style === 'string' && Object.prototype.hasOwnProperty.call(CHIP_SOUND_NAMES, style)) {
    return CHIP_SOUND_NAMES[style as ChipSoundStyle][action];
  }
  return CHIP_SOUND_NAMES.toss[action];
}

const createSources = (): Record<SoundName, number> => ({
  tap: require('../../assets/sounds/tap.wav'),
  select: require('../../assets/sounds/select.wav'),
  deal: require('../../assets/sounds/deal.wav'),
  chip: require('../../assets/sounds/chip.wav'),
  chipCall: require('../../assets/sounds/chipCall.wav'),
  chipRaise: require('../../assets/sounds/chipRaise.wav'),
  'chipCall-toss': require('../../assets/sounds/chipCall-toss.wav'),
  'chipRaise-toss': require('../../assets/sounds/chipRaise-toss.wav'),
  'chipCall-splash': require('../../assets/sounds/chipCall-splash.wav'),
  'chipRaise-splash': require('../../assets/sounds/chipRaise-splash.wav'),
  'chipCall-riffle': require('../../assets/sounds/chipCall-riffle.wav'),
  'chipRaise-riffle': require('../../assets/sounds/chipRaise-riffle.wav'),
  check: require('../../assets/sounds/check.wav'),
  fold: require('../../assets/sounds/fold.wav'),
  turn: require('../../assets/sounds/turn.wav'),
  turnOther: require('../../assets/sounds/turnOther.wav'),
  coins: require('../../assets/sounds/coins.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
  error: require('../../assets/sounds/error.wav'),
  start: require('../../assets/sounds/start.wav'),
  tick: require('../../assets/sounds/tick.wav'),
  tickUrgent: require('../../assets/sounds/tickUrgent.wav'),
});

const POOLED_SOUNDS = new Set<SoundName>([
  'tap',
  'deal',
  'chip',
  'chipCall',
  'chipRaise',
  'chipCall-toss',
  'chipRaise-toss',
  'chipCall-splash',
  'chipRaise-splash',
  'chipCall-riffle',
  'chipRaise-riffle',
]);
const POOLED_VOICES = 4;
const START_EPSILON_SECONDS = 0.015;
const FALLBACK_REWIND_DELAY_MS = 350;
const REWIND_CUSHION_MS = 24;

let audioModule: AudioModule | undefined;
let sources: Record<SoundName, number> | undefined;
const playerPools: Partial<Record<SoundName, SoundVoice[]>> = {};
const roundRobinIndexes: Partial<Record<SoundName, number>> = {};
let enabled = true;
let volume = 1;
let initialized = false;
let chipSound: unknown = 'toss';
const chipTimers = new Set<ReturnType<typeof setTimeout>>();
const reportedSoundErrors = new Set<string>();

const reportSoundError = (operation: string, error: unknown, name?: SoundName): void => {
  const key = `${operation}:${name ?? 'global'}`;
  if (reportedSoundErrors.has(key)) return;
  reportedSoundErrors.add(key);
  captureError(error, { tags: { area: 'sound', operation, ...(name ? { sound: name } : {}) } });
};

const getAudioModule = (): AudioModule => {
  audioModule ??= require('expo-audio') as AudioModule;
  return audioModule;
};

const getSources = (): Record<SoundName, number> => {
  sources ??= createSources();
  return sources;
};

const voiceCountFor = (name: SoundName): number => (POOLED_SOUNDS.has(name) ? POOLED_VOICES : 1);

const setManagedTimer = (callback: () => void, delayMs: number): ReturnType<typeof setTimeout> => {
  const timer = setTimeout(() => {
    chipTimers.delete(timer);
    callback();
  }, delayMs);
  chipTimers.add(timer);
  return timer;
};

const clearVoiceRewind = (voice: SoundVoice): void => {
  if (!voice.rewindTimer) return;
  clearTimeout(voice.rewindTimer);
  chipTimers.delete(voice.rewindTimer);
  voice.rewindTimer = undefined;
};

const rewindVoice = (name: SoundName, voice: SoundVoice): void => {
  voice.rearming = true;
  try {
    void voice.player.seekTo(0)
      .catch((error: unknown) => {
        reportSoundError('rewind', error, name);
      })
      .finally(() => {
        voice.rearming = false;
      });
  } catch (error) {
    voice.rearming = false;
    reportSoundError('rewind', error, name);
  }
};

const rewindDelayFor = (player: AudioPlayer): number => {
  const durationMs = Number.isFinite(player.duration) && player.duration > 0
    ? player.duration * 1000
    : FALLBACK_REWIND_DELAY_MS;
  return durationMs + REWIND_CUSHION_MS;
};

const scheduleVoiceRewind = (name: SoundName, voice: SoundVoice): void => {
  clearVoiceRewind(voice);
  voice.rewindTimer = setManagedTimer(() => {
    voice.rewindTimer = undefined;
    rewindVoice(name, voice);
  }, rewindDelayFor(voice.player));
};

const isArmedVoice = (voice: SoundVoice): boolean => (
  !voice.rearming
  && !voice.player.playing
  && Number.isFinite(voice.player.currentTime)
  && voice.player.currentTime <= START_EPSILON_SECONDS
);

const nextRoundRobinVoice = (name: SoundName, pool: SoundVoice[]): SoundVoice => {
  const index = roundRobinIndexes[name] ?? 0;
  roundRobinIndexes[name] = (index + 1) % pool.length;
  return pool[index % pool.length];
};

const fireArmedVoice = (name: SoundName, voice: SoundVoice): void => {
  try {
    clearVoiceRewind(voice);
    voice.player.volume = volume;
    voice.player.play();
    scheduleVoiceRewind(name, voice);
  } catch (error) {
    reportSoundError('play', error, name);
  }
};

const seekThenFireVoice = (name: SoundName, voice: SoundVoice): void => {
  try {
    clearVoiceRewind(voice);
    voice.rearming = true;
    voice.player.volume = volume;
    void voice.player.seekTo(0)
      .then(() => {
        voice.rearming = false;
        try {
          voice.player.volume = volume;
          voice.player.play();
          scheduleVoiceRewind(name, voice);
        } catch (error) {
          reportSoundError('play', error, name);
        }
      })
      .catch((error: unknown) => {
        voice.rearming = false;
        reportSoundError('seek-before-play', error, name);
      });
  } catch (error) {
    voice.rearming = false;
    reportSoundError('seek-before-play', error, name);
  }
};

function init() {
  if (initialized) return;
  initialized = true;
  let audio: AudioModule;
  let localSources: Record<SoundName, number>;
  try {
    audio = getAudioModule();
    localSources = getSources();
  } catch (error) {
    reportSoundError('load-audio', error);
    return;
  }
  (Object.keys(localSources) as SoundName[]).forEach((name) => {
    try {
      playerPools[name] = Array.from({ length: voiceCountFor(name) }, () => ({
        player: audio.createAudioPlayer(localSources[name]),
        rearming: false,
      }));
    } catch (error) {
      reportSoundError('create-audio-player', error, name);
    }
  });
  /*
   * Mix, do not take the audio session over.
   *
   * Players are created before this promise settles so the first cue cannot be
   * dropped behind an audio-session round trip. Mixing means table sounds sit
   * on top of FaceTime or music instead of fighting for the device.
   */
  void audio.setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'mixWithOthers',
  }).catch((error: unknown) => {
    reportSoundError('set-audio-mode', error);
  });
}

export const sound = {
  configure(opts: { enabled?: boolean; volume?: number; chipSound?: ChipSoundStyle }) {
    if (typeof opts.enabled === 'boolean') enabled = opts.enabled;
    if (typeof opts.volume === 'number') volume = Math.max(0, Math.min(1, opts.volume));
    if (opts.chipSound !== undefined) chipSound = opts.chipSound;
  },
  prepare() {
    init();
  },
  play(name: SoundName) {
    if (!enabled) return;
    init();
    const pool = playerPools[name];
    if (!pool?.length) return;
    const armedVoice = pool.find(isArmedVoice);
    if (armedVoice) fireArmedVoice(name, armedVoice);
    else seekThenFireVoice(name, nextRoundRobinVoice(name, pool));
  },
  playChipCall() {
    this.play(resolveChipSoundName('call', chipSound));
  },
  playChipRaise() {
    this.play(resolveChipSoundName('raise', chipSound));
  },
  /**
   * A handful of chips, one after another.
   *
   * Spacing them is what turns one chip into several, and 62ms is close to how
   * fast chips actually fall off a thumb: much tighter reads as a buzz, much
   * wider as counting.
   */
  playChips(count: number) {
    if (!enabled || count <= 0) return;
    this.play('chip');
    for (let i = 1; i < count; i += 1) {
      setManagedTimer(() => this.play('chip'), i * 62);
    }
  },
  /** Leaving a table must not leave queued chip cues over the next screen. */
  stopChips() {
    for (const timer of chipTimers) clearTimeout(timer);
    chipTimers.clear();
    Object.values(playerPools).forEach((pool) => {
      pool?.forEach((voice) => {
        voice.rewindTimer = undefined;
      });
    });
  },
};
