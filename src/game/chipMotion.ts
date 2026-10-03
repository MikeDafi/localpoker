import type { GameState, PlayerAction, Street } from '../engine';

export const CHIP_COMMIT_DURATION_MS = 360;
export const CHIP_SWEEP_DURATION_MS = 320;
export const CHIP_SWEEP_PAUSE_MS = 70;
export const CHIP_PAYOUT_DURATION_MS = 430;
/**
 * How long the pot sits before it is pushed to whoever won it.
 *
 * Long enough for the tabled hands to have finished flying out and taken
 * their ring (see `REVEAL.ring` in `ShowdownReveal`). Paying first would
 * answer the question before the cards had asked it, and the pot arriving on
 * top of cards still in flight reads as a collision rather than a result.
 */
export const CHIP_PAYOUT_PAUSE_MS = 2200;
/** Two winners should not be paid in the same instant, or it looks like one. */
export const CHIP_PAYOUT_STAGGER_MS = 110;
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

export type ChipMotionPhase = 'commit' | 'sweep' | 'payout';

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

/**
 * The pot going to whoever won it, one flight per winner.
 *
 * Split pots are the reason this is per winner rather than one flight: the
 * screen said "split pot" in words while a single stack slid to one player,
 * which is the opposite of what happened. Each winner gets their own share
 * moving to their own seat.
 */
export function payoutEvents(state: ChipMotionState): ChipMotionEvent[] {
  if (state.street !== 'showdown') return [];
  return (state.winners ?? [])
    .filter((w) => w.amount > 0)
    .map((w, i) => ({
      phase: 'payout' as const,
      playerId: w.playerId,
      amount: w.amount,
      delayMs: CHIP_PAYOUT_PAUSE_MS + i * CHIP_PAYOUT_STAGGER_MS,
      durationMs: CHIP_PAYOUT_DURATION_MS,
    }));
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

  /*
   * Arriving at a showdown pays the pot out, after whatever else that same
   * step is already doing. Only on the transition: every later render while
   * the result panel is up would otherwise push the chips again.
   *
   * It is appended rather than returned early because the last street's bets
   * still have to be swept into the middle first. Returning here paid out a
   * pot the player had just watched not be collected.
   */
  const payouts = prev.street !== 'showdown' && next.street === 'showdown'
    ? payoutEvents(next)
    : [];

  const deltas = contributionDeltas(prev, next);
  const commits: ChipMotionEvent[] = deltas.map(({ playerId, amount }) => ({
    phase: 'commit',
    playerId,
    amount,
    delayMs: 0,
    durationMs: CHIP_COMMIT_DURATION_MS,
  }));

  if (!didSweepStreet(prev, next, deltas)) return [...commits, ...payouts];

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

  return [...commits, ...sweeps, ...payouts];
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
  if (phase === 'commit') return { from: seatPoint, to: betPoint };
  // Paying out is sweeping in reverse: the pot goes back to a seat.
  if (phase === 'payout') return { from: potPoint, to: seatPoint };
  return { from: betPoint, to: potPoint };
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
