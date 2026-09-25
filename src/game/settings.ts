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
  startingStack: number;

  // Table
  maxPlayers: number;
  numOpponents: number;

  // Timing
  turnTimerSec: number;

  // Bots & difficulty
  difficulty: Difficulty;
  botSpeed: 'slow' | 'normal' | 'fast';
  mixedDifficulty: boolean;

  // Table appearance
  cardBack: 'blue' | 'red' | 'black' | 'holo' | 'retro';
  cardFace: 'classic' | 'large' | 'fourcolor' | 'minimal';
  showAvatarNames: boolean;

  // Sound & haptics
  soundEnabled: boolean;
  soundVolume: number;
  hapticsEnabled: boolean;
  winFanfare: boolean;

  // Animations
  animationSpeed: 'slow' | 'normal' | 'fast' | 'off';
  avatarIdleMotion: boolean;
  reduceMotion: boolean;

  // Accessibility
  largeText: boolean;

  // Social & chat
  roomVisibility: 'public' | 'private';

  // Advanced
  autoMuck: boolean;
  confirmFoldWhenCheckAvailable: boolean;
  showLiveStats: boolean;

  // House rules
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  smallBlind: 10,
  bigBlind: 20,
  ante: 0,
  startingStack: 2000,

  maxPlayers: 6,
  numOpponents: 5,

  turnTimerSec: 20,

  difficulty: 'medium',
  botSpeed: 'normal',
  mixedDifficulty: false,

  cardBack: 'blue',
  cardFace: 'classic',
  showAvatarNames: true,

  soundEnabled: true,
  soundVolume: 80,
  hapticsEnabled: true,
  winFanfare: true,

  animationSpeed: 'normal',
  avatarIdleMotion: true,
  reduceMotion: false,

  largeText: false,

  roomVisibility: 'private',

  autoMuck: true,
  confirmFoldWhenCheckAvailable: true,
  showLiveStats: true,

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
      { key: 'roomVisibility', label: 'Room', type: 'select', help: 'Public tables are listed for anyone to join. Private tables are only shown to your friends. Whoever opens a table deals its cards, so open public tables only if you are happy for strangers to sit down.', options: [{ value: 'private', label: 'Private' }, { value: 'public', label: 'Public' }] },
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
