import { describe, expect, it } from 'vitest';
import {
  BG_COLORS,
  BG_STYLES,
  DEFAULT_PAL,
  EYE_COLORS,
  EYE_STYLES,
  EYEBROW_STYLES,
  FACIAL_HAIR,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HEAD_SHAPES,
  HEADWEAR,
  MOUTH_STYLES,
  NOSE_STYLES,
  SHIRT_COLORS,
  SKIN_TONES,
  type PalConfig,
} from '../../avatar/palConfig';
import { applyOutfit, OUTFIT_IDS, OUTFIT_OVERLAYS } from '../outfits';
import { COSMETIC_CATEGORIES } from '../storeCatalog';

type NumericPalKey = Exclude<{
  [Key in keyof PalConfig]: PalConfig[Key] extends number ? Key : never;
}[keyof PalConfig], 'version'>;

const BASE_PAL: PalConfig = {
  ...DEFAULT_PAL,
  skinTone: 5,
  headShape: 3,
  hairStyle: 10,
  hairColor: 9,
  eyebrowStyle: 4,
  eyeStyle: 7,
  eyeColor: 5,
  noseStyle: 3,
  mouthStyle: 5,
  facialHair: 3,
  glasses: 1,
  headwear: 2,
  headwearColor: 12,
  shirtColor: 5,
  bgColor: 10,
  bgStyle: 3,
  blush: true,
  freckles: true,
};

const OPTION_BOUNDS: readonly (readonly [NumericPalKey, number])[] = [
  ['skinTone', SKIN_TONES.length],
  ['headShape', HEAD_SHAPES.length],
  ['hairStyle', HAIR_STYLES.length],
  ['hairColor', HAIR_COLORS.length],
  ['eyebrowStyle', EYEBROW_STYLES.length],
  ['eyeStyle', EYE_STYLES.length],
  ['eyeColor', EYE_COLORS.length],
  ['noseStyle', NOSE_STYLES.length],
  ['mouthStyle', MOUTH_STYLES.length],
  ['facialHair', FACIAL_HAIR.length],
  ['glasses', GLASSES.length],
  ['headwear', HEADWEAR.length],
  ['headwearColor', SHIRT_COLORS.length],
  ['shirtColor', SHIRT_COLORS.length],
  ['bgColor', BG_COLORS.length],
  ['bgStyle', BG_STYLES.length],
];

const palKeys = Object.keys(BASE_PAL) as (keyof PalConfig)[];
const outfitItems = () => COSMETIC_CATEGORIES.find((category) => category.id === 'outfits')?.items ?? [];

describe('outfit overlays', () => {
  it('gives every store outfit id an overlay', () => {
    const storeIds = outfitItems().map((item) => item.id);
    expect(storeIds.length).toBeGreaterThan(0);

    for (const id of storeIds) {
      expect(
        Object.prototype.hasOwnProperty.call(OUTFIT_OVERLAYS, id),
        `${id} is on sale with no outfit overlay`,
      ).toBe(true);
    }

    for (const id of OUTFIT_IDS) {
      expect(storeIds, `${id} has an outfit overlay but is not sold`).toContain(id);
    }
  });

  it('leaves the Pal untouched for unknown outfit ids', () => {
    expect(applyOutfit(BASE_PAL, 'pal-missing')).toBe(BASE_PAL);
    expect(applyOutfit(BASE_PAL, undefined)).toBe(BASE_PAL);
  });

  it('preserves every field an outfit does not dress', () => {
    for (const id of OUTFIT_IDS) {
      const overlay = OUTFIT_OVERLAYS[id];
      const dressed = applyOutfit(BASE_PAL, id);

      for (const key of palKeys) {
        if (Object.prototype.hasOwnProperty.call(overlay, key)) {
          continue;
        }

        expect(dressed[key], `${id} should preserve ${key}`).toBe(BASE_PAL[key]);
      }
    }
  });

  it('always returns a valid PalConfig', () => {
    for (const id of OUTFIT_IDS) {
      const dressed = applyOutfit(BASE_PAL, id);
      expect(dressed.version, `${id}.version`).toBe(1);
      expect(typeof dressed.blush, `${id}.blush`).toBe('boolean');
      expect(typeof dressed.freckles, `${id}.freckles`).toBe('boolean');

      for (const [key, count] of OPTION_BOUNDS) {
        const value = dressed[key];
        expect(Number.isInteger(value), `${id}.${key}`).toBe(true);
        expect(value, `${id}.${key}`).toBeGreaterThanOrEqual(0);
        expect(value, `${id}.${key}`).toBeLessThan(count);
      }
    }
  });
});
