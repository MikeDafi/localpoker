import { describe, expect, it } from 'vitest';
import { decideAction } from '../bot';
import { applyAction, createGame, legalActions, startHand } from '../holdem';
import type { BotDecision, GameConfig, GameState, LegalActions } from '../types';

const config: GameConfig = {
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 250,
  maxPlayers: 6,
  turnTimerSec: 30,
};

function assertDecisionIsLegal(legal: LegalActions, decision: BotDecision): void {
  expect(legal.actions).toContain(decision.action);
  if (decision.action === 'bet') {
    expect(decision.amount!).toBeGreaterThanOrEqual(legal.minBet!);
    expect(decision.amount!).toBeLessThanOrEqual(legal.maxBet!);
  }
  if (decision.action === 'raise') {
    expect(decision.amount!).toBeGreaterThanOrEqual(legal.minRaiseTo!);
    expect(decision.amount!).toBeLessThanOrEqual(legal.maxRaiseTo!);
  }
}

function botGame(seed: number): GameState {
  return startHand(createGame(config, [
    { id: 'a', name: 'A', seatIndex: 0, isBot: true },
    { id: 'b', name: 'B', seatIndex: 1, isBot: true },
    { id: 'c', name: 'C', seatIndex: 2, isBot: true },
    { id: 'd', name: 'D', seatIndex: 3, isBot: true },
  ], seed));
}

describe('bot', () => {
  it('returns legal actions across many deterministic game states', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      let state = botGame(seed);

      for (let step = 0; step < 100 && state.street !== 'showdown'; step += 1) {
        const player = state.players[state.currentPlayerIndex];
        expect(player, `seed ${seed} step ${step}`).toBeDefined();
        const legal = legalActions(state, player.id);
        const decision = decideAction(state, player.id);
        assertDecisionIsLegal(legal, decision);

        const result = applyAction(state, player.id, decision.action, decision.amount);
        expect(result.ok, result.ok ? undefined : result.error).toBe(true);
        if (!result.ok) break;
        state = result.state;
      }

      expect(state.street).toBe('showdown');
      expect(state.players.reduce((sum, player) => sum + player.chips, 0)).toBe(config.startingStack * 4);
    }
    // Every decision now runs a Monte Carlo rollout (preflop included), so this
    // sweep is a few seconds rather than instant.
  }, 120_000);
});
