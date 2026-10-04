import { describe, it, expect } from 'vitest';
import { dayNumber, shuffleForDay } from '../dailyShuffle';
import { FREE_GIF_COSMETIC_IDS, PURCHASABLE_GIF_EMOTES, resolveGifEmotes } from '../cosmetics';

const items = Array.from({ length: 24 }, (_, i) => i);

describe('dayNumber', () => {
  it('is the same at any hour of one day', () => {
    const morning = dayNumber(new Date(2026, 9, 3, 1, 5));
    const night = dayNumber(new Date(2026, 9, 3, 23, 55));
    expect(morning).toBe(night);
  });

  it('moves on at midnight', () => {
    expect(dayNumber(new Date(2026, 9, 4, 0, 1))).toBe(dayNumber(new Date(2026, 9, 3, 12, 0)) + 1);
  });
});

describe('shuffleForDay', () => {
  it('keeps the tray still for the whole day', () => {
    expect(shuffleForDay(items, 20000)).toEqual(shuffleForDay(items, 20000));
  });

  it('gives a different order tomorrow', () => {
    expect(shuffleForDay(items, 20000)).not.toEqual(shuffleForDay(items, 20001));
  });

  /*
   * The point of shuffling at all: without it the same handful are always the
   * ones in reach and the rest may as well not be in the library.
   */
  it('brings different ones to the front across a week', () => {
    const firsts = new Set(Array.from({ length: 7 }, (_, d) => shuffleForDay(items, 20000 + d)[0]));
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('loses nothing and duplicates nothing', () => {
    const out = shuffleForDay(items, 12345);
    expect(out).toHaveLength(items.length);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it('leaves the original alone, because the library is shared', () => {
    const original = items.slice();
    shuffleForDay(items, 999);
    expect(items).toEqual(original);
  });

  it('copes with an empty or single-item library', () => {
    expect(shuffleForDay([], 1)).toEqual([]);
    expect(shuffleForDay(['only'], 1)).toEqual(['only']);
  });

  it('actually reorders rather than handing back the same list', () => {
    const days = Array.from({ length: 10 }, (_, d) => shuffleForDay(items, 500 + d));
    expect(days.some((order) => !order.every((v, i) => v === items[i]))).toBe(true);
  });

  it('shuffles only GIFs the player can send', () => {
    const bought = Object.keys(PURCHASABLE_GIF_EMOTES).slice(0, 3);
    const shuffled = shuffleForDay(resolveGifEmotes({ owned: bought }), 12345);
    const allowed = new Set([...FREE_GIF_COSMETIC_IDS, ...bought]);
    expect(shuffled.every((gif) => allowed.has(gif.id))).toBe(true);
    for (const id of bought) {
      expect(shuffled.map((gif) => gif.id)).toContain(id);
    }
  });
});
