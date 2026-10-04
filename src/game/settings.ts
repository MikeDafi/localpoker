import type { Difficulty } from '../engine/bot';
import { GAME_MODE_OPTIONS, isGameMode, settingsForMode as settingsForKnownMode, type GameMode } from './gameMode';
import {
  CARD_BACK_PALETTES,
  CHIP_PALETTES,
  CLASSIC_CARD_BACK,
  CLASSIC_CHIPS,
  CLASSIC_FELT,
  FELT_PALETTES,
  STARTER_CARD_BACKS,
} from './cosmetics';

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
  modes?: readonly GameMode[];
}

export interface SettingsSection {
  id: string;
  title: string;
  icon: string;
  fields: SettingField[];
}

type SettingOption = NonNullable<SettingField['options']>[number];

export interface GameSettings {
  // Mode
  gameMode: GameMode;

  // Blinds & stakes
  smallBlind: number;
  bigBlind: number;
  ante: number;
  blindLevelLengthHands: number;
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
  cardBack: string;
  /**
   * The felt and the chips, as properties of the table rather than of the
   * player looking at it, so naming one pins the table to it and that choice
   * carries to everyone in an online room.
   *
   * These used to default to 'equipped', which followed whatever was worn in
   * the Store. That was one indirection too many: the setting said "Equipped"
   * and you had to go to another screen to find out what that meant. The
   * picker now lists the actual felts and chips you own. Older saves may
   * still carry 'equipped', so `normalizeSettings` maps it back to defaults
   * before setup renders.
   */
  feltStyle: string;
  chipStyle: string;
  cardFace: 'classic' | 'large' | 'fourcolor' | 'minimal';

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
  /**
   * Whether to notify about friend requests and table invites. Off until the
   * player turns it on, because enabling it publishes a push token that lets
   * friends reach this device.
   */
  pushNotifications: boolean;

  // Advanced
  autoMuck: boolean;
  confirmFoldWhenCheckAvailable: boolean;
  showLiveStats: boolean;

  // House rules
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  gameMode: 'cash',

  smallBlind: 10,
  bigBlind: 20,
  ante: 0,
  blindLevelLengthHands: 0,
  startingStack: 2000,

  maxPlayers: 6,
  numOpponents: 5,

  turnTimerSec: 20,

  difficulty: 'medium',
  botSpeed: 'normal',
  mixedDifficulty: false,

  cardBack: CLASSIC_CARD_BACK,
  feltStyle: CLASSIC_FELT,
  chipStyle: CLASSIC_CHIPS,
  cardFace: 'classic',

  soundEnabled: true,
  soundVolume: 80,
  hapticsEnabled: true,
  winFanfare: true,

  animationSpeed: 'normal',
  avatarIdleMotion: true,
  reduceMotion: false,

  largeText: false,

  roomVisibility: 'private',
  pushNotifications: false,

  autoMuck: true,
  confirmFoldWhenCheckAvailable: true,
  showLiveStats: true,

};

export const BLIND_LEVEL_LENGTH_HANDS_BY_MODE: Record<GameMode, number> = {
  cash: 0,
  tournament: 10,
  turbo: 4,
};

export function defaultBlindLevelLengthHands(mode: GameMode): number {
  return BLIND_LEVEL_LENGTH_HANDS_BY_MODE[mode];
}

export function settingsForModeDefaults(settings: GameSettings, mode: GameMode): GameSettings {
  const withMode = settingsForKnownMode(settings, mode);
  const blindLevelLengthHands = defaultBlindLevelLengthHands(mode);
  if (mode === 'cash') return { ...withMode, gameMode: mode, ante: 0, blindLevelLengthHands };
  return { ...withMode, gameMode: mode, blindLevelLengthHands };
}

export const SETTINGS_SCHEMA: SettingsSection[] = [
  {
    id: 'table', title: 'Table', icon: '🎲',
    fields: [
      { key: 'gameMode', label: 'Game Mode', type: 'select', help: 'Cash has a buy-in and fixed blinds. Tournament modes publish a hand-based blind schedule and busted players are out.', options: GAME_MODE_OPTIONS },
      { key: 'smallBlind', label: 'Small Blind', type: 'number', min: 1, max: 100000, step: 1, help: 'Cash uses this as the fixed small blind. Tournament modes use it as level one.' },
      { key: 'bigBlind', label: 'Big Blind', type: 'number', min: 2, max: 200000, step: 1, help: 'Cash uses this as the fixed big blind. Tournament modes use it as level one.' },
      { key: 'ante', label: 'Starting Ante', type: 'number', min: 0, max: 100000, step: 1, modes: ['tournament', 'turbo'], help: 'Tournament-only. Cash setup hides this so an old ante cannot change a cash table.' },
      { key: 'blindLevelLengthHands', label: 'Level Length', type: 'number', min: 1, max: 100, step: 1, modes: ['tournament', 'turbo'], help: 'Hands per blind level. All clients derive the same level from the shared hand number.' },
      { key: 'startingStack', label: 'Buy-In / Stack', type: 'number', min: 100, max: 1000000, step: 100 },
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
    id: 'social', title: 'Friends', icon: '👥',
    fields: [
      { key: 'pushNotifications', label: 'Notify me', type: 'toggle', help: 'Get a notification when a friend adds you or opens a table. Turning this on lets your friends\u2019 devices reach yours; turning it off stops that immediately.' },
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
      { key: 'cardBack', label: 'Card Back', type: 'select', help: 'The back printed on every card at this table. Anything you own from the Store shows up here, and everyone in an online room sees the host\u2019s choice.', options: [{ value: 'blue', label: 'Blue' }, { value: 'red', label: 'Red' }, { value: 'black', label: 'Black' }, { value: 'holo', label: 'Holo' }, { value: 'retro', label: 'Retro' }, { value: 'card-sunrise', label: 'Sunrise' }, { value: 'card-nebula', label: 'Neon Nebula' }, { value: 'card-royal-holo', label: 'Royal Holo' }, { value: 'card-lucky-koi', label: 'Lucky Koi' }, { value: 'card-midnight', label: 'Midnight Matrix' }] },
      { key: 'feltStyle', label: 'Felt', type: 'select', help: 'The cloth this table is played on. Anything you own from the Store shows up here, and everyone in an online room sees the host\u2019s choice.', options: [{ value: 'classic', label: 'Classic' }, { value: 'table-emerald', label: 'Emerald' }, { value: 'table-miami', label: 'Miami' }, { value: 'table-velvet', label: 'Velvet' }, { value: 'table-sakura', label: 'Sakura' }, { value: 'table-lunar', label: 'Lunar' }] },
      { key: 'chipStyle', label: 'Chips', type: 'select', help: 'The chip set used for every bet at this table. Anything you own from the Store shows up here.', options: [{ value: 'classic', label: 'Classic' }, { value: 'chips-candy', label: 'Candy' }, { value: 'chips-obsidian', label: 'Obsidian' }, { value: 'chips-circuit', label: 'Circuit' }, { value: 'chips-diamond', label: 'Diamond' }, { value: 'chips-golden-tiki', label: 'Golden Tiki' }] },
    ],
  },
  {
    id: 'a11y', title: 'Accessibility', icon: '♿',
    fields: [
      { key: 'largeText', label: 'Large Text', type: 'toggle', help: 'Bigger type across menus and the table.' },
    ],
  },
];

export function shouldShowGameSetupField(field: SettingField, input: {
  gameMode: GameMode;
  isFriends: boolean;
}): boolean {
  if ((DEVICE_ONLY_SETTINGS as readonly string[]).includes(String(field.key))) return false;
  if (field.modes && !field.modes.includes(input.gameMode)) return false;
  if (field.key === 'roomVisibility') return input.isFriends;
  return !(input.isFriends && field.key === 'numOpponents');
}

export function gameSetupSectionsForMode(gameMode: GameMode, isFriends = false): SettingsSection[] {
  const mode = isGameMode(gameMode) ? gameMode : DEFAULT_GAME_SETTINGS.gameMode;
  return SETTINGS_SCHEMA.filter((s) => {
    if (['sound', 'animations', 'a11y'].includes(s.id)) return false;
    if (isFriends && s.id === 'bots') return false;
    return true;
  })
    .map((s) => ({
      ...s,
      fields: s.fields.filter((field) => shouldShowGameSetupField(field, { gameMode: mode, isFriends })),
    }))
    .filter((s) => s.fields.length > 0);
}

const APPEARANCE_SETTING_KEYS = ['cardBack', 'feltStyle', 'chipStyle'] as const;

function isKnownSettingOption(key: keyof GameSettings, value: unknown): boolean {
  const field = SETTINGS_SCHEMA
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.key === key);
  return field?.options?.some((option) => option.value === value) ?? false;
}

export function normalizeSettings(s?: Partial<GameSettings> | null): GameSettings {
  const merged = { ...DEFAULT_GAME_SETTINGS, ...(s ?? {}) } as GameSettings & Record<string, unknown>;
  delete merged.showAvatarNames;
  if (!isGameMode(merged.gameMode)) merged.gameMode = DEFAULT_GAME_SETTINGS.gameMode;
  const rawLevelLength = Number((s as Partial<GameSettings> | null | undefined)?.blindLevelLengthHands);
  merged.blindLevelLengthHands = merged.gameMode === 'cash'
    ? 0
    : Math.max(
      1,
      Math.min(
        100,
        Math.round(rawLevelLength >= 1 ? rawLevelLength : defaultBlindLevelLengthHands(merged.gameMode)),
      ),
    );
  if (merged.gameMode === 'cash') merged.ante = 0;
  if (merged.bigBlind < merged.smallBlind) merged.bigBlind = merged.smallBlind * 2;
  merged.numOpponents = Math.max(1, Math.min(8, merged.numOpponents));
  merged.maxPlayers = Math.max(merged.numOpponents + 1, merged.maxPlayers);
  for (const key of APPEARANCE_SETTING_KEYS) {
    if (typeof merged[key] !== 'string' || !isKnownSettingOption(key, merged[key])) {
      merged[key] = DEFAULT_GAME_SETTINGS[key];
    }
  }
  return merged;
}

const COSMETIC_SETTING_ACCESS: Partial<Record<keyof GameSettings, {
  known: Record<string, unknown>;
  freeIds: readonly string[];
}>> = {
  cardBack: { known: CARD_BACK_PALETTES, freeIds: STARTER_CARD_BACKS },
  feltStyle: { known: FELT_PALETTES, freeIds: [CLASSIC_FELT] },
  chipStyle: { known: CHIP_PALETTES, freeIds: [CLASSIC_CHIPS] },
};

export function availableSettingOptions(
  field: SettingField,
  ownedCosmeticIds: readonly string[] = [],
): readonly SettingOption[] {
  const options = field.options ?? [];
  const access = COSMETIC_SETTING_ACCESS[field.key];
  if (!access) return options;

  const usable = new Set<string>(access.freeIds);
  for (const id of ownedCosmeticIds) {
    if (id in access.known) usable.add(id);
  }
  return options.filter((option) => typeof option.value !== 'string' || usable.has(option.value));
}

export function resolveSettingSelection(
  field: SettingField,
  value: unknown,
  ownedCosmeticIds: readonly string[] = [],
): SettingOption['value'] | null {
  const options = availableSettingOptions(field, ownedCosmeticIds);
  if (options.length === 0) return null;
  if (options.some((option) => option.value === value)) return value as SettingOption['value'];

  const defaultValue = DEFAULT_GAME_SETTINGS[field.key];
  if (options.some((option) => option.value === defaultValue)) return defaultValue as SettingOption['value'];
  return options[0].value;
}

/**
 * Preferences that describe this device, not the game being played.
 *
 * `GameSettings` doubles as the app's whole settings model and as the payload
 * published to a room, so anything in it is readable by everyone at the table.
 * These keys have no bearing on how a hand plays, so they are stripped before
 * the settings travel.
 */
export const DEVICE_ONLY_SETTINGS = ['pushNotifications'] as const;

/** The settings payload a room publishes, minus anything device-local. */
export function roomSettingsJson(settings: GameSettings): string {
  const shared: Partial<GameSettings> = { ...settings };
  for (const key of DEVICE_ONLY_SETTINGS) delete shared[key];
  return JSON.stringify(shared);
}

export function countSettings(): number {
  return SETTINGS_SCHEMA.reduce((n, s) => n + s.fields.length, 0);
}
