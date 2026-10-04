import { describe, expect, it } from 'vitest';
import { NAME_ADJECTIVES, NAME_COMBINATIONS, NAME_NOUNS, randomName } from '../playerName';

describe('randomName', () => {
  it('is handle shaped', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(randomName()).toMatch(/^[a-z]+_[a-z]+\d{4}$/);
    }
  });

  it('keeps every word handle safe', () => {
    for (const word of [...NAME_ADJECTIVES, ...NAME_NOUNS]) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it('has no duplicate words, which would skew the draw', () => {
    expect(new Set(NAME_ADJECTIVES).size).toBe(NAME_ADJECTIVES.length);
    expect(new Set(NAME_NOUNS).size).toBe(NAME_NOUNS.length);
  });

  /*
   * The actual complaint: "seems like every new player is called turbo
   * something". With eight adjectives that was one name in eight. This pins
   * the pool large enough that no single word is noticeable.
   */
  it('gives no single word more than 3% of new names', () => {
    expect(NAME_COMBINATIONS).toBeGreaterThan(2000);
    expect(1 / NAME_ADJECTIVES.length).toBeLessThan(0.03);
    expect(1 / NAME_NOUNS.length).toBeLessThan(0.03);
  });

  it('stays inside both pools at the extremes of random', () => {
    expect(randomName(() => 0)).toBe(`${NAME_ADJECTIVES[0]}_${NAME_NOUNS[0]}1000`);
    const top = randomName(() => 0.999999);
    expect(top).toBe(
      `${NAME_ADJECTIVES[NAME_ADJECTIVES.length - 1]}_${NAME_NOUNS[NAME_NOUNS.length - 1]}9999`,
    );
  });
});
