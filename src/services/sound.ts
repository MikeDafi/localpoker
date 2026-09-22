import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { captureError } from './telemetry';

export type SoundName =
  | 'tap' | 'select' | 'deal' | 'chip' | 'check' | 'fold'
  | 'turn' | 'coins' | 'win' | 'lose' | 'error' | 'start' | 'tick' | 'tickUrgent';

const SOURCES: Record<SoundName, number> = {
  tap: require('../../assets/sounds/tap.wav'),
  select: require('../../assets/sounds/select.wav'),
  deal: require('../../assets/sounds/deal.wav'),
  chip: require('../../assets/sounds/chip.wav'),
  check: require('../../assets/sounds/check.wav'),
  fold: require('../../assets/sounds/fold.wav'),
  turn: require('../../assets/sounds/turn.wav'),
  coins: require('../../assets/sounds/coins.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
  error: require('../../assets/sounds/error.wav'),
  start: require('../../assets/sounds/start.wav'),
  tick: require('../../assets/sounds/tick.wav'),
  tickUrgent: require('../../assets/sounds/tickUrgent.wav'),
};

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let enabled = true;
let volume = 1;
let initialized = false;
const reportedSoundErrors = new Set<string>();

const reportSoundError = (operation: string, error: unknown, name?: SoundName): void => {
  const key = `${operation}:${name ?? 'global'}`;
  if (reportedSoundErrors.has(key)) return;
  reportedSoundErrors.add(key);
  captureError(error, { tags: { area: 'sound', operation, ...(name ? { sound: name } : {}) } });
};

async function init() {
  if (initialized) return;
  initialized = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
  } catch (error) {
    reportSoundError('set-audio-mode', error);
  }
  (Object.keys(SOURCES) as SoundName[]).forEach((name) => {
    try {
      players[name] = createAudioPlayer(SOURCES[name]);
    } catch (error) {
      reportSoundError('create-audio-player', error, name);
    }
  });
}

export const sound = {
  configure(opts: { enabled?: boolean; volume?: number }) {
    if (typeof opts.enabled === 'boolean') enabled = opts.enabled;
    if (typeof opts.volume === 'number') volume = Math.max(0, Math.min(1, opts.volume));
  },
  prepare() {
    void init();
  },
  play(name: SoundName) {
    if (!enabled) return;
    void init();
    const p = players[name];
    if (!p) return;
    try {
      p.volume = volume;
      p.seekTo(0);
      p.play();
    } catch (error) {
      reportSoundError('play', error, name);
    }
  },
};
