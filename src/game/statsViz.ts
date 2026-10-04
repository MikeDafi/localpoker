import { derivedStats, type Stats } from './stats';

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const safeNumber = (value: number): number => (Number.isFinite(value) ? value : 0);
const nonNegative = (value: number): number => Math.max(0, safeNumber(value));
const pctValue = (value: number): number => clamp(safeNumber(value), 0, 100);
const shareOf = (value: number, total: number): number => (total > 0 ? clamp(value / total, 0, 1) : 0);

export type WinSegmentId = 'showdown' | 'withoutShowdown' | 'lost';

export interface WinSegment {
  id: WinSegmentId;
  label: string;
  value: number;
  share: number;
}

export interface WinBreakdown {
  hasData: boolean;
  total: number;
  segments: WinSegment[];
}

export type RateMetricKey = 'vpip' | 'pfr' | 'winRate' | 'showdownWinRate';

export interface RateRange {
  min: number;
  max: number;
}

export interface RateMetric {
  key: RateMetricKey;
  label: string;
  value: number;
  range: RateRange;
  guide: string;
  hasSample: boolean;
}

export interface RateBars {
  hasData: boolean;
  metrics: RateMetric[];
}

export type PlayingStyleQuadrant = 'tightPassive' | 'tightAggressive' | 'loosePassive' | 'looseAggressive';

export interface PlayingStyleMap {
  hasData: boolean;
  vpip: number;
  pfr: number;
  quadrant: PlayingStyleQuadrant;
  label: string;
  thresholds: {
    looseVpip: number;
    aggressivePfr: number;
  };
  target: {
    vpip: RateRange;
    pfr: RateRange;
  };
}

export interface HandSwingSummary {
  hasData: boolean;
  observedStacks: number;
  swings: number[];
  recent: number[];
  best: number | null;
  worst: number | null;
  maxAbs: number;
}

export interface ChipHighlights {
  hasData: boolean;
  netChips: number;
  biggestPotWon: number;
  coinsEarned: number;
  netShare: number;
  potShare: number;
}

export interface StatsViz {
  winBreakdown: WinBreakdown;
  rateBars: RateBars;
  playingStyle: PlayingStyleMap;
  handSwings: HandSwingSummary;
  chipHighlights: ChipHighlights;
}

export const STYLE_THRESHOLDS = {
  looseVpip: 30,
  aggressivePfr: 15,
} as const;

export const RATE_RANGES: Record<RateMetricKey, RateRange> = {
  vpip: { min: 20, max: 30 },
  pfr: { min: 12, max: 24 },
  winRate: { min: 20, max: 40 },
  showdownWinRate: { min: 45, max: 65 },
};

export const STYLE_LABELS: Record<PlayingStyleQuadrant, string> = {
  tightPassive: 'Tight passive',
  tightAggressive: 'Tight aggressive',
  loosePassive: 'Loose passive',
  looseAggressive: 'Loose aggressive',
};

export function classifyPlayingStyle(vpip: number, pfr: number): PlayingStyleQuadrant {
  const loose = pctValue(vpip) > STYLE_THRESHOLDS.looseVpip;
  const aggressive = pctValue(pfr) >= STYLE_THRESHOLDS.aggressivePfr;

  if (loose && aggressive) return 'looseAggressive';
  if (loose) return 'loosePassive';
  if (aggressive) return 'tightAggressive';
  return 'tightPassive';
}

export function buildWinBreakdown(stats: Stats): WinBreakdown {
  const total = nonNegative(stats.handsPlayed);
  const wins = clamp(nonNegative(stats.handsWon), 0, total);
  const showdownWins = clamp(nonNegative(stats.showdownsWon), 0, wins);
  const withoutShowdown = clamp(wins - showdownWins, 0, total);
  const lost = clamp(total - wins, 0, total);

  const segments: WinSegment[] = [
    { id: 'showdown', label: 'Won at showdown', value: showdownWins, share: shareOf(showdownWins, total) },
    { id: 'withoutShowdown', label: 'Won without showdown', value: withoutShowdown, share: shareOf(withoutShowdown, total) },
    { id: 'lost', label: 'Lost', value: lost, share: shareOf(lost, total) },
  ];

  return { hasData: total > 0, total, segments };
}

export function buildRateBars(stats: Stats): RateBars {
  const d = derivedStats(stats);
  const hands = nonNegative(stats.handsPlayed);
  const showdowns = nonNegative(stats.showdownsSeen);
  const metrics: RateMetric[] = [
    {
      key: 'vpip',
      label: 'VPIP',
      value: pctValue(d.vpip),
      range: RATE_RANGES.vpip,
      guide: 'Solid range 20 to 30%',
      hasSample: hands > 0,
    },
    {
      key: 'pfr',
      label: 'PFR',
      value: pctValue(d.pfr),
      range: RATE_RANGES.pfr,
      guide: 'Pressure range 12 to 24%',
      hasSample: hands > 0,
    },
    {
      key: 'winRate',
      label: 'Win rate',
      value: pctValue(d.winRate),
      range: RATE_RANGES.winRate,
      guide: 'Usual range depends on table size',
      hasSample: hands > 0,
    },
    {
      key: 'showdownWinRate',
      label: 'Showdown win',
      value: pctValue(d.showdownWinRate),
      range: RATE_RANGES.showdownWinRate,
      guide: showdowns > 0 ? 'Balanced range 45 to 65%' : 'Needs showdowns to settle',
      hasSample: showdowns > 0,
    },
  ];

  return { hasData: hands > 0, metrics };
}

export function buildPlayingStyleMap(stats: Stats): PlayingStyleMap {
  const d = derivedStats(stats);
  const vpip = pctValue(d.vpip);
  const pfr = pctValue(d.pfr);
  const quadrant = classifyPlayingStyle(vpip, pfr);

  return {
    hasData: nonNegative(stats.handsPlayed) > 0,
    vpip,
    pfr,
    quadrant,
    label: STYLE_LABELS[quadrant],
    thresholds: STYLE_THRESHOLDS,
    target: {
      vpip: RATE_RANGES.vpip,
      pfr: RATE_RANGES.pfr,
    },
  };
}

export function buildHandSwings(chipHistory: number[], recentCount = 18): HandSwingSummary {
  const stacks = chipHistory.map(safeNumber);
  const swings: number[] = [];
  for (let i = 1; i < stacks.length; i += 1) {
    swings.push(stacks[i] - stacks[i - 1]);
  }

  const recent = swings.slice(-Math.max(1, recentCount));
  const best = swings.length > 0 ? Math.max(...swings) : null;
  const worst = swings.length > 0 ? Math.min(...swings) : null;
  const maxAbs = swings.length > 0 ? Math.max(...swings.map((s) => Math.abs(s))) : 0;

  return {
    hasData: swings.length > 0,
    observedStacks: stacks.length,
    swings,
    recent,
    best,
    worst,
    maxAbs,
  };
}

export function buildChipHighlights(stats: Stats): ChipHighlights {
  const netChips = safeNumber(stats.netChips);
  const biggestPotWon = nonNegative(stats.biggestPotWon);
  const coinsEarned = safeNumber(stats.coinsEarned);
  const scale = Math.max(Math.abs(netChips), biggestPotWon, 1);

  return {
    hasData: nonNegative(stats.handsPlayed) > 0,
    netChips,
    biggestPotWon,
    coinsEarned,
    netShare: shareOf(Math.abs(netChips), scale),
    potShare: shareOf(biggestPotWon, scale),
  };
}

export function buildStatsViz(stats: Stats): StatsViz {
  return {
    winBreakdown: buildWinBreakdown(stats),
    rateBars: buildRateBars(stats),
    playingStyle: buildPlayingStyleMap(stats),
    handSwings: buildHandSwings(stats.chipHistory),
    chipHighlights: buildChipHighlights(stats),
  };
}
