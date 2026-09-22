import type { GameState, Street } from '../engine';

export const CHIP_COMMIT_DURATION_MS = 360;
export const CHIP_SWEEP_DURATION_MS = 320;
export const CHIP_SWEEP_PAUSE_MS = 70;
export const ACTION_READ_DELAY_MS = 240;

export interface ChipPoint {
  x: number;
  y: number;
}

export interface ChipMotionPlayer {
  id: string;
  currentBet: number;
}

export interface ChipMotionPot {
  amount: number;
}

export interface ChipMotionState {
  handNumber?: number;
  street: Street;
  players: readonly ChipMotionPlayer[];
  contributions: Record<string, number>;
  pots?: readonly ChipMotionPot[];
}

export type ChipMotionPhase = 'commit' | 'sweep';

export interface ChipMotionEvent {
  phase: ChipMotionPhase;
  playerId: string;
  amount: number;
  delayMs: number;
  durationMs: number;
}

export interface BoardBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SeatBox {
  left: number;
  top: number;
}

export interface ChipMotionLayout {
  areaWidth: number;
  stageHeight: number;
  seatWidth: number;
  podHeight: number;
  heroHeight: number;
  laneTop: number;
  boardBox: BoardBox;
}

export function totalCommittedChips(state: Pick<ChipMotionState, 'contributions' | 'pots'>): number {
  const contributionTotal = Object.values(state.contributions).reduce((sum, amount) => sum + amount, 0);
  const potTotal = state.pots?.reduce((sum, pot) => sum + pot.amount, 0) ?? 0;
  return potTotal > 0 || contributionTotal === 0 ? potTotal : contributionTotal;
}

export function currentStreetBetTotal(state: Pick<ChipMotionState, 'street' | 'players'>): number {
  if (state.street === 'showdown') return 0;
  return state.players.reduce((sum, player) => sum + Math.max(0, player.currentBet || 0), 0);
}

export function renderedBetPillTotal(state: Pick<ChipMotionState, 'street' | 'players'>): number {
  return currentStreetBetTotal(state);
}

export function sweptPotAmount(state: Pick<ChipMotionState, 'street' | 'players' | 'contributions' | 'pots'>): number {
  if (state.street === 'showdown') return 0;
  return Math.max(0, totalCommittedChips(state) - currentStreetBetTotal(state));
}

export function displayedPotAmount(state: Pick<ChipMotionState, 'street' | 'contributions' | 'pots'>): number {
  if (state.street === 'showdown') return 0;
  return totalCommittedChips(state);
}

export function actionReadDelayMs(animationsOff: boolean): number {
  return animationsOff ? 0 : ACTION_READ_DELAY_MS;
}

export function initialChipMotionEvents(state: ChipMotionState): ChipMotionEvent[] {
  if (state.street === 'showdown') return [];
  return state.players
    .filter((player) => player.currentBet > 0)
    .map((player) => ({
      phase: 'commit' as const,
      playerId: player.id,
      amount: player.currentBet,
      delayMs: 0,
      durationMs: CHIP_COMMIT_DURATION_MS,
    }));
}

export function chipMotionEvents(prev: ChipMotionState | null, next: ChipMotionState): ChipMotionEvent[] {
  if (!prev || prev.handNumber !== next.handNumber) {
    return initialChipMotionEvents(next);
  }

  const deltas = contributionDeltas(prev, next);
  const commits: ChipMotionEvent[] = deltas.map(({ playerId, amount }) => ({
    phase: 'commit',
    playerId,
    amount,
    delayMs: 0,
    durationMs: CHIP_COMMIT_DURATION_MS,
  }));

  if (!didSweepStreet(prev, next, deltas)) return commits;

  const endingBets = endingStreetBets(prev, deltas);
  const sweepDelay = commits.length > 0
    ? CHIP_COMMIT_DURATION_MS + CHIP_SWEEP_PAUSE_MS
    : CHIP_SWEEP_PAUSE_MS;
  const sweeps: ChipMotionEvent[] = Array.from(endingBets.entries())
    .filter(([, amount]) => amount > 0)
    .map(([playerId, amount]) => ({
      phase: 'sweep',
      playerId,
      amount,
      delayMs: sweepDelay,
      durationMs: CHIP_SWEEP_DURATION_MS,
    }));

  return [...commits, ...sweeps];
}

export function opponentSeatChipPoint(seat: SeatBox, seatWidth: number, podHeight: number): ChipPoint {
  return {
    x: seat.left + seatWidth / 2,
    y: seat.top + Math.max(24, Math.min(46, podHeight * 0.42)),
  };
}

export function opponentBetChipPoint(seat: SeatBox, seatWidth: number, podHeight: number): ChipPoint {
  return {
    x: seat.left + seatWidth / 2,
    y: seat.top + Math.max(48, podHeight - 6),
  };
}

export function heroSeatChipPoint(areaWidth: number, stageHeight: number, heroHeight: number): ChipPoint {
  return {
    x: areaWidth / 2,
    y: stageHeight - Math.max(42, heroHeight * 0.58),
  };
}

export function heroBetChipPoint(areaWidth: number, stageHeight: number): ChipPoint {
  return {
    x: areaWidth / 2,
    y: stageHeight - 14,
  };
}

export function potChipPoint(layout: Pick<ChipMotionLayout, 'areaWidth' | 'laneTop' | 'boardBox'>): ChipPoint {
  if (layout.boardBox.w > 0 && layout.boardBox.h > 0) {
    return {
      x: layout.areaWidth / 2,
      y: layout.laneTop + layout.boardBox.y + layout.boardBox.h + 24,
    };
  }
  return {
    x: layout.areaWidth / 2,
    y: layout.laneTop + 72,
  };
}

export function chipMotionPath(
  phase: ChipMotionPhase,
  seatPoint: ChipPoint,
  betPoint: ChipPoint,
  potPoint: ChipPoint,
): { from: ChipPoint; to: ChipPoint } {
  return phase === 'commit'
    ? { from: seatPoint, to: betPoint }
    : { from: betPoint, to: potPoint };
}

function contributionDeltas(prev: ChipMotionState, next: ChipMotionState): { playerId: string; amount: number }[] {
  const ids = new Set<string>([...Object.keys(prev.contributions), ...Object.keys(next.contributions)]);
  return Array.from(ids)
    .map((playerId) => ({
      playerId,
      amount: (next.contributions[playerId] ?? 0) - (prev.contributions[playerId] ?? 0),
    }))
    .filter(({ amount }) => amount > 0);
}

function didSweepStreet(
  prev: ChipMotionState,
  next: ChipMotionState,
  deltas: readonly { playerId: string; amount: number }[],
): boolean {
  if (prev.street === 'showdown') return false;
  const hadStreetBets = prev.players.some((player) => player.currentBet > 0) || deltas.length > 0;
  if (!hadStreetBets) return false;
  if (next.street === 'showdown') return true;
  if (prev.street !== next.street) return true;
  return prev.players.some((player) => player.currentBet > 0) && next.players.every((player) => player.currentBet === 0);
}

function endingStreetBets(
  prev: ChipMotionState,
  deltas: readonly { playerId: string; amount: number }[],
): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const player of prev.players) {
    if (player.currentBet > 0) amounts.set(player.id, player.currentBet);
  }
  for (const { playerId, amount } of deltas) {
    amounts.set(playerId, (amounts.get(playerId) ?? 0) + amount);
  }
  return amounts;
}

export function asChipMotionState(state: GameState): ChipMotionState {
  return state;
}
