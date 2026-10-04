import { describe, it, expect } from 'vitest';
import { chipSoundsFor, chipsCommitted, MAX_CHIP_SOUNDS } from '../betSound';

describe('chipSoundsFor', () => {
  const POT = 100;

  it('makes no sound when no chips move', () => {
    expect(chipSoundsFor(0, POT)).toBe(0);
    expect(chipSoundsFor(-5, POT)).toBe(0);
  });

  it('counts out the pot-relative scale a player already thinks in', () => {
    expect(chipSoundsFor(POT / 4, POT)).toBe(1);   // quarter pot
    expect(chipSoundsFor(POT / 2, POT)).toBe(2);   // half pot
    expect(chipSoundsFor(POT, POT)).toBe(3);       // pot
    expect(chipSoundsFor(POT * 2, POT)).toBe(4);   // overbet
    expect(chipSoundsFor(POT * 4, POT)).toBe(5);   // shove
  });

  it('still drops one coin for the smallest nibble', () => {
    expect(chipSoundsFor(POT / 32, POT)).toBe(1);
    expect(chipSoundsFor(1, POT)).toBe(1);
  });

  /*
   * The whole point of measuring against the pot rather than the blinds: by
   * the river the blinds say nothing about whether a bet is big. The same 200
   * is a shove into 100 and a nuisance into 4,000.
   */
  it('judges size by the pot rather than by the number', () => {
    expect(chipSoundsFor(200, 100)).toBe(4);
    expect(chipSoundsFor(200, 4000)).toBe(1);
  });

  it('never gets louder than the cap, however big the shove', () => {
    expect(chipSoundsFor(POT * 1000, POT)).toBe(MAX_CHIP_SOUNDS);
    expect(chipSoundsFor(Number.MAX_SAFE_INTEGER, POT)).toBe(MAX_CHIP_SOUNDS);
  });

  it('never goes backwards as the bet grows', () => {
    let last = 0;
    for (let amount = 1; amount <= POT * 40; amount += 3) {
      const n = chipSoundsFor(amount, POT);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });

  it('survives a pot of nothing rather than dividing by zero', () => {
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
