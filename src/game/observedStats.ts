import type { GameState } from '../engine';

/**
 * Opponent stats worked out by watching the table, not by asking anyone.
 *
 * The obvious way to show an opponent's VPIP online is to have every client
 * publish its own lifetime figures, but a client can publish whatever it
 * likes, so those numbers are unverifiable, and they leak a player's history to
 * everyone they sit with. Worse, they would be unavailable for bots, so the
 * feature would vanish in single-player.
 *
 * Real poker HUDs solve this by counting what a player actually does at the
 * table, and so does this. Everything here is inferred from consecutive game
 * states, which means it works identically for bots, for local play, and for
 * networked opponents, needs nothing added to the wire format, and cannot be
 * faked: the only evidence used is money that actually moved.
 *
 * The cost is sample size, a few dozen hands is not enough for a percentage to
 * settle: so the hand count is always shown alongside.
 */

export interface ObservedCounters {
  handsSeen: number;
  vpipHands: number;
  pfrHands: number;
  /** Bets and raises: the actions that put an opponent under pressure. */
  aggressiveActions: number;
  calls: number;
  handsWon: number;
  showdowns: number;
  showdownWins: number;
}

export interface ObservedTable {
  counters: Record<string, ObservedCounters>;
  /** The hand currently being watched, and what has already been credited. */
  handNumber: number;
  vpipCredited: Record<string, boolean>;
  pfrCredited: Record<string, boolean>;
  winCredited: boolean;
  showdownCredited: boolean;
}

export function emptyCounters(): ObservedCounters {
  return {
    handsSeen: 0,
    vpipHands: 0,
    pfrHands: 0,
    aggressiveActions: 0,
    calls: 0,
    handsWon: 0,
    showdowns: 0,
    showdownWins: 0,
  };
}

export function emptyObservedTable(): ObservedTable {
  return {
    counters: {},
    handNumber: -1,
    vpipCredited: {},
    pfrCredited: {},
    winCredited: false,
    showdownCredited: false,
  };
}

/**
 * Fetch a player's counters, copying them first.
 *
 * `observeTransition` spreads `counters`, which is only a shallow copy, the
 * per-player objects underneath would still be shared with the previous
 * observation. Mutating one of those would rewrite history, and would double
 * count under React's development-mode double invocation of state updaters.
 * Copying on write keeps the whole function pure.
 */
function counterFor(t: ObservedTable, id: string): ObservedCounters {
  const copy = t.counters[id] ? { ...t.counters[id] } : emptyCounters();
  t.counters[id] = copy;
  return copy;
}

/**
 * Fold one state transition into the table's observations.
 *
 * Money is tracked through each player's stack rather than through their
 * current bet, because the engine zeroes current bets when a street ends. The
 * action that *closes* a street is usually the most interesting one in the
 * hand, so reading current bets would have quietly dropped every river bet on
 * the floor. A stack only ever falls when its owner puts chips in, whatever the
 * street is doing.
 */
export function observeTransition(table: ObservedTable, prev: GameState | null, next: GameState): ObservedTable {
  const t: ObservedTable = {
    counters: { ...table.counters },
    handNumber: table.handNumber,
    vpipCredited: { ...table.vpipCredited },
    pfrCredited: { ...table.pfrCredited },
    winCredited: table.winCredited,
    showdownCredited: table.showdownCredited,
  };

  const newHand = !prev || next.handNumber !== t.handNumber;
  if (newHand) {
    t.handNumber = next.handNumber;
    t.vpipCredited = {};
    t.pfrCredited = {};
    t.winCredited = false;
    t.showdownCredited = false;
    for (const p of next.players) {
      if (!p.sittingOut) counterFor(t, p.id).handsSeen += 1;
    }
    // Chip deltas across a hand boundary are pots being pushed, not bets.
    return t;
  }

  if (prev && next.handNumber === prev.handNumber) {
    const prevById = new Map(prev.players.map((p) => [p.id, p]));
    for (const now of next.players) {
      const before = prevById.get(now.id);
      if (!before) continue;
      const spent = before.chips - now.chips;
      if (spent <= 0) continue;
      const toCall = Math.max(0, prev.currentBet - before.currentBet);
      const c = counterFor(t, now.id);
      // Putting in more than was owed is a bet or a raise; matching it is a
      // call. An all-in for less than the call still counts as a call.
      if (spent > toCall) c.aggressiveActions += 1;
      else c.calls += 1;

      if (prev.street === 'preflop') {
        if (!t.vpipCredited[now.id]) {
          t.vpipCredited[now.id] = true;
          c.vpipHands += 1;
        }
        if (spent > toCall && !t.pfrCredited[now.id]) {
          t.pfrCredited[now.id] = true;
          c.pfrHands += 1;
        }
      }
    }

    // A showdown is cards actually being compared, so it needs two players left.
    if (!t.showdownCredited && next.street === 'showdown' && prev.street !== 'showdown') {
      const live = next.players.filter((p) => !p.folded && !p.sittingOut);
      if (live.length >= 2) {
        t.showdownCredited = true;
        for (const p of live) counterFor(t, p.id).showdowns += 1;
      }
    }

    if (!t.winCredited && next.winners.length > 0 && prev.winners.length === 0) {
      t.winCredited = true;
      for (const w of next.winners) {
        if (w.amount <= 0) continue;
        const c = counterFor(t, w.playerId);
        c.handsWon += 1;
        if (t.showdownCredited) c.showdownWins += 1;
      }
    }
  }

  return t;
}

export interface ObservedStats {
  handsSeen: number;
  vpip: number | null;
  pfr: number | null;
  af: number | null;
  winRate: number | null;
  showdownWinRate: number | null;
}

/**
 * Turn raw counts into the percentages the UI shows.
 *
 * Rates are `null` rather than 0 when nothing has been observed yet, because
 * "we have not seen them play" and "they never do this" are completely
 * different claims about an opponent and must not look the same.
 */
export function observedStats(c: ObservedCounters | undefined): ObservedStats {
  const counters = c ?? emptyCounters();
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
  return {
    handsSeen: counters.handsSeen,
    vpip: pct(counters.vpipHands, counters.handsSeen),
    pfr: pct(counters.pfrHands, counters.handsSeen),
    af:
      counters.calls > 0
        ? Math.round((counters.aggressiveActions / counters.calls) * 10) / 10
        : counters.aggressiveActions > 0
          ? Infinity
          : null,
    winRate: pct(counters.handsWon, counters.handsSeen),
    showdownWinRate: pct(counters.showdownWins, counters.showdowns),
  };
}

/** How an opponent plays, in a couple of words, once there is enough to say it. */
export function playerRead(s: ObservedStats): string | null {
  if (s.handsSeen < 8 || s.vpip == null || s.pfr == null) return null;
  const loose = s.vpip >= 40;
  const tight = s.vpip <= 18;
  const aggressive = s.pfr >= Math.max(10, s.vpip * 0.55);
  if (tight && aggressive) return 'Tight & aggressive';
  if (tight) return 'Tight & passive';
  if (loose && aggressive) return 'Loose & aggressive';
  if (loose) return 'Loose & passive';
  return aggressive ? 'Balanced, aggressive' : 'Balanced';
}
