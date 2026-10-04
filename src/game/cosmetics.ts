import { colors } from '../theme/theme';
import { GIF_LIBRARY } from '../services/gifs';

/**
 * Pal motions are cosmetics like any other, and they are described in their
 * own file because a motion is a list of poses rather than a list of colours.
 * Re-exported here so a caller that already imports the emote trays gets the
 * third kind from the same place.
 */
export {
  FREE_PAL_MOTION_COSMETIC_IDS,
  PAL_MOTIONS,
  PURCHASABLE_PAL_MOTIONS,
  palMotionByCosmeticId,
  palMotionByMotionId,
  palMotionCosmeticId,
  palMotionDuration,
  resolvePalMotions,
  type PalMotion,
} from './palMotions';

/**
 * What a bought felt or chip set actually changes.
 *
 * The store has sold tables and chip styles since it opened, and equipping
 * one did nothing: the purchase was recorded, the tick appeared, and the felt
 * stayed exactly the same green. This is the missing half, the part that says
 * what each of those names is in colours.
 *
 * It is deliberately data rather than components. A felt is three colours and
 * a chip set is six, so the renderers can stay dumb and the palettes can be
 * tested without one.
 */

export interface FeltPalette {
  /** The lit face of the cloth, the darker body, and the shadowed edge. */
  light: string;
  base: string;
  deep: string;
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

export interface GifCosmetic {
  id: string;
  gifId: string;
  name: string;
  price: number;
  description: string;
  emoji: string;
  swatches: readonly [string, string, string];
  tags: readonly string[];
}

export interface EmojiCosmetic {
  id: string;
  emoji: string;
  name: string;
  price: number;
  description: string;
  swatches: readonly [string, string, string];
}

/** The felt the game has always had, and what anything unknown falls back to. */
export const CLASSIC_FELT = 'classic';
export const CLASSIC_CHIPS = 'classic';
export const CLASSIC_CARD_BACK = 'blue';
export const STARTER_FELTS = [CLASSIC_FELT] as const;
export const STARTER_CHIPS = [CLASSIC_CHIPS] as const;
export const STARTER_CARD_BACKS = [CLASSIC_CARD_BACK, 'red'] as const;

const FREE_GIF_IDS = [
  'l0MYv61yrzZu6roFG',
  'YFH1JUdAdtNkf0kmFL',
  'SsaY6eIIKSJJtPEh6B',
  'l0MYt5jPR6QX5pnqM',
  'vmon3eAOp1WfK',
  'd2lcHJTG5Tscg',
  'XHeLeuirRbwptHhSWd',
  '26ufdipQqU2lhNA4g',
  '5VKbvrjxpVJCM',
  '11tTNkNy1SdXGg',
  'd3mlE7uhX8KFgEmY',
  'MFsqcBSoOKPbjtmvWz',
  'YRuFixSNWFVcXaxpmX',
  'XD4qHZpkyUFfq',
  '111ebonMs90YLu',
  '12XDYvMJNcmLgQ',
] as const;

export const gifCosmeticId = (gifId: string): string => `gif-${gifId}`;
export const FREE_GIF_COSMETIC_IDS = FREE_GIF_IDS.map(gifCosmeticId);

const GIF_TAG_ORDER = [
  'poker',
  'win',
  'sad',
  'laugh',
  'wow',
  'shocked',
  'angry',
  'think',
  'money',
  'clap',
  'facepalm',
  'thumbsup',
  'goodluck',
] as const;

type GifStyleTag = (typeof GIF_TAG_ORDER)[number];

const GIF_TAG_STYLES: Record<GifStyleTag, {
  label: string;
  price: number;
  description: string;
  emoji: string;
  swatches: readonly [string, string, string];
}> = {
  poker: {
    label: 'Poker Reaction',
    price: 450,
    description: 'A table read for the GIF tray.',
    emoji: '🃏',
    swatches: [colors.green, '#064E3B', colors.gold],
  },
  win: {
    label: 'Win Reaction',
    price: 500,
    description: 'A celebration for big pots.',
    emoji: '🎉',
    swatches: [colors.gold, '#F97316', colors.accentPink],
  },
  sad: {
    label: 'Bad Beat',
    price: 300,
    description: 'A soft landing for rough rivers.',
    emoji: '😭',
    swatches: ['#60A5FA', '#1D4ED8', '#E0F2FE'],
  },
  laugh: {
    label: 'Laugh Reaction',
    price: 350,
    description: 'A laugh for friendly chaos.',
    emoji: '😂',
    swatches: ['#FDE68A', '#F59E0B', '#7C2D12'],
  },
  wow: {
    label: 'Wow Reaction',
    price: 450,
    description: 'A big reaction for unreal runouts.',
    emoji: '😮',
    swatches: [colors.accentAlt, colors.blue, '#E0F2FE'],
  },
  shocked: {
    label: 'Shock Reaction',
    price: 450,
    description: 'A stunned look for surprise flips.',
    emoji: '🤯',
    swatches: ['#A855F7', '#4C1D95', '#F5D0FE'],
  },
  angry: {
    label: 'Tilt Reaction',
    price: 400,
    description: 'A safe vent for a spicy beat.',
    emoji: '😤',
    swatches: ['#EF4444', '#7F1D1D', '#FCA5A5'],
  },
  think: {
    label: 'Tank Reaction',
    price: 350,
    description: 'A thinking face for tough spots.',
    emoji: '🤔',
    swatches: ['#94A3B8', '#334155', '#E2E8F0'],
  },
  money: {
    label: 'Money Reaction',
    price: 550,
    description: 'A chip flex for stacked pots.',
    emoji: '💰',
    swatches: [colors.green, colors.gold, '#FDE68A'],
  },
  clap: {
    label: 'Nice Hand',
    price: 300,
    description: 'A respectful nod after showdown.',
    emoji: '👏',
    swatches: ['#FDBA74', '#C2410C', '#FFEDD5'],
  },
  facepalm: {
    label: 'Oops Reaction',
    price: 300,
    description: 'A facepalm for missed clicks and punts.',
    emoji: '🤦',
    swatches: ['#CBD5E1', '#64748B', '#F8FAFC'],
  },
  thumbsup: {
    label: 'Thumbs Up',
    price: 250,
    description: 'A quick yes for table talk.',
    emoji: '👍',
    swatches: [colors.blue, colors.blueDeep, '#DBEAFE'],
  },
  goodluck: {
    label: 'Good Luck',
    price: 250,
    description: 'A friendly send-off before the flop.',
    emoji: '🍀',
    swatches: [colors.green, '#16A34A', '#DCFCE7'],
  },
};

const gifStyleForTags = (tags: readonly string[]): GifStyleTag =>
  GIF_TAG_ORDER.find((tag) => tags.includes(tag)) ?? 'poker';

function buildGifEmotes(): Record<string, GifCosmetic> {
  const counts: Partial<Record<GifStyleTag, number>> = {};
  const out: Record<string, GifCosmetic> = {};
  for (const gif of GIF_LIBRARY) {
    const id = gifCosmeticId(gif.id);
    const styleTag = gifStyleForTags(gif.tags);
    const style = GIF_TAG_STYLES[styleTag];
    const count = (counts[styleTag] ?? 0) + 1;
    counts[styleTag] = count;
    out[id] = {
      id,
      gifId: gif.id,
      name: `${style.label} ${count}`,
      price: style.price,
      description: style.description,
      emoji: style.emoji,
      swatches: style.swatches,
      tags: gif.tags,
    };
  }
  return out;
}

export const GIF_EMOTES = buildGifEmotes();
export const PURCHASABLE_GIF_EMOTES = Object.fromEntries(
  Object.entries(GIF_EMOTES).filter(([id]) => !FREE_GIF_COSMETIC_IDS.includes(id)),
) as Record<string, GifCosmetic>;

const EMOJI_EMOTE_LIST = [
  {
    id: 'emoji-thumbsup',
    emoji: '👍',
    name: 'Nice Hand',
    price: 0,
    description: 'A simple nod for a well played pot.',
    swatches: [colors.blue, colors.blueDeep, '#DBEAFE'],
  },
  {
    id: 'emoji-laugh',
    emoji: '😂',
    name: 'Table Laugh',
    price: 0,
    description: 'A friendly laugh when the table gets silly.',
    swatches: ['#FDE68A', '#F59E0B', '#7C2D12'],
  },
  {
    id: 'emoji-steam',
    emoji: '😤',
    name: 'Steam Vent',
    price: 0,
    description: 'A safe way to show a frustrating beat.',
    swatches: ['#EF4444', '#7F1D1D', '#FCA5A5'],
  },
  {
    id: 'emoji-thinking',
    emoji: '🤔',
    name: 'Thinking',
    price: 0,
    description: 'A tanking face for tough choices.',
    swatches: ['#94A3B8', '#334155', '#E2E8F0'],
  },
  {
    id: 'emoji-sweat-smile',
    emoji: '😅',
    name: 'Close One',
    price: 0,
    description: 'A small oops for awkward runouts.',
    swatches: ['#7DD3FC', '#0284C7', '#E0F2FE'],
  },
  {
    id: 'emoji-clover',
    emoji: '🍀',
    name: 'Good Luck',
    price: 0,
    description: 'A friendly wish before the cards turn.',
    swatches: [colors.green, '#16A34A', '#DCFCE7'],
  },
  {
    id: 'emoji-handshake',
    emoji: '🤝',
    name: 'Thanks',
    price: 0,
    description: 'A quick thanks or good game.',
    swatches: ['#FDBA74', '#92400E', '#FFEDD5'],
  },
  {
    id: 'emoji-wow',
    emoji: '😮',
    name: 'Surprise',
    price: 250,
    description: 'A bigger face for unexpected turns.',
    swatches: [colors.accentAlt, colors.blue, '#E0F2FE'],
  },
  {
    id: 'emoji-cool',
    emoji: '😎',
    name: 'Cool Read',
    price: 350,
    description: 'A shades-on flex after a clean call.',
    swatches: ['#111827', colors.blue, colors.gold],
  },
  {
    id: 'emoji-fire',
    emoji: '🔥',
    name: 'Heater',
    price: 450,
    description: 'A hot-streak marker for loud pots.',
    swatches: ['#F97316', '#EF4444', '#FDE68A'],
  },
  {
    id: 'emoji-party',
    emoji: '🎉',
    name: 'Party Pot',
    price: 400,
    description: 'A celebration for splashy wins.',
    swatches: [colors.gold, colors.accentPink, colors.accentAlt],
  },
  {
    id: 'emoji-raised-hands',
    emoji: '🙌',
    name: 'Hype Hands',
    price: 300,
    description: 'Extra hype when the table erupts.',
    swatches: ['#FDE68A', '#F59E0B', colors.accentPink],
  },
  {
    id: 'emoji-scream',
    emoji: '😱',
    name: 'River Scream',
    price: 350,
    description: 'A dramatic shriek for wild boards.',
    swatches: ['#60A5FA', '#1D4ED8', '#F5D0FE'],
  },
  {
    id: 'emoji-mind-blown',
    emoji: '🤯',
    name: 'Mind Blown',
    price: 500,
    description: 'A premium reaction for unreal reveals.',
    swatches: ['#A855F7', '#4C1D95', '#F5D0FE'],
  },
  {
    id: 'emoji-muscle',
    emoji: '💪',
    name: 'Flex',
    price: 400,
    description: 'A strength pose for confident wins.',
    swatches: ['#FDBA74', '#C2410C', colors.gold],
  },
  {
    id: 'emoji-sleepy',
    emoji: '😴',
    name: 'Sleepy Needle',
    price: 300,
    description: 'A sleepy needle for slow tanks.',
    swatches: ['#93C5FD', '#312E81', '#E0E7FF'],
  },
] as const satisfies readonly EmojiCosmetic[];

export const EMOJI_EMOTES: Record<string, EmojiCosmetic> = Object.fromEntries(
  EMOJI_EMOTE_LIST.map((emoji) => [emoji.id, emoji]),
) as Record<string, EmojiCosmetic>;
export const FREE_EMOJI_COSMETIC_IDS = EMOJI_EMOTE_LIST
  .filter((emoji) => emoji.price === 0)
  .map((emoji) => emoji.id);
export const PURCHASABLE_EMOJI_EMOTES = Object.fromEntries(
  EMOJI_EMOTE_LIST.filter((emoji) => emoji.price > 0).map((emoji) => [emoji.id, emoji]),
) as Record<string, EmojiCosmetic>;
export const LEGACY_EMOJI_GRANT_IDS = Object.keys(PURCHASABLE_EMOJI_EMOTES);
export const LEGACY_EMOJI_GRANT_MIGRATION = 'legacy-emoji-emotes-2026-10-03';

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
  },
  'table-emerald': {
    light: '#2E6B4F', base: '#17533A', deep: '#0C3B28',
  },
  'table-miami': {
    light: '#1BA3B8', base: '#0E7E92', deep: '#07566A',
  },
  'table-velvet': {
    light: '#5B2E8C', base: '#44206B', deep: '#2C1247',
  },
  'table-sakura': {
    light: '#9C4472', base: '#7A2F58', deep: '#541C3B',
  },
  'table-lunar': {
    light: '#2A3550', base: '#1B2238', deep: '#0F1423',
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
 * Every card back, the two new players start with and the rest the store
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
  'card-sunrise': {
    gradient: ['#FFD8A8', '#FB923C', '#C2410C'],
    rim: 'rgba(90,40,8,0.42)',
    panel: 'rgba(90,40,8,0.34)',
    emblemFill: 'rgba(255,245,230,0.3)',
    emblemStroke: 'rgba(90,40,8,0.4)',
    mark: 'rgba(84,34,6,0.88)',
    line: 'rgba(96,42,10,0.32)',
    glyph: '✹',
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
    glyph: '❖',
  },
  'card-lucky-koi': {
    gradient: ['#FFF1D6', '#FF7A59', '#B23A24'],
    rim: 'rgba(96,28,14,0.45)',
    panel: 'rgba(96,28,14,0.36)',
    emblemFill: 'rgba(255,248,236,0.32)',
    emblemStroke: 'rgba(96,28,14,0.42)',
    mark: 'rgba(88,24,12,0.88)',
    line: 'rgba(104,32,16,0.34)',
    glyph: '◉',
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
  return FELT_PALETTES[pickStyle(input, FELT_PALETTES, CLASSIC_FELT, STARTER_FELTS)]!;
}

export function resolveChips(input: {
  setting?: string;
  equippedId?: string;
  owned?: readonly string[];
}): ChipPalette {
  return CHIP_PALETTES[pickStyle(input, CHIP_PALETTES, CLASSIC_CHIPS, STARTER_CHIPS)]!;
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
  return pickStyle(input, CARD_BACK_PALETTES, CLASSIC_CARD_BACK, STARTER_CARD_BACKS);
}

export function resolveGifEmotes(input: {
  owned?: readonly string[];
}): GifCosmetic[] {
  const ownedSet = new Set(input.owned ?? []);
  const freeSet = new Set(FREE_GIF_COSMETIC_IDS);
  return Object.values(GIF_EMOTES).filter((gif) => freeSet.has(gif.id) || ownedSet.has(gif.id));
}

export function resolveEmojiEmotes(input: {
  owned?: readonly string[];
}): string[] {
  const ownedSet = new Set(input.owned ?? []);
  const freeSet = new Set<string>(FREE_EMOJI_COSMETIC_IDS);
  return Object.values(EMOJI_EMOTES)
    .filter((emoji) => freeSet.has(emoji.id) || ownedSet.has(emoji.id))
    .map((emoji) => emoji.emoji);
}

/** The id a table settles on, exported so the host can publish it to a room. */
export function pickStyle(
  input: { setting?: string; equippedId?: string; owned?: readonly string[] },
  known: Record<string, unknown>,
  fallback: string,
  freeIds: readonly string[] = [fallback],
): string {
  const ownedSet = new Set(input.owned ?? []);
  const freeSet = new Set([fallback, ...freeIds]);
  const usable = (id?: string): id is string =>
    !!id && id !== 'equipped' && id in known && (freeSet.has(id) || ownedSet.has(id));

  if (input.setting && input.setting !== 'equipped') {
    return usable(input.setting) ? input.setting : fallback;
  }
  return usable(input.equippedId) ? input.equippedId : fallback;
}

/** What the Store has recorded: what is owned, and what is worn per category. */
export interface CosmeticsState {
  ownedCosmeticIds: string[];
  equippedByCategory: Record<string, string>;
  appliedMigrations?: string[];
}

export const emptyCosmetics: CosmeticsState = { ownedCosmeticIds: [], equippedByCategory: {}, appliedMigrations: [] };

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
    const appliedMigrations = Array.isArray(parsed.appliedMigrations)
      ? parsed.appliedMigrations.filter((id): id is string => typeof id === 'string')
      : [];
    return { ownedCosmeticIds: owned, equippedByCategory: equipped, appliedMigrations };
  } catch {
    return emptyCosmetics;
  }
}

export function migrateCosmetics(
  state: CosmeticsState,
  options: { grantLegacyEmojiEmotes: boolean },
): CosmeticsState {
  const appliedMigrations = new Set(state.appliedMigrations ?? []);
  if (appliedMigrations.has(LEGACY_EMOJI_GRANT_MIGRATION)) return state;

  appliedMigrations.add(LEGACY_EMOJI_GRANT_MIGRATION);
  const owned = new Set(state.ownedCosmeticIds);
  if (options.grantLegacyEmojiEmotes) {
    for (const id of LEGACY_EMOJI_GRANT_IDS) owned.add(id);
  }
  return {
    ...state,
    ownedCosmeticIds: [...owned],
    appliedMigrations: [...appliedMigrations],
  };
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
      STARTER_CARD_BACKS,
    ),
  };
}
