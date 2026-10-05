/**
 * What the in-app store sells.
 *
 * Data, not a screen. It lived inside StoreScreen, which meant the one thing
 * worth checking about it could not be checked: that every item on sale has a
 * palette behind it in `cosmetics.ts`. An item without one takes the coins
 * and changes nothing, which has now happened twice, so the two lists are
 * asserted against each other in tests instead of by eye.
 */
import { colors } from '../theme/theme';
import {
  PURCHASABLE_EMOJI_EMOTES,
  PURCHASABLE_GIF_EMOTES,
  PURCHASABLE_PAL_MOTIONS,
  PURCHASABLE_STICKER_EMOTES,
  PURCHASABLE_TEXT_EMOTES,
} from './cosmetics';

/**
 * Reactions lead.
 *
 * They are the cheapest thing on sale, the only category you can use without
 * leaving the hand you are in, and the one people actually buy. Outfits sit
 * last because they are the weakest: see the note on `outfits` below.
 */
export const CATEGORY_IDS = ['gifs', 'emotes', 'palMotions', 'cardBacks', 'tables', 'chips', 'outfits'] as const;

export type CosmeticCategoryId = (typeof CATEGORY_IDS)[number];

export type CosmeticItem = {
  id: string;
  category: CosmeticCategoryId;
  name: string;
  price: number;
  description: string;
  emoji: string;
  swatches: readonly [string, string, string];
  badge?: string;
};

export type CosmeticCategory = {
  id: CosmeticCategoryId;
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
  items: CosmeticItem[];
};

const GIF_STORE_ITEMS: CosmeticItem[] = Object.values(PURCHASABLE_GIF_EMOTES).map((gif) => ({
  id: gif.id,
  category: 'gifs',
  name: gif.name,
  price: gif.price,
  description: gif.description,
  emoji: gif.emoji,
  swatches: gif.swatches,
}));

const EMOTE_STORE_ITEMS: CosmeticItem[] = [
  ...Object.values(PURCHASABLE_EMOJI_EMOTES),
  ...Object.values(PURCHASABLE_STICKER_EMOTES),
  ...Object.values(PURCHASABLE_TEXT_EMOTES),
].map((emote) => ({
  id: emote.id,
  category: 'emotes',
  name: emote.name,
  price: emote.price,
  description: emote.description,
  emoji: emote.emoji,
  swatches: emote.swatches,
}));

const PAL_MOTION_STORE_ITEMS: CosmeticItem[] = Object.values(PURCHASABLE_PAL_MOTIONS).map((motion) => ({
  id: motion.id,
  category: 'palMotions',
  name: motion.name,
  price: motion.price,
  description: motion.description,
  emoji: motion.emoji,
  swatches: motion.swatches,
}));

const CATEGORY_DEFINITIONS: CosmeticCategory[] = [
  {
    id: 'outfits',
    label: 'Outfits & Accessories',
    shortLabel: 'Outfits',
    emoji: '🐾',
    description: 'Hats, glasses and looks for your Pal.',
    items: [
      {
        id: 'pal-dealer-shades',
        category: 'outfits',
        name: 'Dealer Shades',
        price: 250,
        description: 'Slick tinted frames for unreadable bluffs.',
        emoji: '😎',
        swatches: ['#111827', colors.blue, colors.gold],
        badge: 'New',
      },
      {
        id: 'pal-lucky-cap',
        category: 'outfits',
        name: 'Lucky Cap',
        price: 450,
        description: 'A bright cap with just enough river magic.',
        emoji: '🧢',
        swatches: ['#2563EB', '#E0F2FE', colors.green],
      },
      {
        id: 'pal-cozy-hoodie',
        category: 'outfits',
        name: 'Cozy Hoodie',
        price: 900,
        description: 'Soft lounge wear for late-night home games.',
        emoji: '🧥',
        swatches: ['#F97316', '#FDE68A', '#7C2D12'],
      },
      {
        id: 'pal-astro-helmet',
        category: 'outfits',
        name: 'Astro Helmet',
        price: 1_600,
        description: 'Tiny visor, comet pins, and zero-gravity confidence.',
        emoji: '🚀',
        swatches: ['#4C1D95', '#7C3AED', '#22D3EE'],
        badge: 'Popular',
      },
      {
        id: 'pal-chef-jacket',
        category: 'outfits',
        name: 'Chef Jacket',
        price: 2_100,
        description: 'For Pals who cook up spicy raises.',
        emoji: '🍳',
        swatches: ['#EF4444', '#FFFFFF', '#111827'],
      },
      {
        id: 'pal-dragon-festival',
        category: 'outfits',
        name: 'Dragon Festival',
        price: 5_000,
        description: 'Lantern glow, dragon masks, and victory fireworks.',
        emoji: '🐉',
        swatches: ['#DC2626', '#F59E0B', '#111827'],
        badge: 'Legend',
      },
    ],
  },
  {
    id: 'cardBacks',
    label: 'Card Backs',
    shortLabel: 'Cards',
    emoji: '🂠',
    description: 'The back printed on every card.',
    items: [
      {
        id: 'black',
        category: 'cardBacks',
        name: 'Black Club',
        price: 300,
        description: 'Slate club back with low-key table presence.',
        emoji: '♣',
        swatches: ['#4A4F58', '#282C33', '#14171B'],
      },
      {
        id: 'retro',
        category: 'cardBacks',
        name: 'Retro Diamond',
        price: 500,
        description: 'Warm vintage paper with diamond line work.',
        emoji: '♦',
        swatches: ['#F3DCAE', '#E0B978', '#B9844A'],
      },
      {
        id: 'holo',
        category: 'cardBacks',
        name: 'Holo Prism',
        price: 650,
        description: 'A glossy prism back from the original deck.',
        emoji: '◆',
        swatches: ['#6ED8D0', '#7A5CE0', '#2C1B6B'],
      },
      {
        id: 'card-sunrise',
        category: 'cardBacks',
        name: 'Sunrise Felt',
        price: 350,
        description: 'Warm sunrise rays with clean white trim.',
        emoji: '🌅',
        swatches: ['#FB923C', '#FDE68A', '#FFFFFF'],
      },
      {
        id: 'card-nebula',
        category: 'cardBacks',
        name: 'Neon Nebula',
        price: 800,
        description: 'Cosmic gradients with a soft holo glow.',
        emoji: '🌌',
        swatches: [colors.accent, colors.accentPink, colors.accentAlt],
        badge: 'New',
      },
      {
        id: 'card-royal-holo',
        category: 'cardBacks',
        name: 'Royal Holo',
        price: 1_200,
        description: 'Blue glass, gold trim, crown energy.',
        emoji: '👑',
        swatches: [colors.blueDeep, colors.blue, colors.gold],
        badge: 'Shiny',
      },
      {
        id: 'card-lucky-koi',
        category: 'cardBacks',
        name: 'Lucky Koi',
        price: 2_200,
        description: 'Warm koi scales for river magic.',
        emoji: '🐟',
        swatches: ['#FF7A59', '#FFF1D6', colors.accentPink],
      },
      {
        id: 'card-midnight',
        category: 'cardBacks',
        name: 'Midnight Matrix',
        price: 3_600,
        description: 'Deep black pattern with electric edges.',
        emoji: '✦',
        swatches: ['#111827', colors.accent, colors.accentAlt],
        badge: 'Rare',
      },
    ],
  },
  {
    id: 'tables',
    label: 'Table Themes',
    shortLabel: 'Tables',
    emoji: '🎲',
    description: 'Felt and rails for the table.',
    items: [
      {
        id: 'table-emerald',
        category: 'tables',
        name: 'Emerald Room',
        price: 700,
        description: 'Classic green felt with polished rails.',
        emoji: '💚',
        swatches: [colors.green, '#064E3B', colors.gold],
      },
      {
        id: 'table-miami',
        category: 'tables',
        name: 'Miami Felt',
        price: 950,
        description: 'Bright teal felt with beach-club rails.',
        emoji: '🌴',
        swatches: ['#00D2FF', '#3A7BD5', '#0FD18A'],
        badge: 'Popular',
      },
      {
        id: 'table-velvet',
        category: 'tables',
        name: 'Velvet Royale',
        price: 1_800,
        description: 'Purple velvet and a gilded winner rail.',
        emoji: '💜',
        swatches: ['#5B21B6', '#A855F7', colors.gold],
        badge: 'Luxe',
      },
      {
        id: 'table-sakura',
        category: 'tables',
        name: 'Sakura Lounge',
        price: 2_600,
        description: 'Soft pink petals for chill home games.',
        emoji: '🌸',
        swatches: ['#FF7AB6', '#FFD1E6', '#B85CFF'],
      },
      {
        id: 'table-lunar',
        category: 'tables',
        name: 'Lunar Arena',
        price: 4_800,
        description: 'Moonlit rails and a midnight felt surface.',
        emoji: '🌙',
        swatches: ['#0F172A', '#475569', '#C4B5FD'],
        badge: 'Epic',
      },
    ],
  },
  {
    id: 'chips',
    label: 'Chip Styles',
    shortLabel: 'Chips',
    emoji: '🪙',
    description: 'The chips every bet is made with.',
    items: [
      {
        id: 'chips-candy',
        category: 'chips',
        name: 'Candy Stack',
        price: 600,
        description: 'Sweet pastel chips for playful pots.',
        emoji: '🍬',
        swatches: [colors.accentPink, colors.accentAlt, colors.gold],
      },
      {
        id: 'chips-obsidian',
        category: 'chips',
        name: 'Obsidian Pro',
        price: 1_400,
        description: 'Matte black chips with gold inlays.',
        emoji: '⚫',
        swatches: ['#111827', '#374151', colors.gold],
      },
      {
        id: 'chips-circuit',
        category: 'chips',
        name: 'Circuit Chips',
        price: 2_400,
        description: 'Arcade-neon edges for fast action.',
        emoji: '⚡',
        swatches: ['#00F5A0', '#00D9F5', '#1A1A40'],
        badge: 'New',
      },
      {
        id: 'chips-diamond',
        category: 'chips',
        name: 'Diamond Edge',
        price: 4_200,
        description: 'Icy whites with sapphire side spots.',
        emoji: '💎',
        swatches: ['#B8E7FF', '#FFFFFF', colors.blue],
        badge: 'Elite',
      },
      {
        id: 'chips-golden-tiki',
        category: 'chips',
        name: 'Golden Tiki',
        price: 5_000,
        description: 'Carved gold chips with island-lounge flair.',
        emoji: '🗿',
        swatches: ['#92400E', colors.gold, '#FDE68A'],
        badge: 'Legend',
      },
    ],
  },
  {
    id: 'emotes',
    label: 'Table Emotes',
    shortLabel: 'Emotes',
    emoji: '😎',
    description: 'Emoji, sticker and quick-text reactions for the emote tray.',
    items: EMOTE_STORE_ITEMS,
  },
  {
    id: 'gifs',
    label: 'Reaction GIFs',
    shortLabel: 'GIFs',
    emoji: '🎞️',
    description: 'Animated reactions for the emote tray.',
    items: GIF_STORE_ITEMS,
  },
  {
    id: 'palMotions',
    label: 'Pal Motions',
    shortLabel: 'Motions',
    emoji: '👋',
    description: 'Gestures your own Pal performs at the table.',
    items: PAL_MOTION_STORE_ITEMS,
  },
];

/**
 * Ordered by `CATEGORY_IDS`, so the tab order and the id list cannot drift
 * apart. The definitions above stay grouped however they read best.
 */
export const COSMETIC_CATEGORIES: CosmeticCategory[] = CATEGORY_IDS.map(
  (id) => CATEGORY_DEFINITIONS.find((category) => category.id === id)!,
);
