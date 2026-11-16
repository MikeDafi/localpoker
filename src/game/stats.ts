/**
 * Pure, unit-tested stats logic. Kept separate from React so hand-by-hand
 * tracking is verifiable and deterministic.
 */

export interface Stats {
  handsPlayed: number;
  handsWon: number;
  showdownsSeen: number;
  showdownsWon: number;
  biggestPotWon: number;
  netChips: number;
  vpipHands: number;
  pfrHands: number;
  handsAsAggressor: number;
  coinsEarned: number;
  chipHistory: number[];
  /**
   * When each `chipHistory` entry was recorded, epoch ms, index for index.
   * 0 means unknown: hands played before this was tracked have no time, and
   * the chart says "N hands ago" for those rather than inventing a date.
   * Optional so stats saved by an older build still load.
   */
  chipHistoryAt?: number[];
}

export interface HandResult {
  won: boolean;
  wentToShowdown: boolean;
  wonAtShowdown: boolean;
  potWon: number;
  net: number;
  vpip: boolean;
  pfr: boolean;
  aggressor: boolean;
  endingStack: number;
  /** When the hand finished, epoch ms. Passed in so this stays pure. */
  at?: number;
}

export const DEFAULT_STATS: Stats = {
  handsPlayed: 0,
  handsWon: 0,
  showdownsSeen: 0,
  showdownsWon: 0,
  biggestPotWon: 0,
  netChips: 0,
  vpipHands: 0,
  pfrHands: 0,
  handsAsAggressor: 0,
  coinsEarned: 0,
  chipHistory: [],
  chipHistoryAt: [],
};

export const COINS_PER_HAND = 10;
export const COINS_WIN_BONUS = 25;
export const COINS_SHOWDOWN_WIN_BONUS = 15;
export const COINS_LOSS_PENALTY = 10;

/**
 * Coins for a completed hand:
 *  - win: base + win bonus (+ showdown-win bonus)
 *  - lost chips this hand: a penalty (you lose coins)
 *  - broke even / folded for free: nothing
 */
export function coinsForHand(r: HandResult): number {
  if (r.won) {
    return COINS_PER_HAND + COINS_WIN_BONUS + (r.wonAtShowdown ? COINS_SHOWDOWN_WIN_BONUS : 0);
  }
  if (r.net < 0) return -COINS_LOSS_PENALTY;
  return 0;
}

/**
 * The recorded times lined up with `chipHistory`, padded with 0 (unknown) at
 * the front for the hands that were played before times were kept.
 */
export function alignedTimes(stats: Pick<Stats, 'chipHistory' | 'chipHistoryAt'>): number[] {
  const n = stats.chipHistory.length;
  const at = (stats.chipHistoryAt ?? []).slice(-n);
  return [...new Array<number>(n - at.length).fill(0), ...at];
}

/** Fold a single completed hand into the running stats. Pure. */
export function applyHandResult(stats: Stats, r: HandResult): { stats: Stats; coinsEarned: number } {
  const coinsEarned = coinsForHand(r);
  const next: Stats = {
    handsPlayed: stats.handsPlayed + 1,
    handsWon: stats.handsWon + (r.won ? 1 : 0),
    showdownsSeen: stats.showdownsSeen + (r.wentToShowdown ? 1 : 0),
    showdownsWon: stats.showdownsWon + (r.wonAtShowdown ? 1 : 0),
    biggestPotWon: Math.max(stats.biggestPotWon, r.won ? r.potWon : 0),
    netChips: stats.netChips + r.net,
    vpipHands: stats.vpipHands + (r.vpip ? 1 : 0),
    pfrHands: stats.pfrHands + (r.pfr ? 1 : 0),
    handsAsAggressor: stats.handsAsAggressor + (r.aggressor ? 1 : 0),
    coinsEarned: stats.coinsEarned + coinsEarned,
    chipHistory: [...stats.chipHistory, r.endingStack].slice(-100),
    chipHistoryAt: [...alignedTimes(stats), r.at ?? 0].slice(-100),
  };
  return { stats: next, coinsEarned };
}

export interface DerivedStats {
  winRate: number;
  vpip: number;
  pfr: number;
  showdownWinRate: number;
  aggression: number;
}

export function derivedStats(stats: Stats): DerivedStats {
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  return {
    winRate: pct(stats.handsWon, stats.handsPlayed),
    vpip: pct(stats.vpipHands, stats.handsPlayed),
    pfr: pct(stats.pfrHands, stats.handsPlayed),
    showdownWinRate: pct(stats.showdownsWon, stats.showdownsSeen),
    aggression: stats.vpipHands > 0 ? +(stats.pfrHands / stats.vpipHands).toFixed(2) : 0,
  };
}

export function mergeStats(stored?: Partial<Stats> | null): Stats {
  return { ...DEFAULT_STATS, ...(stored ?? {}) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "9:05 PM" today, "Nov 12" this year, "Nov 12, 2025" before that. Local time. */
export function shortWhen(at: number, now: number): string {
  const d = new Date(at);
  const n = new Date(now);
  if (d.toDateString() === n.toDateString()) {
    const h = d.getHours();
    return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === n.getFullYear() ? day : `${day}, ${d.getFullYear()}`;
}

/**
 * The two ends of the stack history's time axis.
 *
 * A date where one was recorded, and otherwise a count, because hands from
 * before times were kept have none and a made-up date would be worse than
 * "40 hands ago".
 */
export function stackHistoryEnds(stats: Pick<Stats, 'chipHistory' | 'chipHistoryAt'>, now: number): [string, string] {
  const times = alignedTimes(stats);
  const n = stats.chipHistory.length;
  const first = times[0] ?? 0;
  const last = times[n - 1] ?? 0;
  return [
    first > 0 ? shortWhen(first, now) : `${Math.max(0, n - 1)} hands ago`,
    last > 0 ? shortWhen(last, now) : 'Latest',
  ];
}
