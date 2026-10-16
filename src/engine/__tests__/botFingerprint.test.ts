import { describe, expect, it } from 'vitest';
import { decideAction, setBotEntropy, type Difficulty } from '../bot';
import { applyAction, createGame, legalActions, startHand } from '../holdem';
import type { GameConfig, GameState } from '../types';

/**
 * Pins every easy, medium and hard decision over a fixed set of hands.
 *
 * The lower difficulties are tuned against measurements recorded in the other
 * bot tests, so a change that leaks into their path would quietly invalidate
 * those numbers. A digest of the whole decision stream catches any leak at
 * all, including one that only shifts a single bet size by a chip.
 *
 * Since every level started reading the betting, they share expert's preflop
 * ranges, range-aware equity and reads (`rangePreflop`, `rangeEquity.ts`,
 * `handReads.ts`), so a change there moves these digests as well as expert.
 * That is the point: re-record them only when the change is meant to reach
 * the lower levels, and say so where the digest is recorded.
 *
 * The fixtures mix table sizes, a short-stacked table (where expert switches to
 * push/fold) and a hero who bets a fixed size, so the call, raise and fold
 * branches are all exercised.
 */

const deep: GameConfig = { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxPlayers: 6, turnTimerSec: 30 };
const short: GameConfig = { smallBlind: 5, bigBlind: 10, startingStack: 100, maxPlayers: 6, turnTimerSec: 30 };

function fnv(text: string, hash: number): number {
  let h = hash;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function table(config: GameConfig, seats: number, seed: number, withHero: boolean): GameState {
  const players = Array.from({ length: seats }, (_, i) => ({
    id: withHero && i === 0 ? 'HERO' : `P${i}`,
    name: withHero && i === 0 ? 'Hero' : `P${i}`,
    seatIndex: i,
    isBot: !(withHero && i === 0),
  }));
  return startHand(createGame(config, players, seed));
}

function digest(difficulty: Difficulty): string {
  setBotEntropy('fingerprint');
  let hash = 2166136261;
  let decisions = 0;
  const fixtures: { config: GameConfig; seats: number; hero: boolean }[] = [
    { config: deep, seats: 2, hero: false },
    { config: deep, seats: 6, hero: false },
    { config: short, seats: 4, hero: false },
    { config: deep, seats: 2, hero: true },
  ];

  for (const [f, fixture] of fixtures.entries()) {
    for (let h = 0; h < 6; h += 1) {
      let state = table(fixture.config, fixture.seats, 31_000 + f * 100 + h, fixture.hero);
      for (let i = 0; i < 300 && state.street !== 'showdown'; i += 1) {
        const actor = state.players[state.currentPlayerIndex];
        if (!actor) break;
        let decision;
        if (actor.id === 'HERO') {
          const legal = legalActions(state, actor.id);
          decision = legal.actions.includes('bet')
            ? { action: 'bet' as const, amount: Math.min(legal.maxBet ?? 0, Math.max(legal.minBet ?? 0, 60)) }
            : { action: legal.toCall > 0 ? ('call' as const) : ('check' as const) };
        } else {
          decision = decideAction(state, actor.id, difficulty);
          hash = fnv(`${f}:${h}:${i}:${decision.action}:${decision.amount ?? ''};`, hash);
          decisions += 1;
        }
        const result = applyAction(state, actor.id, decision.action, decision.amount);
        if (!result.ok) break;
        state = result.state;
      }
    }
  }
  return `${decisions}:${hash.toString(16)}`;
}

describe('easy, medium and hard decisions are unchanged', () => {
  it.each([
    // All three re-recorded when every level started reading the betting:
    // range-aware equity with per-level read trust, position-aware preflop
    // ranges, stack-to-pot ratio in commitment, and (medium and hard) one
    // texture-based size and one stack cap for value and bluffs, with bluffs
    // only from air. The decision counts were 290, 249 and 227: hands over
    // the same deals now end sooner.
    ['easy', '273:e7a023b6'],
    ['medium', '192:c8b2f05b'],
    ['hard', '175:2fa7f5f2'],
  ] as const)('%s matches its recorded fingerprint', (difficulty, expected) => {
    expect(digest(difficulty)).toBe(expected);
  }, 120_000);
});
