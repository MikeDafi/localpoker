import { emptyCounters, type ObservedCounters } from './observedStats';

/**
 * What an opponent has done across every table you have shared with them.
 *
 * `observedStats` deliberately only describes the table in front of you, which
 * is the honest thing to show, but it also throws away everything the moment
 * the room closes. Someone you play every week arrives a stranger each time.
 *
 * This keeps the same counters, accumulated per player, and it keeps them for
 * the same reason the live ones exist: they are earned by watching, so they
 * cannot be faked by a modified client and they work for bots too. Nothing is
 * published, this is a private note on your own device.
 */

/** Counters are additive by construction, which is what makes this cheap. */
export function mergeCounters(a: ObservedCounters, b: ObservedCounters): ObservedCounters {
  return {
    handsSeen: a.handsSeen + b.handsSeen,
    vpipHands: a.vpipHands + b.vpipHands,
    pfrHands: a.pfrHands + b.pfrHands,
    aggressiveActions: a.aggressiveActions + b.aggressiveActions,
    calls: a.calls + b.calls,
    handsWon: a.handsWon + b.handsWon,
    showdowns: a.showdowns + b.showdowns,
    showdownWins: a.showdownWins + b.showdownWins,
  };
}

export type OpponentHistory = Record<string, ObservedCounters>;

/**
 * Only players with a durable identity are worth remembering.
 *
 * A bot's id is generated per table, so accumulating it would pile unrelated
 * opponents into one meaningless row that grows forever. Online players are
 * keyed by their Firebase uid, which is stable across rooms.
 */
export function isDurableOpponentKey(key: string | null | undefined): key is string {
  if (!key) return false;
  if (key === 'me') return false;
  return !key.startsWith('bot');
}

/**
 * Fold a finished table's observations into the running history.
 *
 * Takes the whole table rather than one player so the caller cannot merge
 * half of a session, and returns a new object so it can be handed straight to
 * a state setter.
 */
export function absorbTable(
  history: OpponentHistory,
  tableCounters: Record<string, ObservedCounters>,
): OpponentHistory {
  const next: OpponentHistory = { ...history };
  for (const [key, counters] of Object.entries(tableCounters)) {
    if (!isDurableOpponentKey(key)) continue;
    if (counters.handsSeen <= 0) continue;
    next[key] = mergeCounters(next[key] ?? emptyCounters(), counters);
  }
  return next;
}

/** What is known about one opponent before this table started. */
export function historyFor(history: OpponentHistory, key: string): ObservedCounters {
  return history[key] ?? emptyCounters();
}

/**
 * Keep the store from growing without bound.
 *
 * Someone who plays a lot of public tables would otherwise accumulate a row
 * per stranger forever. The people worth remembering are the ones you have
 * played most, so the rest are dropped oldest-value first.
 */
export const MAX_REMEMBERED_OPPONENTS = 200;

export function pruneHistory(history: OpponentHistory): OpponentHistory {
  const entries = Object.entries(history);
  if (entries.length <= MAX_REMEMBERED_OPPONENTS) return history;
  return Object.fromEntries(
    entries.sort(([, a], [, b]) => b.handsSeen - a.handsSeen).slice(0, MAX_REMEMBERED_OPPONENTS),
  );
}
