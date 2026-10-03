import { colors } from '../theme/theme';

/**
 * What a bought felt or chip set actually changes.
 *
 * The store has sold tables and chip styles since it opened, and equipping
 * one did nothing: the purchase was recorded, the tick appeared, and the felt
 * stayed exactly the same green. This is the missing half, the part that says
 * what each of those names is in colours.
 *
 * It is deliberately data rather than components. A felt is five colours and
 * a chip set is six, so the renderers can stay dumb and the palettes can be
 * tested without one.
 */

export interface FeltPalette {
  /** The lit face of the cloth, the darker body, and the shadowed edge. */
  light: string;
  base: string;
  deep: string;
  /** The rail around it, and the top-lit sliver along its inside edge. */
  rail: string;
  railEdge: string;
}

export interface ChipPalette {
  /** Face and edge for each denomination, highest first. */
  gold: [string, string];
  purple: [string, string];
  black: [string, string];
  green: [string, string];
  red: [string, string];
  white: [string, string];
}

/**
 * What a card back is printed in.
 *
 * The artwork itself is generated, not stored: `cardBackPattern.ts` draws the
 * lattice and the rosette from geometry, so a new back is this handful of
 * colours rather than an image.
 */
export interface CardBackPalette {
  /** Gradient run across the card: top-left, middle, bottom-right. */
  gradient: readonly [string, string, string];
  rim: string;
  panel: string;
  emblemFill: string;
  emblemStroke: string;
  mark: string;
  /** The engraved lattice and rosette printed across the card. */
  line: string;
  /** The glyph in the middle, so backs differ in shape and not only in hue. */
  glyph: string;
}

/** The felt the game has always had, and what anything unknown falls back to. */
export const CLASSIC_FELT = 'classic';
export const CLASSIC_CHIPS = 'classic';
export const CLASSIC_CARD_BACK = 'blue';

/**
 * Keyed by the store item id, so a purchase and its palette cannot drift
 * apart: an item in the shop with no entry here would be sellable and have no
 * effect, which is exactly the bug this file exists to fix.
 */
export const FELT_PALETTES: Record<string, FeltPalette> = {
  [CLASSIC_FELT]: {
    light: colors.feltLight,
    base: colors.felt,
    deep: colors.feltDeep,
    rail: colors.feltRail,
    railEdge: colors.feltRailEdge,
  },
  'table-emerald': {
    light: '#2E6B4F', base: '#17533A', deep: '#0C3B28', rail: '#07271A', railEdge: '#3C8A68',
  },
  'table-miami': {
    light: '#1BA3B8', base: '#0E7E92', deep: '#07566A', rail: '#06303D', railEdge: '#2FC7D8',
  },
  'table-velvet': {
    light: '#5B2E8C', base: '#44206B', deep: '#2C1247', rail: '#190926', railEdge: '#8B5CC7',
  },
  'table-sakura': {
    light: '#9C4472', base: '#7A2F58', deep: '#541C3B', rail: '#331122', railEdge: '#D881AC',
  },
  'table-lunar': {
    light: '#2A3550', base: '#1B2238', deep: '#0F1423', rail: '#070A12', railEdge: '#5B6B96',
  },
};

export const CHIP_PALETTES: Record<string, ChipPalette> = {
  [CLASSIC_CHIPS]: {
    gold: [colors.chipGold, '#B8860B'],
    purple: [colors.chipPurple, '#5B3AA0'],
    black: [colors.chipBlack, '#000000'],
    green: [colors.chipGreen, '#186B3D'],
    red: [colors.chipRed, '#A82C22'],
    white: [colors.chipWhite, '#B8C4CC'],
  },
  'chips-candy': {
    gold: ['#FFD98C', '#D9A441'], purple: ['#C9A2F5', '#8A63C7'], black: ['#6E7FA8', '#45537A'],
    green: ['#9DE8C0', '#4FAE84'], red: ['#FFA8C2', '#D46C8B'], white: ['#FFF4FA', '#D9C3CE'],
  },
  'chips-obsidian': {
    gold: ['#D7B45A', '#8A6A1E'], purple: ['#5A4B7A', '#352B4C'], black: ['#15171C', '#000000'],
    green: ['#2C6B52', '#13402F'], red: ['#8C2F2A', '#521714'], white: ['#C9CDD4', '#8A9098'],
  },
  'chips-circuit': {
    gold: ['#C9F24A', '#7FA018'], purple: ['#9B6CFF', '#5B36B8'], black: ['#10161C', '#030507'],
    green: ['#2BE3A0', '#129164'], red: ['#FF5C7A', '#B02742'], white: ['#D8F6FF', '#8FB8C7'],
  },
  'chips-diamond': {
    gold: ['#F3DF9A', '#C2A044'], purple: ['#BFA6E8', '#7E63B5'],
    black: ['#2B3038', '#10131A'], green: ['#A9E3CB', '#5E9B84'],
    red: ['#F0A8B4', '#B86577'], white: ['#FFFFFF', '#C8D2DA'],
  },
  'chips-golden-tiki': {
    gold: ['#FFC94A', '#B07A10'], purple: ['#A3703F', '#6B4420'], black: ['#3B2512', '#1A0F06'],
    green: ['#67A845', '#35611F'], red: ['#E2693A', '#9B3C18'], white: ['#F6E7C8', '#C9B48C'],
  },
};

/**
 * Every card back, the five the game shipped with and the five the store
 * sells. Keyed by id for the same reason as the felts: a back on sale with no
 * entry here would take someone's coins and change nothing.
 *
 * The dark backs carry white line work and the light ones carry ink, because
 * white engraving on cream is invisible.
 */
const WHITE_INK = {
  rim: 'rgba(255,255,255,0.5)',
  panel: 'rgba(255,255,255,0.4)',
  emblemFill: 'rgba(255,255,255,0.14)',
  emblemStroke: 'rgba(255,255,255,0.45)',
  mark: 'rgba(255,255,255,0.9)',
  line: 'rgba(255,255,255,0.4)',
};

export const CARD_BACK_PALETTES: Record<string, CardBackPalette> = {
  [CLASSIC_CARD_BACK]: {
    gradient: [colors.cardBackEdge, colors.cardBack, colors.cardBackDeep],
    ...WHITE_INK,
    glyph: '♠',
  },
  red: { gradient: ['#B4394A', '#8E1F32', '#5E0F1F'], ...WHITE_INK, glyph: '♥' },
  black: {
    gradient: ['#4A4F58', '#282C33', '#14171B'],
    rim: 'rgba(255,255,255,0.42)',
    panel: 'rgba(255,255,255,0.32)',
    emblemFill: 'rgba(255,255,255,0.10)',
    emblemStroke: 'rgba(255,255,255,0.38)',
    mark: 'rgba(255,255,255,0.82)',
    line: 'rgba(255,255,255,0.3)',
    glyph: '♣',
  },
  holo: {
    gradient: ['#6ED8D0', '#7A5CE0', '#2C1B6B'],
    rim: 'rgba(255,255,255,0.62)',
    panel: 'rgba(255,255,255,0.5)',
    emblemFill: 'rgba(255,255,255,0.2)',
    emblemStroke: 'rgba(255,255,255,0.6)',
    mark: 'rgba(255,255,255,0.95)',
    line: 'rgba(255,255,255,0.5)',
    glyph: '◆',
  },
  retro: {
    gradient: ['#F3DCAE', '#E0B978', '#B9844A'],
    rim: 'rgba(92,58,20,0.45)',
    panel: 'rgba(92,58,20,0.38)',
    emblemFill: 'rgba(92,58,20,0.12)',
    emblemStroke: 'rgba(92,58,20,0.42)',
    mark: 'rgba(72,44,14,0.85)',
    line: 'rgba(92,58,20,0.34)',
    glyph: '♦',
  },

  // The store's five.
  'card-sunrise': {
    gradient: ['#FFD8A8', '#FB923C', '#C2410C'],
    rim: 'rgba(90,40,8,0.42)',
    panel: 'rgba(90,40,8,0.34)',
    emblemFill: 'rgba(255,245,230,0.3)',
    emblemStroke: 'rgba(90,40,8,0.4)',
    mark: 'rgba(84,34,6,0.88)',
    line: 'rgba(96,42,10,0.32)',
    glyph: '☀',
  },
  'card-nebula': {
    gradient: [colors.accentPink, colors.accent, '#1B1040'],
    rim: 'rgba(255,255,255,0.6)',
    panel: 'rgba(255,255,255,0.46)',
    emblemFill: 'rgba(255,255,255,0.18)',
    emblemStroke: 'rgba(255,255,255,0.55)',
    mark: 'rgba(255,255,255,0.95)',
    line: 'rgba(235,225,255,0.5)',
    glyph: '✦',
  },
  'card-royal-holo': {
    gradient: [colors.blue, colors.blueDeep, '#07152E'],
    rim: 'rgba(240,206,122,0.72)',
    panel: 'rgba(240,206,122,0.55)',
    emblemFill: 'rgba(240,206,122,0.16)',
    emblemStroke: 'rgba(240,206,122,0.6)',
    mark: 'rgba(248,226,160,0.95)',
    line: 'rgba(240,206,122,0.42)',
    glyph: '♛',
  },
  'card-lucky-koi': {
    gradient: ['#FFF1D6', '#FF7A59', '#B23A24'],
    rim: 'rgba(96,28,14,0.45)',
    panel: 'rgba(96,28,14,0.36)',
    emblemFill: 'rgba(255,248,236,0.32)',
    emblemStroke: 'rgba(96,28,14,0.42)',
    mark: 'rgba(88,24,12,0.88)',
    line: 'rgba(104,32,16,0.34)',
    glyph: '❀',
  },
  'card-midnight': {
    gradient: ['#1F2937', '#111827', '#03060C'],
    rim: 'rgba(96,230,200,0.55)',
    panel: 'rgba(96,230,200,0.4)',
    emblemFill: 'rgba(96,230,200,0.12)',
    emblemStroke: 'rgba(96,230,200,0.45)',
    mark: 'rgba(150,245,220,0.9)',
    line: 'rgba(96,230,200,0.34)',
    glyph: '⬢',
  },
};

/**
 * Which felt a table should use.
 *
 * The game's own setting wins, because a felt is a property of the table
 * rather than of the person looking at it: everyone sitting at one should see
 * the same cloth. `equipped` defers to whatever was last equipped in the
 * store, which is what most people will want and what the store implies.
 *
 * Anything unrecognised, or equipped-but-not-owned, falls back to the classic
 * green rather than failing. A cosmetic is not worth an error, and a saved
 * game from a build that had a felt this one does not must still open.
 */
export function resolveFelt(input: {
  setting?: string;
  equippedId?: string;
  owned?: readonly string[];
}): FeltPalette {
  return FELT_PALETTES[pickStyle(input, FELT_PALETTES, CLASSIC_FELT)]!;
}

export function resolveChips(input: {
  setting?: string;
  equippedId?: string;
  owned?: readonly string[];
}): ChipPalette {
  return CHIP_PALETTES[pickStyle(input, CHIP_PALETTES, CLASSIC_CHIPS)]!;
}

/**
 * Which back the cards are printed with.
 *
 * Unlike a felt, this is genuinely per-table rather than per-viewer for the
 * same reason: everyone is looking at the same deck.
 */
export function resolveCardBack(input: {
  setting?: string;
  equippedId?: string;
  owned?: readonly string[];
}): string {
  return pickStyle(input, CARD_BACK_PALETTES, CLASSIC_CARD_BACK);
}

/** The id a table settles on, exported so the host can publish it to a room. */
export function pickStyle(
  input: { setting?: string; equippedId?: string; owned?: readonly string[] },
  known: Record<string, unknown>,
  fallback: string,
): string {
  const ownedSet = new Set(input.owned ?? []);
  const usable = (id?: string): id is string =>
    !!id && id !== 'equipped' && id in known && (id === fallback || ownedSet.has(id));

  if (input.setting && input.setting !== 'equipped') {
    return usable(input.setting) ? input.setting : fallback;
  }
  return usable(input.equippedId) ? input.equippedId : fallback;
}

/** What the Store has recorded: what is owned, and what is worn per category. */
export interface CosmeticsState {
  ownedCosmeticIds: string[];
  equippedByCategory: Record<string, string>;
}

export const emptyCosmetics: CosmeticsState = { ownedCosmeticIds: [], equippedByCategory: {} };

/**
 * Read the stored cosmetics without trusting them.
 *
 * Deliberately lenient about which ids it keeps: `resolveFelt` and
 * `resolveChips` already refuse anything unknown or unowned, so filtering
 * here as well would mean two places that have to agree about the catalogue,
 * and the one further from the renderer would be the one to go stale.
 */
export function readCosmetics(raw: string | null | undefined): CosmeticsState {
  if (!raw) return emptyCosmetics;
  try {
    const parsed = JSON.parse(raw) as Partial<CosmeticsState>;
    const owned = Array.isArray(parsed.ownedCosmeticIds)
      ? parsed.ownedCosmeticIds.filter((id): id is string => typeof id === 'string')
      : [];
    const equipped: Record<string, string> = {};
    for (const [category, id] of Object.entries(parsed.equippedByCategory ?? {})) {
      if (typeof id === 'string') equipped[category] = id;
    }
    return { ownedCosmeticIds: owned, equippedByCategory: equipped };
  } catch {
    return emptyCosmetics;
  }
}

/**
 * Settle 'equipped' into a real id before a room is published.
 *
 * A room carries the host's settings, and 'equipped' is not a felt, it is an
 * instruction to go and look in a closet. Published as-is, every guest would
 * follow that instruction into their *own* closet and a table would be a
 * different colour for everyone sitting at it. Resolving it on the host makes
 * the published setting the actual felt, which is the thing that travels.
 */
export function pinCosmetics<
  T extends { feltStyle?: string; chipStyle?: string; cardBack?: string },
>(
  settings: T,
  cosmetics: { ownedCosmeticIds?: readonly string[]; equippedByCategory?: Record<string, string> },
): T {
  const owned = cosmetics.ownedCosmeticIds ?? [];
  const equipped = cosmetics.equippedByCategory ?? {};
  return {
    ...settings,
    feltStyle: pickStyle(
      { setting: settings.feltStyle, equippedId: equipped.tables, owned },
      FELT_PALETTES,
      CLASSIC_FELT,
    ),
    chipStyle: pickStyle(
      { setting: settings.chipStyle, equippedId: equipped.chips, owned },
      CHIP_PALETTES,
      CLASSIC_CHIPS,
    ),
    cardBack: pickStyle(
      { setting: settings.cardBack, equippedId: equipped.cardBacks, owned },
      CARD_BACK_PALETTES,
      CLASSIC_CARD_BACK,
    ),
  };
}
