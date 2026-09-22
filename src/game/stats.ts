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
