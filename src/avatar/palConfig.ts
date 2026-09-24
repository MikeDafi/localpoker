/**
 * Pal avatar system, a data-driven, highly customizable character config.
 *
 * A "Pal" is our original friendly console-style avatar (not affiliated with any
 * trademarked character system). Every feature is an index into an option list
 * or a color from a palette, so the designer can enumerate and cycle options,
 * and avatars serialize compactly for storage/sharing.
 */

export const SKIN_TONES = [
  '#FFE4C7', '#FBD3A6', '#F3BE86', '#E6A56A', '#D18A50',
  '#B5713C', '#94572B', '#6E3F1E', '#FCE8D8', '#E9B893',
] as const;

export const HAIR_COLORS = [
  '#2B2B2B', '#4A3222', '#6B4423', '#8C5A2B', '#B0752F',
  '#D6B36A', '#E8C979', '#9A9A9A', '#D8D8D8', '#C0392B',
  '#7D5FFF', '#2E86DE', '#10AC84', '#EE5A9B',
] as const;

export const EYE_COLORS = [
  '#3A2A1A', '#5B3A1E', '#7A4B25', '#2E6FBF', '#2E9E8F', '#4A8C3F', '#6B7280', '#8158D9',
] as const;

export const BG_COLORS = [
  '#FDE68A', '#A7E3F2', '#C8F2CF', '#FBC7D4', '#D6C8F5', '#FFD8A8',
  '#B9E4C9', '#AEE0F0', '#FFB3B3', '#C3F0CA', '#F5D0FE', '#BAE6FD',
  '#FDBA74', '#86EFAC', '#93C5FD', '#F0ABFC',
] as const;

export const SHIRT_COLORS = [
  '#2E6FBF', '#E5473B', '#3AA76D', '#F2B705', '#8158D9', '#EE5A9B',
  '#111827', '#F3F4F6', '#0EA5E9', '#F97316', '#14B8A6', '#A855F7',
  '#64748B', '#DC2626',
] as const;

// Option lists (renderer switches on these indices).
export const HEAD_SHAPES = ['round', 'oval', 'square', 'heart', 'long'] as const;
export const HAIR_STYLES = [
  'none', 'short', 'buzz', 'flat', 'spiky', 'curly', 'wavy', 'bun',
  'ponytail', 'long', 'mohawk', 'afro', 'bald-top', 'side-part', 'bob', 'emo',
] as const;
export const EYEBROW_STYLES = ['flat', 'raised', 'angry', 'worried', 'thin', 'bushy'] as const;
export const EYE_STYLES = ['round', 'oval', 'happy', 'dot', 'wide', 'sleepy', 'wink', 'star', 'cute', 'serious'] as const;
export const NOSE_STYLES = ['dot', 'button', 'line', 'wide', 'none'] as const;
export const MOUTH_STYLES = ['smile', 'grin', 'neutral', 'small', 'open', 'smirk', 'frown', 'tongue', 'ohh', 'flat'] as const;
export const FACIAL_HAIR = ['none', 'stubble', 'mustache', 'goatee', 'full', 'soul'] as const;
export const GLASSES = ['none', 'round', 'square', 'sun', 'halfrim', 'sport'] as const;
export const HEADWEAR = ['none', 'cap', 'beanie', 'crown', 'headband', 'visor', 'party', 'cowboy'] as const;
export const BG_STYLES = ['solid', 'gradient', 'ring', 'rays'] as const;

export interface PalConfig {
  version: 1;
  skinTone: number;
  headShape: number;
  hairStyle: number;
  hairColor: number;
  eyebrowStyle: number;
  eyeStyle: number;
  eyeColor: number;
  noseStyle: number;
  mouthStyle: number;
  facialHair: number;
  glasses: number;
  headwear: number;
  headwearColor: number;
  shirtColor: number;
  bgColor: number;
  bgStyle: number;
  blush: boolean;
  freckles: boolean;
}

/** Feature metadata the designer can iterate to build its controls. */
export interface FeatureSpec {
  key: keyof PalConfig;
  label: string;
  kind: 'option' | 'color' | 'toggle';
  count: number;
  palette?: readonly string[];
  group: 'Face' | 'Hair' | 'Eyes' | 'Extras' | 'Style';
}

export const FEATURE_SPECS: FeatureSpec[] = [
  { key: 'skinTone', label: 'Skin', kind: 'color', count: SKIN_TONES.length, palette: SKIN_TONES, group: 'Face' },
  { key: 'headShape', label: 'Head Shape', kind: 'option', count: HEAD_SHAPES.length, group: 'Face' },
  { key: 'blush', label: 'Blush', kind: 'toggle', count: 2, group: 'Face' },
  { key: 'freckles', label: 'Freckles', kind: 'toggle', count: 2, group: 'Face' },
  { key: 'noseStyle', label: 'Nose', kind: 'option', count: NOSE_STYLES.length, group: 'Face' },
  { key: 'mouthStyle', label: 'Mouth', kind: 'option', count: MOUTH_STYLES.length, group: 'Face' },
  { key: 'hairStyle', label: 'Hair Style', kind: 'option', count: HAIR_STYLES.length, group: 'Hair' },
  { key: 'hairColor', label: 'Hair Color', kind: 'color', count: HAIR_COLORS.length, palette: HAIR_COLORS, group: 'Hair' },
  { key: 'facialHair', label: 'Facial Hair', kind: 'option', count: FACIAL_HAIR.length, group: 'Hair' },
  { key: 'eyeStyle', label: 'Eyes', kind: 'option', count: EYE_STYLES.length, group: 'Eyes' },
  { key: 'eyeColor', label: 'Eye Color', kind: 'color', count: EYE_COLORS.length, palette: EYE_COLORS, group: 'Eyes' },
  { key: 'eyebrowStyle', label: 'Eyebrows', kind: 'option', count: EYEBROW_STYLES.length, group: 'Eyes' },
  { key: 'glasses', label: 'Glasses', kind: 'option', count: GLASSES.length, group: 'Extras' },
  { key: 'headwear', label: 'Headwear', kind: 'option', count: HEADWEAR.length, group: 'Extras' },
  { key: 'headwearColor', label: 'Hat Color', kind: 'color', count: SHIRT_COLORS.length, palette: SHIRT_COLORS, group: 'Extras' },
  { key: 'shirtColor', label: 'Shirt', kind: 'color', count: SHIRT_COLORS.length, palette: SHIRT_COLORS, group: 'Style' },
  { key: 'bgColor', label: 'Background', kind: 'color', count: BG_COLORS.length, palette: BG_COLORS, group: 'Style' },
  { key: 'bgStyle', label: 'Backdrop', kind: 'option', count: BG_STYLES.length, group: 'Style' },
];

export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a deterministic Pal from any seed string (used for bots/friends). */
export function palFromSeed(seed: string): PalConfig {
  const rng = mulberry32(hashSeed(seed));
  const ri = (n: number) => Math.floor(rng() * n);
  return {
    version: 1,
    skinTone: ri(SKIN_TONES.length),
    headShape: ri(HEAD_SHAPES.length),
    hairStyle: ri(HAIR_STYLES.length),
    hairColor: ri(HAIR_COLORS.length),
    eyebrowStyle: ri(EYEBROW_STYLES.length),
    eyeStyle: ri(EYE_STYLES.length),
    eyeColor: ri(EYE_COLORS.length),
    noseStyle: ri(NOSE_STYLES.length),
    mouthStyle: ri(MOUTH_STYLES.length),
    facialHair: rng() > 0.6 ? ri(FACIAL_HAIR.length) : 0,
    glasses: rng() > 0.7 ? ri(GLASSES.length) : 0,
    headwear: rng() > 0.7 ? ri(HEADWEAR.length) : 0,
    headwearColor: ri(SHIRT_COLORS.length),
    shirtColor: ri(SHIRT_COLORS.length),
    bgColor: ri(BG_COLORS.length),
    bgStyle: ri(BG_STYLES.length),
    blush: rng() > 0.5,
    freckles: rng() > 0.7,
  };
}

export function randomPal(): PalConfig {
  return palFromSeed(Math.random().toString(36).slice(2) + Date.now());
}

export const DEFAULT_PAL: PalConfig = {
  version: 1,
  skinTone: 0,
  headShape: 0,
  hairStyle: 1,
  hairColor: 1,
  eyebrowStyle: 0,
  eyeStyle: 0,
  eyeColor: 0,
  noseStyle: 0,
  mouthStyle: 0,
  facialHair: 0,
  glasses: 0,
  headwear: 0,
  headwearColor: 0,
  shirtColor: 0,
  bgColor: 1,
  bgStyle: 1,
  blush: false,
  freckles: false,
};

/** Clamp/repair a possibly-partial stored config into a valid PalConfig. */
export function normalizePal(c?: Partial<PalConfig> | null): PalConfig {
  return { ...DEFAULT_PAL, ...(c ?? {}) };
}
