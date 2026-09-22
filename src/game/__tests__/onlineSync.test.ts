import { describe, expect, it } from 'vitest';
import { applyAction, createGame, startHand, type ActionResult, type GameConfig, type GameState, type PlayerInput } from '../../engine';
import { applyHostIntent, redactGameState, validateHostIntent } from '../onlineSync';

const config: GameConfig = {
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 100,
  maxPlayers: 6,
  turnTimerSec: 30,
};

function players(ids = ['a', 'b', 'c']): PlayerInput[] {
  return ids.map((id, seatIndex) => ({ id, name: id.toUpperCase(), seatIndex }));
}

function must(result: ActionResult): GameState {
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
  return result.state;
}

describe('online redaction', () => {
  it('publishes no deck and no unrevealed hole cards, while private views contain only the owner cards', () => {
    const state = startHand(createGame(config, players(), 'redaction-preflop'));
    const { publicState, privateViews } = redactGameState(state, { code: 'ROOM12', updatedAt: 123 });

    expect('deck' in publicState).toBe(false);
    expect('seed' in publicState).toBe(false);

    for (const player of state.players) {
      expect(publicState.players[player.id].holeCards).toBeUndefined();
      expect(privateViews[player.id]).toMatchObject({
        code: 'ROOM12',
        playerId: player.id,
        handNumber: state.handNumber,
      });
      expect(privateViews[player.id].holeCards).toEqual(player.holeCards);

      const other = state.players.find((candidate) => candidate.id !== player.id)!;
      expect(privateViews[player.id].holeCards).not.toEqual(other.holeCards);
    }
  });

  it('reveals only live showdown hands in the public view', () => {
    let state = startHand(createGame(config, players(['a', 'b']), 'redaction-showdown'));
    state = must(applyAction(state, 'a', 'call'));
    state = must(applyAction(state, 'b', 'check'));
    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));

    const { publicState } = redactGameState(state);

    expect(state.street).toBe('showdown');
    expect(state.board).toHaveLength(5);
    expect(publicState.players.a.holeCards).toEqual(state.players.find((player) => player.id === 'a')?.holeCards);
    expect(publicState.players.b.holeCards).toEqual(state.players.find((player) => player.id === 'b')?.holeCards);
  });
});

describe('host intent validation', () => {
  it('rejects out-of-turn intents', () => {
    const state = startHand(createGame(config, players(), 'out-of-turn'));

    const result = validateHostIntent(state, 'b', { type: 'fold' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not b's turn/);
  });

  it('rejects illegal actions even from the current player', () => {
    const state = startHand(createGame(config, players(), 'illegal-action'));
    const current = state.players[state.currentPlayerIndex].id;

    const result = validateHostIntent(state, current, { type: 'check' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not legal/);
  });

  it('rejects amounts outside the legal range', () => {
    const state = startHand(createGame(config, players(), 'bad-amount'));
    const current = state.players[state.currentPlayerIndex].id;

    const result = validateHostIntent(state, current, { type: 'raise', amount: 19 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/outside the legal range/);
  });

  it('applies valid intents through the engine', () => {
    const state = startHand(createGame(config, players(), 'valid-intent'));
    const current = state.players[state.currentPlayerIndex].id;

    const result = applyHostIntent(state, current, { type: 'call' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.players[0].currentBet).toBe(10);
  });
});
