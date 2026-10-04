import { describe, expect, it, vi } from 'vitest';
import {
  BG_COLORS,
  BG_STYLES,
  BLUSH_STYLES,
  DEFAULT_PAL,
  FEATURE_SPECS,
  FRECKLE_STYLES,
  PalConfig,
  normalizePal,
  palFromSeed,
  randomPal,
} from '../palConfig';

const featureFor = (key: keyof PalConfig) => FEATURE_SPECS.find((spec) => spec.key === key);

describe('pal feature specs', () => {
  it('exposes blush, freckles and vivid backdrops as option lists', () => {
    expect(featureFor('blushStyle')).toMatchObject({
      label: 'Blush',
      kind: 'option',
      count: BLUSH_STYLES.length,
      group: 'Face',
    });
    expect(featureFor('frecklesStyle')).toMatchObject({
      label: 'Freckles',
      kind: 'option',
      count: FRECKLE_STYLES.length,
      group: 'Face',
    });
    expect(featureFor('bgStyle')).toMatchObject({
      kind: 'option',
      count: BG_STYLES.length,
      group: 'Style',
    });
    expect(BLUSH_STYLES).toEqual(['none', 'soft', 'strong', 'doll', 'anime-lines']);
    expect(FRECKLE_STYLES).toEqual(['none', 'light-cheeks', 'heavy-cheeks', 'nose-band', 'scattered']);
    expect(BG_STYLES).toEqual(expect.arrayContaining([
      'spotlight',
      'confetti',
      'suits',
      'chips',
      'starburst',
      'neon-grid',
      'bokeh',
      'holo-sweep',
      'waves',
      'diagonal-stripes',
    ]));
    expect(BG_COLORS.length).toBeGreaterThan(16);
  });
});

describe('normalizePal', () => {
  it('defaults missing new keys without changing a legacy pal', () => {
    const legacy: Partial<PalConfig> = { ...DEFAULT_PAL };
    delete legacy.blush;
    delete legacy.freckles;
    delete legacy.blushStyle;
    delete legacy.frecklesStyle;

    const normalized = normalizePal(legacy);
    expect(normalized.blush).toBe(false);
    expect(normalized.freckles).toBe(false);
    expect(normalized.blushStyle).toBe(0);
    expect(normalized.frecklesStyle).toBe(0);
    expect(normalizePal(normalized)).toEqual(normalized);
  });

  it('maps legacy toggles to the first visible style', () => {
    expect(normalizePal({ blush: true }).blushStyle).toBe(1);
    expect(normalizePal({ freckles: true }).frecklesStyle).toBe(1);
    expect(normalizePal({ blush: false, freckles: false }).blushStyle).toBe(0);
    expect(normalizePal({ blush: false, freckles: false }).frecklesStyle).toBe(0);
  });

  it('clamps every indexed designer feature', () => {
    for (const spec of FEATURE_SPECS) {
      if (spec.kind === 'toggle') continue;
      expect(normalizePal({ [spec.key]: spec.count + 99 } as Partial<PalConfig>)[spec.key]).toBe(spec.count - 1);
      expect(normalizePal({ [spec.key]: -99 } as Partial<PalConfig>)[spec.key]).toBe(0);
    }
  });
});

describe('pal generation', () => {
  it('keeps seeded pals deterministic', () => {
    const first = palFromSeed('friend-123');
    const second = palFromSeed('friend-123');

    expect(second).toEqual(first);
    expect(first.blushStyle).toBe(first.blush ? 1 : 0);
    expect(first.frecklesStyle).toBe(first.freckles ? 1 : 0);
    expect(first.bgColor).toBeLessThan(16);
    expect(first.bgStyle).toBeLessThan(4);
  });

  it('lets random pals reach the new option list ends', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    try {
      const pal = randomPal();
      expect(pal.blushStyle).toBe(BLUSH_STYLES.length - 1);
      expect(pal.frecklesStyle).toBe(FRECKLE_STYLES.length - 1);
      expect(pal.bgColor).toBe(BG_COLORS.length - 1);
      expect(pal.bgStyle).toBe(BG_STYLES.length - 1);
    } finally {
      spy.mockRestore();
    }
  });
});
