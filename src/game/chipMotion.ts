import type { GameState, PlayerAction, Street } from '../engine';

export const CHIP_COMMIT_DURATION_MS = 360;
export const ACTION_READ_DELAY_MS = 240;
/**
 * The extra beat an action that moves chips earns over one that does not.
 *
 * A check or a fold is over the moment it is read: nothing crosses the felt
 * and nobody's decision changes. A bet, raise, call or all-in has chips to
 * travel to the middle and a bet pill to land, and it is also the thing every
 * remaining decision is now about, so the table ran on before anyone had
 * taken it in. Everything gets the short beat; chips buy the long one.
 */
export const CHIP_ACTION_READ_BONUS_MS = 500;

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
  /** Who is owed what, once the hand is over. */
  winners?: readonly { playerId: string; amount: number }[];
}

/**
 * Chips only ever travel from a seat to the spot in front of it.
 *
 * Bets used to be swept into the middle at the end of a street, and the pot
 * flown back out to the winner at the end of a hand. Both crossed the board,
 * and on a phone that is a stack of chips sliding over the five cards the
 * player is trying to read, right as the next street lands. The pot number
 * going up says the same thing, so that is all that happens now.
 */
export type ChipMotionPhase = 'commit';

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

/**
 * Whether an action put chips on the felt.
 *
 * All-in is here for the obvious reason and call for the less obvious one: a
 * call is a chip flight and a bet pill exactly like a raise, and a table that
 * hurried past it read as the caller not having done anything.
 */
export function actionMovesChips(action?: PlayerAction | null): boolean {
  return action === 'bet' || action === 'raise' || action === 'call' || action === 'allin';
}

/**
 * How long the last action stays on screen before the next player moves.
 *
 * Takes the action rather than a flag so the caller cannot get the question
 * backwards, and tolerates not knowing: a resumed hand has no last action and
 * simply gets the short beat.
 */
export function actionReadDelayMs(animationsOff: boolean, lastAction?: PlayerAction | null): number {
  if (animationsOff) return 0;
  return ACTION_READ_DELAY_MS + (actionMovesChips(lastAction) ? CHIP_ACTION_READ_BONUS_MS : 0);
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

  return contributionDeltas(prev, next).map(({ playerId, amount }) => ({
    phase: 'commit',
    playerId,
    amount,
    delayMs: 0,
    durationMs: CHIP_COMMIT_DURATION_MS,
  }));
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

function contributionDeltas(prev: ChipMotionState, next: ChipMotionState): { playerId: string; amount: number }[] {
  const ids = new Set<string>([...Object.keys(prev.contributions), ...Object.keys(next.contributions)]);
  return Array.from(ids)
    .map((playerId) => ({
      playerId,
      amount: (next.contributions[playerId] ?? 0) - (prev.contributions[playerId] ?? 0),
    }))
    .filter(({ amount }) => amount > 0);
}

export function asChipMotionState(state: GameState): ChipMotionState {
  return state;
}
