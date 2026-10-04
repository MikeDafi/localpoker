import {
  GLASSES,
  HEADWEAR,
  SHIRT_COLORS,
  type PalConfig,
} from '../avatar/palConfig';

export const OUTFIT_IDS = [
  'pal-dealer-shades',
  'pal-lucky-cap',
  'pal-cozy-hoodie',
  'pal-astro-helmet',
  'pal-chef-jacket',
  'pal-dragon-festival',
] as const;

export type OutfitId = (typeof OUTFIT_IDS)[number];
export type OutfitOverlay = Partial<PalConfig>;

const optionIndex = <Option extends string>(
  options: readonly Option[],
  value: Option,
): number => options.indexOf(value);

const shirtColorIndex = (color: (typeof SHIRT_COLORS)[number]): number =>
  optionIndex(SHIRT_COLORS, color);

export const OUTFIT_OVERLAYS = {
  'pal-dealer-shades': {
    glasses: optionIndex(GLASSES, 'sun'),
  },
  'pal-lucky-cap': {
    headwear: optionIndex(HEADWEAR, 'cap'),
    headwearColor: shirtColorIndex('#2E6FBF'),
  },
  'pal-cozy-hoodie': {
    shirtColor: shirtColorIndex('#F97316'),
  },
  'pal-astro-helmet': {
    headwear: optionIndex(HEADWEAR, 'visor'),
    headwearColor: shirtColorIndex('#8158D9'),
    shirtColor: shirtColorIndex('#A855F7'),
  },
  'pal-chef-jacket': {
    shirtColor: shirtColorIndex('#F3F4F6'),
  },
  'pal-dragon-festival': {
    headwear: optionIndex(HEADWEAR, 'crown'),
    shirtColor: shirtColorIndex('#DC2626'),
  },
} as const satisfies Record<OutfitId, OutfitOverlay>;

export function isOutfitId(outfitId: string | undefined): outfitId is OutfitId {
  return typeof outfitId === 'string' && Object.prototype.hasOwnProperty.call(OUTFIT_OVERLAYS, outfitId);
}

export function applyOutfit(pal: PalConfig, outfitId: string | undefined): PalConfig {
  if (!isOutfitId(outfitId)) {
    return pal;
  }
  return { ...pal, ...OUTFIT_OVERLAYS[outfitId] };
}
