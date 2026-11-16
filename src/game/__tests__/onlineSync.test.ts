import { describe, expect, it } from 'vitest';
import { applyAction, createGame, startHand, type ActionResult, type GameConfig, type GameState, type PlayerInput } from '../../engine';
import { applyHostIntent, atLeastAsFresh, hydrateGameState, redactGameState, shouldEndOnlineTableForTooFewPlayers, validateHostIntent } from '../onlineSync';

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

  it('tells guests who bet the river, so the bettor shows first rather than being asked', () => {
    let state = startHand(createGame(config, players(['a', 'b']), 'redaction-aggressor'));
    state = must(applyAction(state, 'a', 'call'));
    state = must(applyAction(state, 'b', 'check'));
    for (let i = 0; i < 4; i += 1) state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));
    const bettor = state.players[state.currentPlayerIndex].id;
    state = must(applyAction(state, bettor, 'bet', 20));
    state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'call'));

    expect(state.street).toBe('showdown');
    const bettorIndex = state.players.findIndex((p) => p.id === bettor);
    expect(state.lastAggressorIndex).toBe(bettorIndex);
    const guest = hydrateGameState(redactGameState(state).publicState);
    expect(guest.lastAggressorIndex).toBe(bettorIndex);
  });

  it('leaves the aggressor empty for guests when the river was checked through', () => {
    let state = startHand(createGame(config, players(['a', 'b']), 'redaction-checked'));
    state = must(applyAction(state, 'a', 'call'));
    state = must(applyAction(state, 'b', 'check'));
    for (let i = 0; i < 6; i += 1) state = must(applyAction(state, state.players[state.currentPlayerIndex].id, 'check'));

    const { publicState } = redactGameState(state);
    expect('lastAggressorIndex' in publicState).toBe(false);
    expect(hydrateGameState(publicState).lastAggressorIndex).toBeNull();
  });
});

/** What the Realtime Database hands back: empty arrays and objects simply vanish. */
const asStoredInRtdb = <T,>(value: T): T => {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      const out = v.map(strip).filter((x) => x !== undefined);
      return out.length ? out : undefined;
    }
    if (v && typeof v === 'object') {
      const entries = Object.entries(v).map(([k, x]) => [k, strip(x)] as const).filter(([, x]) => x !== undefined);
      return entries.length ? Object.fromEntries(entries) : undefined;
    }
    return v;
  };
  return strip(JSON.parse(JSON.stringify(value))) as T;
};

describe('hydrating a room read back from the database', () => {
  /*
   * Build 65 crashed on every resume here: a pot nobody was eligible for came
   * back with no eligiblePlayerIds at all, and spreading it threw.
   */
  it('survives a pot whose eligible list the database dropped', () => {
    const state = startHand(createGame(config, players(['a', 'b']), 'rtdb-empty-pot'));
    const { publicState } = redactGameState(state);
    const stored = asStoredInRtdb({ ...publicState, pots: [{ amount: 30, eligiblePlayerIds: [] }], contributions: {} });

    const guest = hydrateGameState(stored);
    expect(guest.pots).toEqual([{ amount: 30, eligiblePlayerIds: [] }]);
    expect(guest.players.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('survives a room with no players left at all', () => {
    const state = startHand(createGame(config, players(['a', 'b']), 'rtdb-no-players'));
    const { publicState } = redactGameState(state);
    const stored = asStoredInRtdb({ ...publicState, players: {}, playerOrder: [] });

    expect(hydrateGameState(stored).players).toEqual([]);
  });
});

describe('applyHostIntent on a broken table', () => {
  /*
   * A host rebuilt without its deck used to throw out of a state updater and
   * crash the table. It must come back as an ordinary refusal instead.
   */
  it('refuses rather than throwing when the engine cannot deal', () => {
    let state = startHand(createGame(config, players(['a', 'b']), 'no-deck'));
    state = { ...state, deck: [] };
    const actor = state.players[state.currentPlayerIndex].id;
    const callFirst = applyHostIntent(state, actor, { type: 'call' });
    const next = callFirst.ok ? callFirst.state : state;
    const closer = next.players[next.currentPlayerIndex].id;
    expect(() => applyHostIntent(next, closer, { type: 'check' })).not.toThrow();
    expect(applyHostIntent(next, closer, { type: 'check' }).ok).toBe(false);
  });
});

describe('host replay protection', () => {
  /*
   * A host that remounts mid-hand re-reads every action of the hand. The
   * applied sequence lives on the state, so it survives the remount.
   */
  it('refuses an action sequence it has already applied', () => {
    const state = startHand(createGame(config, players(['a', 'b']), 'replay'));
    const actor = state.players[state.currentPlayerIndex].id;
    const first = applyHostIntent(state, actor, { type: 'call', seq: 5 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.appliedSeq).toBe(5);
    const restored = JSON.parse(JSON.stringify(first.state));
    const replayed = applyHostIntent(restored, actor, { type: 'call', seq: 5 });
    expect(replayed.ok).toBe(false);
  });
});

describe('cards flipped at the end of a hand reach everyone', () => {
  /*
   * The end-of-hand flip writes exposed/<you>/0 and /1, and the host
   * republishes. These pin that the host's publish really carries both cards
   * to the other players, in the two cases the button exists for.
   */
  it('publishes the winner\'s flipped cards after a pot won on a fold', () => {
    let state = startHand(createGame(config, players(['a', 'b']), 'flip-after-fold-win'));
    const first = state.players[state.currentPlayerIndex].id;
    const res = applyHostIntent(state, first, { type: 'fold' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    state = res.state;
    const winner = state.players.find((p) => !p.folded)!;
    const { publicState } = redactGameState(state, { exposed: { [winner.id]: [true, true] } as never });
    expect(publicState.players[winner.id].exposedHoleCards).toEqual({ 0: winner.holeCards[0], 1: winner.holeCards[1] });
  });

  it('publishes a folded player\'s cards when they flip to show what they laid down', () => {
    let state = startHand(createGame(config, players(['a', 'b']), 'flip-after-folding'));
    const folder = state.players[state.currentPlayerIndex].id;
    const res = applyHostIntent(state, folder, { type: 'fold' });
    if (!res.ok) throw new Error(res.error);
    state = res.state;
    const me = state.players.find((p) => p.id === folder)!;
    expect(me.holeCards).toHaveLength(2);
    const { publicState } = redactGameState(state, { exposed: { [folder]: [true, true] } as never });
    expect(publicState.players[folder].exposedHoleCards).toEqual({ 0: me.holeCards[0], 1: me.holeCards[1] });
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

describe('online table lifecycle', () => {
  it('ends a playing table once fewer than two seats remain', () => {
    expect(shouldEndOnlineTableForTooFewPlayers({
      status: 'playing',
      players: {
        host: { id: 'host' },
      },
    })).toBe(true);
  });

  it('keeps live playing tables and lobbies that are still waiting for players', () => {
    expect(shouldEndOnlineTableForTooFewPlayers({
      status: 'playing',
      players: {
        host: { id: 'host' },
        guest: { id: 'guest' },
      },
    })).toBe(false);
    expect(shouldEndOnlineTableForTooFewPlayers({
      status: 'lobby',
      players: {
        host: { id: 'host' },
      },
    })).toBe(false);
    expect(shouldEndOnlineTableForTooFewPlayers({
      status: 'ended',
      players: {
        host: { id: 'host' },
      },
    })).toBe(false);
  });
});

describe('atLeastAsFresh', () => {
  it('prefers the later hand, then the longer log within a hand', () => {
    const at = (handNumber: number, entries: number) => ({ handNumber, log: Array.from({ length: entries }, () => 'x') });
    expect(atLeastAsFresh(at(4, 2), at(3, 50))).toBe(true);
    expect(atLeastAsFresh(at(3, 50), at(4, 2))).toBe(false);
    // A publish that finished late must not stand in for the river.
    expect(atLeastAsFresh(at(4, 9), at(4, 12))).toBe(false);
    expect(atLeastAsFresh(at(4, 12), at(4, 12))).toBe(true);
  });
});
