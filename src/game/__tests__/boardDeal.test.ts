import { describe, expect, it } from 'vitest';
import { BOARD_DEAL_STEP, boardDealDelay } from '../boardDeal';

/**
 * Regression guard for a card visibly disappearing mid-hand.
 *
 * The throw animation starts from fully transparent, and the card component
 * restarts it whenever its delay prop changes. So if a card's delay is not
 * stable for the whole hand, already-placed cards blink out and re-fly in when
 * a new street is dealt, which is exactly what players saw.
 */
describe('board deal timing', () => {
  it('staggers the flop and lands turn and river immediately', () => {
    expect(boardDealDelay(0)).toBe(0);
    expect(boardDealDelay(1)).toBe(BOARD_DEAL_STEP);
    expect(boardDealDelay(2)).toBe(BOARD_DEAL_STEP * 2);
    expect(boardDealDelay(3)).toBe(0); // turn
    expect(boardDealDelay(4)).toBe(0); // river
  });

  it('never changes a card delay as the board grows', () => {
    // Replay the hand: flop (3 cards), turn (4), river (5). Every card that is
    // already on the table must keep the exact delay it was first given.
    const seen = new Map<number, number>();
    for (const boardLength of [3, 4, 5]) {
      for (let i = 0; i < boardLength; i += 1) {
        const delay = boardDealDelay(i);
        if (seen.has(i)) {
          expect(delay, `card ${i} changed delay at board length ${boardLength}`)
            .toBe(seen.get(i));
        } else {
          seen.set(i, delay);
        }
      }
    }
    expect([...seen.values()]).toEqual([0, BOARD_DEAL_STEP, BOARD_DEAL_STEP * 2, 0, 0]);
  });

  it('does not depend on board length in any way', () => {
    // The old implementation took board.length; this one must not, so the same
    // index always yields the same answer however it is reached.
    for (let i = 0; i < 5; i += 1) {
      const values = new Set([boardDealDelay(i), boardDealDelay(i), boardDealDelay(i)]);
      expect(values.size).toBe(1);
    }
  });

  it('is defensive about odd input', () => {
    expect(boardDealDelay(-1)).toBe(0);
    expect(boardDealDelay(99)).toBe(0);
  });
});
