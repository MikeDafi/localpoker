import { describe, expect, it } from 'vitest';
import { chenScore, monteCarloEquity } from '../equity';
import type { Card, Suit } from '../cards';

/** "Ah" / "Td" / "7c" -> Card */
function card(text: string): Card {
  const rankText = text.slice(0, -1);
  const suit = text.slice(-1) as Suit;
  const ranks: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
  const rank = (ranks[rankText] ?? Number(rankText)) as Card['rank'];
  return { rank, suit };
}

const hand = (...texts: string[]) => texts.map(card);

describe('Chen formula', () => {
  // Reference values from Bill Chen's published formula.
  it.each([
    ['AA', hand('Ah', 'As'), 20],
    ['KK', hand('Kh', 'Ks'), 16],
    ['QQ', hand('Qh', 'Qs'), 14],
    ['JJ', hand('Jh', 'Js'), 12],
    ['TT', hand('Th', 'Ts'), 10],
    ['22', hand('2h', '2s'), 5], // pair floor
    ['AKs', hand('Ah', 'Kh'), 12],
    ['AKo', hand('Ah', 'Ks'), 10],
    ['AQs', hand('Ah', 'Qh'), 11],
    ['JTs', hand('Jh', 'Th'), 9], // suited connector + straight bonus
    ['72o', hand('7h', '2s'), -1], // the worst hand
  ])('scores %s as %i', (_label, cards, expected) => {
    expect(chenScore(cards)).toBe(expected);
  });

  it('ranks hands in a sane order', () => {
    expect(chenScore(hand('Ah', 'As'))).toBeGreaterThan(chenScore(hand('Kh', 'Ks')));
    expect(chenScore(hand('Ah', 'Kh'))).toBeGreaterThan(chenScore(hand('Ah', 'Ks')));
    expect(chenScore(hand('Jh', 'Th'))).toBeGreaterThan(chenScore(hand('Jh', '5h')));
  });

  it('is a ranking, not a win probability', () => {
    // Guards the bug this caused: a normalised Chen score puts 72o at the very
    // bottom, but its true heads-up equity is ~36%. Treating the score as equity
    // made bots fold almost everything preflop.
    const worst = chenScore(hand('7h', '2s'));
    const trueEquity = monteCarloEquity(hand('7h', '2s'), [], 1, 600, 'ranking');
    expect(worst).toBeLessThan(0);
    expect(trueEquity).toBeGreaterThan(0.3);
  });
});

describe('Monte Carlo equity', () => {
  it('is deterministic for a given seed', () => {
    const args = [hand('Ah', 'Kh'), hand('Qh', 'Jh', '2c'), 2, 200] as const;
    expect(monteCarloEquity(...args, 'seed-1')).toBe(monteCarloEquity(...args, 'seed-1'));
  });

  it('rates the nuts at or near 100%', () => {
    // Royal flush already made on the board + hand.
    const equity = monteCarloEquity(hand('Ah', 'Kh'), hand('Qh', 'Jh', 'Th'), 2, 300, 'nuts');
    expect(equity).toBeGreaterThan(0.95);
  });

  it('rates a hopeless hand very low', () => {
    // 72o against a board that pairs the opponents' likely holdings.
    const equity = monteCarloEquity(hand('7d', '2c'), hand('Ah', 'Kh', 'Qh'), 3, 300, 'dead');
    expect(equity).toBeLessThan(0.25);
  });

  it('prices a draw well above the made-hand-only view', () => {
    // Four to a flush on the flop: no made hand at all, but ~35% equity heads-up.
    // The old category-lookup scored this as "high card" (0.18).
    const equity = monteCarloEquity(hand('Ah', '5h'), hand('Kh', '9h', '2c'), 1, 600, 'draw');
    expect(equity).toBeGreaterThan(0.45);
  });

  it('drops as more opponents are added', () => {
    const board = hand('Kh', '9d', '2c');
    const heads = monteCarloEquity(hand('Ah', 'Ad'), board, 1, 400, 'multi');
    const five = monteCarloEquity(hand('Ah', 'Ad'), board, 5, 400, 'multi');
    expect(heads).toBeGreaterThan(five);
  });

  it('gives a pair of aces a strong but not certain edge heads-up', () => {
    const equity = monteCarloEquity(hand('Ah', 'Ad'), hand('Kh', '9d', '2c'), 1, 600, 'aces');
    expect(equity).toBeGreaterThan(0.7);
    expect(equity).toBeLessThan(1);
  });

  it('returns a valid probability in every sampled spot', () => {
    for (let i = 0; i < 12; i += 1) {
      const equity = monteCarloEquity(hand('Ah', 'Kd'), hand('Qs', 'Jc', '2h'), 3, 80, `spot-${i}`);
      expect(equity).toBeGreaterThanOrEqual(0);
      expect(equity).toBeLessThanOrEqual(1);
    }
  });
});
