import { describe, expect, it } from 'vitest';
import { applyAction, compareHands, createGame, evaluateHand, startHand, type GameState } from '../../engine';
import { decideNextHandDeal, evaluateNextHandReadiness } from '../handReady';
import { displayHoleCards, exposureFromPublicCards, type PublicExposedHoleCards } from '../holeCardExposure';
import { hydrateGameState, redactGameState, type PublicGameState } from '../onlineSync';
import { isReveal, noteReveal, revealCountdownKey, revealHoldLeftMs, REVEAL_VISIBLE_MS } from '../revealHold';
import { selectShowdownHands } from '../showdownLayout';
import { botShowsHand, showdownOrder } from '../showdownOrder';
import { advanceReveal, pendingPlayer, startReveal } from '../showdownReveal';

/*
 * Build 67: turbo (the host) lost a contested river, flipped, and mikedafi
 * (the guest, who won) never saw the cards.
 */

const HOST = 'turbo';
const GUEST = 'mikedafi';

/** A checked-down river the guest wins outright, so the host has a losing hand to flip. */
function hostLosesAtTheRiver(): GameState {
  for (let s = 0; s < 400; s += 1) {
    let state = startHand(createGame(
      { smallBlind: 5, bigBlind: 10, startingStack: 100, maxPlayers: 6, turnTimerSec: 30 },
      [{ id: HOST, name: HOST, seatIndex: 0 }, { id: GUEST, name: GUEST, seatIndex: 1 }],
      `flip-${s}`,
    ));
    for (let i = 0; i < 20 && state.street !== 'showdown'; i += 1) {
      const p = state.players[state.currentPlayerIndex]!;
      const result = applyAction(state, p.id, state.currentBet > p.currentBet ? 'call' : 'check');
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    if (state.board.length === 5 && state.winners.length === 1 && state.winners[0]!.playerId === GUEST) return state;
  }
  throw new Error('no seed where the guest wins the river');
}

/**
 * What the Realtime Database hands back: an object keyed 0 and 1 comes back
 * as an array, and nothing else about the shape survives either.
 */
const throughTheDatabase = (publicState: PublicGameState): PublicGameState =>
  JSON.parse(JSON.stringify(publicState, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length > 0 && keys.every((k) => k === '0' || k === '1')) {
        return keys.sort().map((k) => (value as Record<string, unknown>)[k]);
      }
    }
    return value;
  })) as PublicGameState;

describe('a host flipping at the end of a hand', () => {
  it('reaches the guest: the republished state carries both cards and the guest lays them out', () => {
    const state = hostLosesAtTheRiver();
    // The host's republish after the flip: `shown` and `exposed` read from the room.
    const { publicState, privateViews } = redactGameState(state, { revealed: [HOST], exposed: { [HOST]: [true, true] } });
    const published = throughTheDatabase(publicState);
    const host = state.players.find((p) => p.id === HOST)!;
    const exposed = published.players[HOST]!.exposedHoleCards as PublicExposedHoleCards;
    expect(displayHoleCards([], exposed)).toEqual(host.holeCards);

    // The guest's own walk mucks the host, exactly as TableScreen does it.
    const felt = hydrateGameState(published, privateViews[GUEST]);
    const order = showdownOrder({
      players: felt.players,
      dealerIndex: felt.dealerIndex,
      lastAggressorIndex: felt.lastAggressorIndex ?? null,
      winnerIds: felt.winners.filter((w) => w.amount > 0).map((w) => w.playerId),
    });
    let progress = startReveal();
    for (let at = pendingPlayer(order, progress); at !== null; at = pendingPlayer(order, progress)) {
      const me = felt.players.find((p) => p.id === at)!;
      const stillBest = !progress.shown.some((id) => {
        const other = felt.players.find((p) => p.id === id)!;
        return compareHands(evaluateHand([...other.holeCards, ...felt.board]), evaluateHand([...me.holeCards, ...felt.board])) > 0;
      });
      progress = advanceReveal(order, progress, at === GUEST ? false : botShowsHand({ order, playerId: at, stillBest }));
    }
    expect(progress.shown).not.toContain(HOST);

    const exposedFor = (id: string) => published.players[id]?.exposedHoleCards;
    const rows = selectShowdownHands(felt.winners, felt.players, {
      localPlayerId: GUEST,
      localCardsShown: progress.shown.includes(GUEST),
      label: () => '',
      contested: true,
      shownIds: progress.shown,
      cardExposure: (id) => exposureFromPublicCards(exposedFor(id)),
      exposedCards: (id) => displayHoleCards([], exposedFor(id)),
    });
    expect(rows.find((r) => r.playerId === HOST)?.hole).toEqual(host.holeCards);
  });

  it('is not dealt away the moment the host asks for the next hand', () => {
    // The guest won and has already tapped Next Hand. The host flips, then
    // taps Next Hand itself a fraction of a second later.
    const T = 1_000_000;
    const readiness = evaluateNextHandReadiness({
      handNumber: 7,
      players: [
        { id: HOST, name: HOST, connected: true },
        { id: GUEST, name: GUEST, connected: true },
      ],
      ready: { [GUEST]: { handNumber: 7, ts: T - 5_000 } },
      now: T,
    });
    const flipped = noteReveal(7, T);
    const asked = T + 300;

    // Before revealHold this dealt immediately, and the next hand's publish
    // cleared the exposure before the guest's copy had finished flying in.
    const tooSoon = decideNextHandDeal({
      readiness, hostId: HOST, hostAskedAt: asked, rebuyWaiting: false,
      revealHeldMs: revealHoldLeftMs(flipped, 7, asked), now: asked,
    });
    expect(tooSoon.deal).toBe(false);
    expect(tooSoon.secondsLeft).toBeGreaterThan(0);

    const seen = T + REVEAL_VISIBLE_MS;
    expect(decideNextHandDeal({
      readiness, hostId: HOST, hostAskedAt: asked, rebuyWaiting: false,
      revealHeldMs: revealHoldLeftMs(flipped, 7, seen), now: seen,
    })).toMatchObject({ deal: true, reason: 'everyone' });
  });

  it('restarts the end-of-hand countdown on every reveal, and only on real ones', () => {
    // The old hold was the constant 3, set again by the empty event the
    // listener sends on subscribing and by the clear at each new hand, so
    // a later flip changed nothing and the countdown never restarted.
    expect(isReveal([])).toBe(false);
    expect(isReveal([HOST])).toBe(true);

    const first = noteReveal(4, 1_000);
    const second = noteReveal(4, 2_500);
    expect(revealCountdownKey(first, 4)).not.toBe(revealCountdownKey(null, 4));
    expect(revealCountdownKey(second, 4)).not.toBe(revealCountdownKey(first, 4));
    // Last hand's reveal is nothing to this one.
    expect(revealCountdownKey(first, 5)).toBe(revealCountdownKey(null, 5));
    expect(revealHoldLeftMs(first, 5, 1_001)).toBe(0);
  });
});
