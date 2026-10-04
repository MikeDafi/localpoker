import { describe, it, expect } from 'vitest';

import {
  MIN_PLAYERS_TO_DEAL,
  REBUY_WINDOW_MS,
  applyRebuyRequest,
  bustedPlayers,
  canDealHand,
  eliminatedPlayers,
  localPlayerEvicted,
  playersAbleToDeal,
  playersToEvict,
  rebuyNotice,
  rebuyPhase,
} from '../rebuyWindow';

const seat = (id: string, chips: number, extra: { sittingOut?: boolean } = {}) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  chips,
  ...extra,
});

describe('canDealHand', () => {
  it('deals to two players holding chips', () => {
    expect(canDealHand([seat('alice', 500), seat('bob', 500)])).toBe(true);
  });

  it('will not deal to one', () => {
    expect(canDealHand([seat('alice', 500), seat('bob', 0)])).toBe(false);
  });

  it('counts only players who can actually bet', () => {
    const table = [seat('alice', 500), seat('bob', 500, { sittingOut: true }), seat('cara', 0)];
    expect(playersAbleToDeal(table).map((p) => p.id)).toEqual(['alice']);
    expect(canDealHand(table)).toBe(false);
  });

  it('needs the stated minimum, not some other number', () => {
    const table = Array.from({ length: MIN_PLAYERS_TO_DEAL }, (_, i) => seat(`p${i}`, 100));
    expect(canDealHand(table)).toBe(true);
    expect(canDealHand(table.slice(1))).toBe(false);
  });
});

describe('bustedPlayers', () => {
  it('finds players holding nothing', () => {
    expect(bustedPlayers([seat('alice', 500), seat('bob', 0)]).map((p) => p.id)).toEqual(['bob']);
  });

  it('leaves alone somebody who stepped away with chips in front of them', () => {
    expect(bustedPlayers([seat('alice', 500, { sittingOut: true })])).toEqual([]);
  });

  it('treats a negative stack as busted, since it is certainly not playable', () => {
    expect(bustedPlayers([seat('bob', -5)]).map((p) => p.id)).toEqual(['bob']);
  });

  it('does not offer a tournament rebuy to an eliminated player', () => {
    expect(bustedPlayers([seat('bob', 0)], true)).toEqual([]);
    expect(eliminatedPlayers([seat('bob', 0)], true).map((p) => p.id)).toEqual(['bob']);
  });
});

describe('rebuyPhase', () => {
  const now = 1_000_000;
  const busted = [seat('alice', 500), seat('bob', 0)];

  it('waits on nobody when everyone has chips', () => {
    const phase = rebuyPhase({ players: [seat('alice', 500), seat('bob', 500)], openedAt: now, now });
    expect(phase.phase).toBe('none');
  });

  it('does not open a rebuy window in a tournament', () => {
    const phase = rebuyPhase({ players: busted, openedAt: now, now, tournament: true });
    expect(phase.phase).toBe('none');
  });

  /*
   * The case that makes this safe to ship: a short player at a full table is
   * not holding anything up, so putting them on a clock would evict somebody
   * nobody was waiting for.
   */
  it('waits on nobody when the hand can be dealt without the busted player', () => {
    const phase = rebuyPhase({
      players: [seat('alice', 500), seat('bob', 500), seat('cara', 0)],
      openedAt: now,
      now,
    });
    expect(phase.phase).toBe('none');
  });

  it('opens a full window before the clock has started', () => {
    const phase = rebuyPhase({ players: busted, openedAt: null, now });
    expect(phase).toMatchObject({ phase: 'waiting', msLeft: REBUY_WINDOW_MS });
  });

  it('counts down once the clock starts', () => {
    const phase = rebuyPhase({ players: busted, openedAt: now, now: now + 20_000 });
    if (phase.phase !== 'waiting') throw new Error('expected to still be waiting');
    expect(phase.msLeft).toBe(REBUY_WINDOW_MS - 20_000);
    expect(phase.secondsLeft).toBe(25);
    expect(phase.players.map((p) => p.id)).toEqual(['bob']);
  });

  it('rounds the clock up, so it never shows 0 while time remains', () => {
    const phase = rebuyPhase({ players: busted, openedAt: now, now: now + REBUY_WINDOW_MS - 1 });
    if (phase.phase !== 'waiting') throw new Error('expected to still be waiting');
    expect(phase.secondsLeft).toBe(1);
  });

  it('expires exactly when the window runs out', () => {
    const phase = rebuyPhase({ players: busted, openedAt: now, now: now + REBUY_WINDOW_MS });
    expect(phase.phase).toBe('expired');
  });

  it('stays expired afterwards rather than wrapping round', () => {
    const phase = rebuyPhase({ players: busted, openedAt: now, now: now + REBUY_WINDOW_MS * 5 });
    expect(phase).toMatchObject({ phase: 'expired' });
  });

  it('closes the moment the busted player rebuys', () => {
    const after = rebuyPhase({
      players: [seat('alice', 500), seat('bob', 2000)],
      openedAt: now,
      now: now + 10_000,
    });
    expect(after.phase).toBe('none');
  });

  it('honours a caller supplied window, which is what the tests above assume', () => {
    const phase = rebuyPhase({ players: busted, openedAt: now, now: now + 6000, windowMs: 5000 });
    expect(phase.phase).toBe('expired');
  });

  it('waits on every busted player, not only the first', () => {
    const phase = rebuyPhase({
      players: [seat('alice', 500), seat('bob', 0), seat('cara', 0)],
      openedAt: now,
      now,
    });
    if (phase.phase !== 'waiting') throw new Error('expected to be waiting');
    expect(phase.players.map((p) => p.id)).toEqual(['bob', 'cara']);
  });
});

describe('rebuyNotice', () => {
  const now = 0;
  const phaseFor = (players: ReturnType<typeof seat>[], elapsed = 0) =>
    rebuyPhase({ players, openedAt: now, now: now + elapsed });

  it('asks the local player directly when it is their stack that is empty', () => {
    const notice = rebuyNotice(phaseFor([seat('alice', 500), seat('bob', 0)]), 'bob');
    expect(notice).toBe('Rebuy to keep playing \u00b7 45s');
  });

  it('names the player everyone else is waiting on', () => {
    const notice = rebuyNotice(phaseFor([seat('alice', 500), seat('bob', 0)]), 'alice');
    expect(notice).toBe('Waiting for Bob to rebuy \u00b7 45s');
  });

  it('counts them when more than one is short', () => {
    const notice = rebuyNotice(phaseFor([seat('alice', 500), seat('bob', 0), seat('cara', 0)]), 'alice');
    expect(notice).toBe('Waiting for 2 players to rebuy \u00b7 45s');
  });

  it('shows the clock running down', () => {
    const notice = rebuyNotice(phaseFor([seat('alice', 500), seat('bob', 0)], 30_000), 'alice');
    expect(notice).toBe('Waiting for Bob to rebuy \u00b7 15s');
  });

  it('says nothing when nobody is being waited on', () => {
    expect(rebuyNotice({ phase: 'none' }, 'alice')).toBeNull();
    expect(rebuyNotice({ phase: 'expired', players: [] }, 'alice')).toBeNull();
  });
});

describe('eviction', () => {
  it('evicts whoever is still holding nothing', () => {
    const table = [seat('alice', 500), seat('bob', 0), seat('cara', 0)];
    expect(playersToEvict(table).map((p) => p.id)).toEqual(['bob', 'cara']);
  });

  it('spares anyone who took the rebuy', () => {
    const table = [seat('alice', 500), seat('bob', 2000), seat('cara', 0)];
    expect(playersToEvict(table).map((p) => p.id)).toEqual(['cara']);
  });

  it('evicts tournament eliminations immediately when a caller asks for them', () => {
    const table = [seat('alice', 500), seat('bob', 0)];
    expect(playersToEvict(table, true).map((p) => p.id)).toEqual(['bob']);
  });

  it('tells the local player apart from everyone else', () => {
    const expired = { phase: 'expired' as const, players: [seat('bob', 0)] };
    expect(localPlayerEvicted(expired, 'bob')).toBe(true);
    expect(localPlayerEvicted(expired, 'alice')).toBe(false);
  });

  it('never claims an eviction while the clock is still running', () => {
    const waiting = rebuyPhase({ players: [seat('alice', 500), seat('bob', 0)], openedAt: 0, now: 1 });
    expect(localPlayerEvicted(waiting, 'bob')).toBe(false);
  });
});

describe('applyRebuyRequest', () => {
  const now = 5_000;

  it('restores a busted player to the host starting stack', () => {
    const result = applyRebuyRequest({
      players: [seat('alice', 500), seat('bob', 0)],
      playerId: 'bob',
      startingStack: 1500,
      windowOpen: true,
      openedAt: now,
      now: now + 1000,
    });

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('expected rebuy to apply');
    expect(result.chips).toBe(1500);
    expect(result.players.find((p) => p.id === 'bob')?.chips).toBe(1500);
  });

  it('clears sitting out when the rebuy is accepted', () => {
    const result = applyRebuyRequest({
      players: [seat('alice', 500), seat('bob', 0)],
      playerId: 'bob',
      startingStack: 2000,
      windowOpen: true,
      openedAt: null,
      now,
    });

    if (result.status !== 'applied') throw new Error('expected rebuy to apply');
    expect(result.players.find((p) => p.id === 'bob')?.sittingOut).toBe(false);
  });

  it('reports a duplicate request after the stack was restored', () => {
    const result = applyRebuyRequest({
      players: [seat('alice', 500), seat('bob', 2000)],
      playerId: 'bob',
      startingStack: 2000,
      windowOpen: false,
      openedAt: now,
      now,
    });

    expect(result).toEqual({ status: 'already-applied', playerId: 'bob', chips: 2000 });
  });

  it('rejects a request for an unknown seat', () => {
    const result = applyRebuyRequest({
      players: [seat('alice', 500), seat('bob', 0)],
      playerId: 'mallory',
      startingStack: 2000,
      windowOpen: true,
      openedAt: now,
      now,
    });

    expect(result).toEqual({ status: 'rejected', reason: 'unknown-player' });
  });

  it('rejects a request before the rebuy window opens', () => {
    const result = applyRebuyRequest({
      players: [seat('alice', 500), seat('bob', 0)],
      playerId: 'bob',
      startingStack: 2000,
      windowOpen: false,
      openedAt: null,
      now,
    });

    expect(result).toEqual({ status: 'rejected', reason: 'not-in-rebuy-window' });
  });

  it('rejects a request after the rebuy window expires', () => {
    const result = applyRebuyRequest({
      players: [seat('alice', 500), seat('bob', 0)],
      playerId: 'bob',
      startingStack: 2000,
      windowOpen: true,
      openedAt: now,
      now: now + REBUY_WINDOW_MS,
    });

    expect(result).toEqual({ status: 'rejected', reason: 'not-in-rebuy-window' });
  });

  it('rejects top offs while another hand can be dealt', () => {
    const result = applyRebuyRequest({
      players: [seat('alice', 500), seat('bob', 100), seat('cara', 500)],
      playerId: 'bob',
      startingStack: 2000,
      windowOpen: true,
      openedAt: now,
      now,
    });

    expect(result).toEqual({ status: 'rejected', reason: 'not-in-rebuy-window' });
  });

  it('rejects a tournament rebuy for an eliminated player', () => {
    const result = applyRebuyRequest({
      players: [seat('alice', 500), seat('bob', 0)],
      playerId: 'bob',
      startingStack: 2000,
      windowOpen: true,
      openedAt: now,
      now,
      tournament: true,
    });

    expect(result).toEqual({ status: 'rejected', reason: 'eliminated' });
  });

  it('rejects an invalid host starting stack instead of inventing one', () => {
    const result = applyRebuyRequest({
      players: [seat('alice', 500), seat('bob', 0)],
      playerId: 'bob',
      startingStack: 0,
      windowOpen: true,
      openedAt: now,
      now,
    });

    expect(result).toEqual({ status: 'rejected', reason: 'invalid-starting-stack' });
  });
});
