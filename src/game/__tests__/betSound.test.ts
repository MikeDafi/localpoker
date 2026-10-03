import { describe, it, expect } from 'vitest';
import { chipSoundsFor, chipsCommitted, MAX_CHIP_SOUNDS } from '../betSound';

describe('chipSoundsFor', () => {
  const BB = 20;

  it('makes no sound when no chips move', () => {
    expect(chipSoundsFor(0, BB)).toBe(0);
    expect(chipSoundsFor(-5, BB)).toBe(0);
  });

  it('drops one chip for a bet the size of the big blind', () => {
    expect(chipSoundsFor(BB, BB)).toBe(1);
  });

  it('still drops one for anything smaller, down to the small blind', () => {
    expect(chipSoundsFor(BB / 2, BB)).toBe(1);
    expect(chipSoundsFor(1, BB)).toBe(1);
  });

  it('adds a chip every time the bet doubles', () => {
    expect(chipSoundsFor(BB * 2, BB)).toBe(2);
    expect(chipSoundsFor(BB * 4, BB)).toBe(3);
    expect(chipSoundsFor(BB * 8, BB)).toBe(4);
    expect(chipSoundsFor(BB * 16, BB)).toBe(5);
  });

  /*
   * The whole point of measuring against the blinds: the same number of chips
   * is a shove at one table and a min raise at another.
   */
  it('judges size by the blinds rather than by the number', () => {
    expect(chipSoundsFor(200, 5)).toBe(MAX_CHIP_SOUNDS);
    expect(chipSoundsFor(200, 200)).toBe(1);
  });

  it('never gets louder than the cap, however big the shove', () => {
    expect(chipSoundsFor(BB * 1000, BB)).toBe(MAX_CHIP_SOUNDS);
    expect(chipSoundsFor(Number.MAX_SAFE_INTEGER, BB)).toBe(MAX_CHIP_SOUNDS);
  });

  it('never goes backwards as the bet grows', () => {
    let last = 0;
    for (let amount = 1; amount <= BB * 40; amount += 3) {
      const n = chipSoundsFor(amount, BB);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });

  it('survives a table configured with no blinds', () => {
    expect(chipSoundsFor(100, 0)).toBe(1);
    expect(chipSoundsFor(100, Number.NaN)).toBe(1);
  });
});

describe('chipsCommitted', () => {
  const base = { playerBet: 0, playerChips: 1000, tableBet: 20 };

  it('moves nothing on a check or a fold', () => {
    expect(chipsCommitted({ ...base, action: 'check' })).toBe(0);
    expect(chipsCommitted({ ...base, action: 'fold' })).toBe(0);
  });

  it('moves the difference on a call, not the whole bet', () => {
    expect(chipsCommitted({ ...base, action: 'call' })).toBe(20);
    expect(chipsCommitted({ ...base, action: 'call', playerBet: 15 })).toBe(5);
  });

  /*
   * A raise carries the total it raises *to*, so counting the raw number
   * would make the second raise of a street sound bigger than it was.
   */
  it('counts a raise from what the player already has out', () => {
    expect(chipsCommitted({ ...base, action: 'raise', amount: 60 })).toBe(60);
    expect(chipsCommitted({ ...base, action: 'raise', amount: 60, playerBet: 20 })).toBe(40);
  });

  it('never moves more than the player has', () => {
    expect(chipsCommitted({ ...base, action: 'raise', amount: 5000, playerChips: 300 })).toBe(300);
    expect(chipsCommitted({ ...base, action: 'allin', playerChips: 300 })).toBe(300);
  });

  it('never goes negative when the player is already in for more', () => {
    expect(chipsCommitted({ ...base, action: 'call', playerBet: 50, tableBet: 20 })).toBe(0);
  });
});
