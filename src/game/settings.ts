import type { Difficulty } from '../engine/bot';

/**
 * Comprehensive, schema-driven game settings.
 *
 * `GameSettings` is the typed value object the Table consumes. `SETTINGS_SCHEMA`
 * is metadata the Game Setup screen renders generically, so we can expose ~100
 * tunable options without hand-writing each control. Keep keys in sync.
 */

export type FieldType = 'toggle' | 'select' | 'number' | 'slider';

export interface SettingField {
  key: keyof GameSettings;
  label: string;
  type: FieldType;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string | number; label: string }[];
  premium?: boolean;
}

export interface SettingsSection {
  id: string;
  title: string;
  icon: string;
  fields: SettingField[];
}

export interface GameSettings {
  // Blinds & stakes
  smallBlind: number;
  bigBlind: number;
  ante: number;
  bigBlindAnte: boolean;
  startingStack: number;
  minBuyInBB: number;
  maxBuyInBB: number;
  currency: 'chips' | 'coins';
  straddle: boolean;
  straddleType: 'utg' | 'button' | 'mississippi';

  // Table
  gameType: 'holdem' | 'omaha' | 'shortdeck';
  maxPlayers: number;
  numOpponents: number;
  tableSpeed: 'slow' | 'normal' | 'turbo' | 'hyper';
  seating: 'random' | 'choose';
  dealerButtonRule: 'standard' | 'deadbutton';

  // Timing
  turnTimerSec: number;
  timeBankSec: number;
  timeBankPerHand: number;
  autoTimeExtension: boolean;
  showClock: boolean;
  blindIncreaseEveryHands: number;
  blindIncreasePct: number;

  // Gameplay variants
  runItTwice: boolean;
  rabbitHunt: boolean;
  bombPots: boolean;
  bombPotEveryHands: number;
  sevenTwoBonus: boolean;
  allInInsurance: boolean;
  chopBlinds: boolean;
  postingRule: 'standard' | 'nopost';
  muckLosingHands: boolean;
  showOneCardOnFold: boolean;

  // Bots & difficulty
  difficulty: Difficulty;
  botAggression: number;
  botSpeed: 'slow' | 'normal' | 'fast';
  botChatter: boolean;
  adaptiveDifficulty: boolean;
  mixedDifficulty: boolean;

  // Table appearance
  feltPattern: 'plain' | 'speckle' | 'logo' | 'grid';
  cardBack: 'blue' | 'red' | 'black' | 'holo' | 'retro';
  cardFace: 'classic' | 'large' | 'fourcolor' | 'minimal';
  chipStyle: 'classic' | 'neon' | 'wood' | 'ceramic';
  showAvatars: boolean;
  showAvatarNames: boolean;
  showStackInBB: boolean;

  // Sound & haptics
  soundEnabled: boolean;
  soundVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
  hapticsEnabled: boolean;
  dealerVoice: boolean;
  winFanfare: boolean;

  // Animations
  animationSpeed: 'slow' | 'normal' | 'fast' | 'off';
  cardDealAnimation: boolean;
  chipAnimation: boolean;
  avatarIdleMotion: boolean;
  avatarReactions: boolean;
  reduceMotion: boolean;

  // Accessibility
  largeText: boolean;
  leftHandedLayout: boolean;
  fourColorDeck: boolean;
  alwaysShowOdds: boolean;

  // Social & chat
  chatEnabled: boolean;
  emotesEnabled: boolean;
  quickChatOnly: boolean;
  allowSpectators: boolean;
  friendsOnly: boolean;
  roomVisibility: 'public' | 'private';

  // Advanced
  autoMuck: boolean;
  autoRebuy: boolean;
  autoRebuyThresholdBB: number;
  sitOutNextHand: boolean;
  waitForBigBlind: boolean;
  confirmFoldWhenCheckAvailable: boolean;
  handHistory: boolean;
  showdownAllHands: boolean;
  showLiveStats: boolean;

  // Tournament
  tournamentMode: boolean;
  startingLevel: number;
  levelDurationMin: number;
  reEntryAllowed: boolean;
  maxReEntries: number;
  rebuyPeriodLevels: number;
  addOnAllowed: boolean;
  payoutStructure: 'winner' | 'top3' | 'top10pct' | 'flat';
  bountyMode: boolean;
  bountyPct: number;

  // House rules
  capNoLimit: boolean;
  betCapBB: number;
  minRaiseRule: 'standard' | 'double';
  stringBetProtection: boolean;
  allowCheckRaise: boolean;
  showMuckedAtShowdown: boolean;
  penaltyOnDisconnect: boolean;
  disconnectProtection: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  smallBlind: 10,
  bigBlind: 20,
  ante: 0,
  bigBlindAnte: false,
  startingStack: 2000,
  minBuyInBB: 40,
  maxBuyInBB: 250,
  currency: 'chips',
  straddle: false,
  straddleType: 'utg',

  gameType: 'holdem',
  maxPlayers: 6,
  numOpponents: 5,
  tableSpeed: 'normal',
  seating: 'random',
  dealerButtonRule: 'standard',

  turnTimerSec: 20,
  timeBankSec: 30,
  timeBankPerHand: 0,
  autoTimeExtension: false,
  showClock: true,
  blindIncreaseEveryHands: 0,
  blindIncreasePct: 50,

  runItTwice: false,
  rabbitHunt: false,
  bombPots: false,
  bombPotEveryHands: 10,
  sevenTwoBonus: false,
  allInInsurance: false,
  chopBlinds: false,
  postingRule: 'standard',
  muckLosingHands: true,
  showOneCardOnFold: false,

  difficulty: 'medium',
  botAggression: 50,
  botSpeed: 'normal',
  botChatter: true,
  adaptiveDifficulty: false,
  mixedDifficulty: false,

  feltPattern: 'plain',
  cardBack: 'blue',
  cardFace: 'classic',
  chipStyle: 'classic',
  showAvatars: true,
  showAvatarNames: true,
  showStackInBB: false,

  soundEnabled: true,
  soundVolume: 80,
  musicEnabled: false,
  musicVolume: 40,
  hapticsEnabled: true,
  dealerVoice: false,
  winFanfare: true,

  animationSpeed: 'normal',
  cardDealAnimation: true,
  chipAnimation: true,
  avatarIdleMotion: true,
  avatarReactions: true,
  reduceMotion: false,

  largeText: false,
  leftHandedLayout: false,
  fourColorDeck: false,
  alwaysShowOdds: false,

  chatEnabled: true,
  emotesEnabled: true,
  quickChatOnly: false,
  allowSpectators: true,
  friendsOnly: false,
  roomVisibility: 'private',

  autoMuck: true,
  autoRebuy: false,
  autoRebuyThresholdBB: 20,
  sitOutNextHand: false,
  waitForBigBlind: true,
  confirmFoldWhenCheckAvailable: true,
  handHistory: true,
  showdownAllHands: false,
  showLiveStats: true,

  tournamentMode: false,
  startingLevel: 1,
  levelDurationMin: 10,
  reEntryAllowed: false,
  maxReEntries: 1,
  rebuyPeriodLevels: 4,
  addOnAllowed: false,
  payoutStructure: 'top3',
  bountyMode: false,
  bountyPct: 25,

  capNoLimit: false,
  betCapBB: 100,
  minRaiseRule: 'standard',
  stringBetProtection: true,
  allowCheckRaise: true,
  showMuckedAtShowdown: false,
  penaltyOnDisconnect: false,
  disconnectProtection: true,
};

export const SETTINGS_SCHEMA: SettingsSection[] = [
  {
    id: 'table', title: 'Table', icon: '🎲',
    fields: [
      { key: 'smallBlind', label: 'Small Blind', type: 'number', min: 1, max: 100000, step: 1 },
      { key: 'bigBlind', label: 'Big Blind', type: 'number', min: 2, max: 200000, step: 1 },
      { key: 'ante', label: 'Ante', type: 'number', min: 0, max: 100000, step: 1 },
      { key: 'startingStack', label: 'Starting Stack', type: 'number', min: 100, max: 1000000, step: 100 },
      { key: 'turnTimerSec', label: 'Turn Timer (s)', type: 'slider', min: 5, max: 60, step: 1 },
      { key: 'roomVisibility', label: 'Room', type: 'select', help: 'Public tables are listed for anyone to join. Private tables are only shown to your friends.', options: [{ value: 'private', label: 'Private' }, { value: 'public', label: 'Public' }] },
    ],
  },
  {
    id: 'bots', title: 'Opponents', icon: '🤖',
    fields: [
      { key: 'numOpponents', label: 'Number of Opponents', type: 'slider', min: 1, max: 8, step: 1, help: 'Number of computer opponents in quick play.' },
      { key: 'difficulty', label: 'Difficulty', type: 'select', options: [{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }, { value: 'expert', label: 'Expert' }] },
      { key: 'botSpeed', label: 'Opponent Speed', type: 'select', options: [{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }] },
      { key: 'mixedDifficulty', label: 'Mixed Table', type: 'toggle', help: 'Opponents use a mix of skill levels.' },
    ],
  },
  {
    id: 'ingame', title: 'In-Game', icon: '🎯',
    fields: [
      { key: 'showLiveStats', label: 'Live Stats Overlay', type: 'toggle', help: 'Show VPIP / PFR / win rate during play.' },
      { key: 'autoMuck', label: 'Auto Muck Losers', type: 'toggle' },
      { key: 'confirmFoldWhenCheckAvailable', label: 'Confirm Fold (can check)', type: 'toggle' },
    ],
  },
  {
    id: 'sound', title: 'Sound & Haptics', icon: '🔊',
    fields: [
      { key: 'soundEnabled', label: 'Sound Effects', type: 'toggle' },
      { key: 'soundVolume', label: 'Volume', type: 'slider', min: 0, max: 100, step: 5 },
      { key: 'hapticsEnabled', label: 'Haptics', type: 'toggle' },
      { key: 'winFanfare', label: 'Win Fanfare', type: 'toggle' },
    ],
  },
  {
    id: 'animations', title: 'Animations', icon: '✨',
    fields: [
      { key: 'animationSpeed', label: 'Animation Speed', type: 'select', options: [{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }, { value: 'off', label: 'Off' }] },
      { key: 'avatarIdleMotion', label: 'Avatar Idle Motion', type: 'toggle' },
      { key: 'reduceMotion', label: 'Reduce Motion', type: 'toggle' },
    ],
  },
  {
    id: 'appearance', title: 'Appearance', icon: '🎨',
    fields: [
      { key: 'cardBack', label: 'Card Back', type: 'select', options: [{ value: 'blue', label: 'Blue' }, { value: 'red', label: 'Red' }, { value: 'black', label: 'Black' }, { value: 'holo', label: 'Holo' }, { value: 'retro', label: 'Retro' }] },
      { key: 'showAvatarNames', label: 'Show Names', type: 'toggle' },
    ],
  },
  {
    id: 'a11y', title: 'Accessibility', icon: '♿',
    fields: [
      { key: 'largeText', label: 'Large Text', type: 'toggle', help: 'Bigger type across menus and the table.' },
    ],
  },
];

export function normalizeSettings(s?: Partial<GameSettings> | null): GameSettings {
  const merged = { ...DEFAULT_GAME_SETTINGS, ...(s ?? {}) };
  if (merged.bigBlind < merged.smallBlind) merged.bigBlind = merged.smallBlind * 2;
  merged.numOpponents = Math.max(1, Math.min(8, merged.numOpponents));
  merged.maxPlayers = Math.max(merged.numOpponents + 1, merged.maxPlayers);
  return merged;
}

export function countSettings(): number {
  return SETTINGS_SCHEMA.reduce((n, s) => n + s.fields.length, 0);
}
