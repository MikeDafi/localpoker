import { describe, expect, it } from 'vitest';
import {
  createGame,
  legalActions,
  startHand,
  type ActionResult,
  type Card,
  type GameConfig,
  type GameState,
  type PlayerAction,
  type PlayerInput,
  type Street,
} from '../../engine';
import {
  applyConnectionStatusToGameState,
  applyHostIntent,
  hydrateGameState,
  redactGameState,
  validateHostIntent,
  type OnlineIntent,
  type PrivatePlayerView,
  type PublicGameState,
} from '../onlineSync';

const config: GameConfig = {
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 100,
  maxPlayers: 6,
  turnTimerSec: 30,
};

const playerIds = ['host', 'client-a', 'client-b'] as const;

function players(ids: readonly string[] = playerIds): PlayerInput[] {
  return ids.map((id, seatIndex) => ({ id, name: id.toUpperCase(), seatIndex }));
}

function must(result: ActionResult): GameState {
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
  return result.state;
}

function currentPlayerId(state: GameState): string {
  const current = state.players[state.currentPlayerIndex];
  expect(current).toBeDefined();
  return current.id;
}

function cardNeedle(card: Card): string {
  return JSON.stringify({ rank: card.rank, suit: card.suit });
}

function liveShowdownPlayerIds(state: GameState): Set<string> {
  if (state.street !== 'showdown' || state.board.length !== 5) {
    return new Set();
  }

  const livePlayers = state.players.filter((player) => !player.folded && !player.sittingOut);
  return livePlayers.length > 1 ? new Set(livePlayers.map((player) => player.id)) : new Set();
}

function assertHydratedClientMatchesHost(
  hostState: GameState,
  publicState: PublicGameState,
  privateView: PrivatePlayerView,
): void {
  const clientState = hydrateGameState(publicState, privateView);

  expect(clientState.street).toBe(hostState.street);
  expect(clientState.board).toEqual(hostState.board);
  expect(clientState.pots).toEqual(hostState.pots);
  expect(clientState.currentPlayerIndex).toBe(hostState.currentPlayerIndex);
  expect(clientState.currentBet).toBe(hostState.currentBet);
  expect(clientState.minRaise).toBe(hostState.minRaise);
  expect(clientState.handNumber).toBe(hostState.handNumber);
  expect(clientState.contributions).toEqual(hostState.contributions);

  for (const hostPlayer of hostState.players) {
    const clientPlayer = clientState.players.find((player) => player.id === hostPlayer.id);
    expect(clientPlayer).toBeDefined();
    expect(clientPlayer).toMatchObject({
      id: hostPlayer.id,
      chips: hostPlayer.chips,
      folded: hostPlayer.folded,
      allIn: hostPlayer.allIn,
      currentBet: hostPlayer.currentBet,
      hasActed: hostPlayer.hasActed,
      sittingOut: hostPlayer.sittingOut,
    });

    if (hostPlayer.id === privateView.playerId) {
      expect(clientPlayer?.holeCards).toEqual(hostPlayer.holeCards);
    } else if (liveShowdownPlayerIds(hostState).has(hostPlayer.id)) {
      expect(clientPlayer?.holeCards).toEqual(hostPlayer.holeCards);
    } else {
      expect(clientPlayer?.holeCards).toEqual([]);
    }
  }
}

function assertPublishedPayloadIsSafe(
  hostState: GameState,
  publicState: PublicGameState,
  privateView: PrivatePlayerView,
  seed: string,
): void {
  const payload = JSON.stringify({ publicState, privateView });
  expect(payload).not.toContain('"deck"');
  expect(payload).not.toContain('"seed"');
  expect(payload).not.toContain(seed);

  const revealedAtShowdown = liveShowdownPlayerIds(hostState);
  for (const owner of hostState.players) {
    if (owner.id === privateView.playerId) {
      continue;
    }

    const opponentCardsMayBePublic = revealedAtShowdown.has(owner.id);
    for (const card of owner.holeCards) {
      if (opponentCardsMayBePublic) {
        expect(payload).toContain(cardNeedle(card));
      } else {
        expect(payload).not.toContain(cardNeedle(card));
      }
    }
  }

  if (hostState.street === 'showdown') {
    for (const player of hostState.players) {
      const publicHoleCards = publicState.players[player.id].holeCards;
      if (revealedAtShowdown.has(player.id)) {
        expect(publicHoleCards).toEqual(player.holeCards);
      } else {
        expect(publicHoleCards).toBeUndefined();
      }
    }
  }
}

function expectRejected(result: ReturnType<typeof validateHostIntent>, pattern: RegExp): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toMatch(pattern);
  }
}

describe('online sync end to end', () => {
  it('plays a whole online hand through host intents, redaction, and hydration', () => {
    const seed = 'online-e2e-seed-hidden';
    let hostState = startHand(createGame(config, players(), seed));
    let lastSeq = 0;
    let publishCount = 0;

    const publishAndAssert = () => {
      publishCount += 1;
      const { publicState, privateViews } = redactGameState(hostState, {
        code: 'ROOM12',
        updatedAt: publishCount,
      });

      expect(publicState.currentPlayerId).toBe(
        hostState.players[hostState.currentPlayerIndex]?.id ?? null,
      );
      expect(publicState.pots).toEqual(hostState.pots);

      for (const viewerId of playerIds) {
        assertHydratedClientMatchesHost(hostState, publicState, privateViews[viewerId]);
        assertPublishedPayloadIsSafe(hostState, publicState, privateViews[viewerId], seed);
      }
    };

    const drive = (playerId: string, intent: Omit<OnlineIntent, 'seq'>) => {
      const seq = lastSeq + 1;
      const sequencedIntent = { ...intent, seq };
      const validation = validateHostIntent(hostState, playerId, sequencedIntent, {
        actorId: playerId,
        lastAppliedSeq: lastSeq,
      });
      expect(validation.ok, validation.ok ? undefined : validation.error).toBe(true);

      hostState = must(applyHostIntent(hostState, playerId, sequencedIntent, {
        actorId: playerId,
        lastAppliedSeq: lastSeq,
      }));
      lastSeq = seq;
      publishAndAssert();
    };

    const driveCurrent = (type: PlayerAction) => {
      drive(currentPlayerId(hostState), { type });
    };

    expect(hostState.street).toBe('preflop');
    expect(hostState.board).toHaveLength(0);
    expect(hostState.contributions).toMatchObject({ 'client-a': 5, 'client-b': 10 });
    publishAndAssert();

    drive('host', { type: 'call' });
    drive('client-a', { type: 'call' });
    drive('client-b', { type: 'fold' });

    const checkThroughStreet = (street: Exclude<Street, 'preflop' | 'showdown'>) => {
      expect(hostState.street).toBe(street);
      while (hostState.street === street) {
        driveCurrent('check');
      }
    };

    checkThroughStreet('flop');
    expect(hostState.board).toHaveLength(4);
    checkThroughStreet('turn');
    expect(hostState.board).toHaveLength(5);
    checkThroughStreet('river');

    expect(hostState.street).toBe('showdown');
    expect(hostState.board).toHaveLength(5);
    expect(hostState.winners.reduce((sum, winner) => sum + winner.amount, 0)).toBe(30);
    publishAndAssert();

    hostState = startHand(hostState);
    expect(hostState.handNumber).toBe(2);
    expect(hostState.street).toBe('preflop');
    expect(hostState.board).toHaveLength(0);
    expect(hostState.players.every((player) => player.holeCards.length === 2)).toBe(true);
    publishAndAssert();
  });

  it('rejects unsafe client intents before applying them to the host game', () => {
    const state = startHand(createGame(config, players(), 'invalid-online-intents'));
    const current = currentPlayerId(state);

    expectRejected(validateHostIntent(state, 'client-a', { type: 'call' }), /not client-a's turn/);
    expectRejected(
      validateHostIntent(state, current, { type: 'call' }, { actorId: 'client-a' }),
      /cannot act/,
    );
    expectRejected(
      validateHostIntent(state, current, { type: 'raise', amount: 19 }),
      /outside the legal range/,
    );
    expectRejected(
      validateHostIntent(state, current, { type: 'call', seq: 10 }, { lastAppliedSeq: 10 }),
      /stale action sequence/,
    );

    let betState = startHand(createGame(config, players(['host', 'client-a']), 'bad-bet-stack'));
    betState = must(applyHostIntent(betState, 'host', { type: 'call' }));
    betState = must(applyHostIntent(betState, 'client-a', { type: 'check' }));
    const bettor = currentPlayerId(betState);
    const legal = legalActions(betState, bettor);
    expectRejected(
      validateHostIntent(betState, bettor, { type: 'bet', amount: (legal.maxBet ?? 0) + 1 }),
      /outside the legal range/,
    );
  });

  it('folds disconnected non-hosts in the host state so the table can continue', () => {
    let state = startHand(createGame(config, players(), 'disconnect-fold'));
    state = must(applyHostIntent(state, 'host', { type: 'call' }));
    expect(currentPlayerId(state)).toBe('client-a');

    const result = applyConnectionStatusToGameState(state, {
      host: true,
      'client-a': false,
      'client-b': true,
    });

    expect(result.changed).toBe(true);
    expect(result.state.players.find((player) => player.id === 'client-a')).toMatchObject({
      folded: true,
      sittingOut: true,
    });
    expect(currentPlayerId(result.state)).toBe('client-b');
  });
});
