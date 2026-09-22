import { describe, expect, it } from 'vitest';
import { decideAction, type Difficulty } from '../bot';
import { monteCarloEquity } from '../equity';
import { applyAction, createGame, legalActions, startHand } from '../holdem';
import type { GameConfig } from '../types';

const config: GameConfig = {
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 1000,
  maxPlayers: 6,
  turnTimerSec: 30,
};

/**
 * Score a difficulty on how often its call/fold choices agree with the correct
 * pot-odds decision, judged against a far more precise equity estimate than any
 * bot is allowed to compute.
 *
 * Win-rate is the obvious metric but is useless at this sample size: heads-up
 * poker over a few hundred hands has a standard error larger than the skill gap
 * being measured, and the bots differ by RNG identity so seat-swapped duplicate
 * matches don't cancel either. Decision accuracy is low-variance and measures
 * the thing difficulty is actually supposed to change.
 */
function decisionAccuracy(difficulty: Difficulty, hands: number, truthSims: number): number {
  let scored = 0;
  let correct = 0;

  for (let h = 0; h < hands; h += 1) {
    const players = [0, 1, 2, 3].map((i) => ({ id: `P${i}`, name: `P${i}`, seatIndex: i, isBot: true }));
    let state = startHand(createGame(config, players, 4200 + h));

    for (let step = 0; step < 300 && state.street !== 'showdown'; step += 1) {
      const actor = state.players[state.currentPlayerIndex];
      if (!actor) break;
      const legal = legalActions(state, actor.id);
      const decision = decideAction(state, actor.id, difficulty);

      if (legal.toCall > 0 && (decision.action === 'call' || decision.action === 'fold')) {
        const opponents = Math.max(
          1,
          state.players.filter((p) => p.id !== actor.id && !p.folded && !p.sittingOut).length,
        );
        const truth = monteCarloEquity(
          actor.holeCards,
          state.board,
          opponents,
          truthSims,
          `truth:${h}:${actor.id}:${state.street}:${state.log.length}`,
        );
        const pot = state.pots.reduce((sum, p) => sum + p.amount, 0);
        const potOdds = legal.toCall / (pot + legal.toCall);
        if ((truth >= potOdds) === (decision.action === 'call')) correct += 1;
        scored += 1;
      }

      const result = applyAction(state, actor.id, decision.action, decision.amount);
      if (!result.ok) break;
      state = result.state;
    }
  }

  return scored === 0 ? 0 : correct / scored;
}

describe('bot difficulty', () => {
  it('makes better call/fold decisions as difficulty rises', () => {
    const easy = decisionAccuracy('easy', 14, 600);
    const expert = decisionAccuracy('expert', 14, 600);

    // Measured over a much larger sample the full ladder is monotonic
    // (easy 61% / medium 81% / hard 89% / expert 89%). The gap between hard and
    // expert is small, so only the ends are asserted here to keep this fast and
    // non-flaky.
    expect(expert).toBeGreaterThan(easy + 0.1);
    expect(easy).toBeGreaterThan(0.4);
    expect(expert).toBeGreaterThan(0.75);
  }, 120_000);
});
