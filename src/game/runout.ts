/**
 * Pacing for a board that has to run out after the betting is closed.
 *
 * When nobody left in the hand can act again — everyone is all in, or only one
 * player still has chips — the engine deals the rest of the board and settles
 * the pot in a single synchronous step. That is the right answer for the engine,
 * but it reaches the table as one update: five community cards, the winning
 * hand, the final stacks and an emptied pot all appear together, so the most
 * dramatic moment in poker is over before it can be watched.
 *
 * Nothing here changes the hand. It decides only *when* each street of an
 * already-decided board is allowed on screen, and what the felt should look like
 * while the rest of it is still coming.
 */

import type { GameState, Street } from '../engine/types';
import { REVEAL_LAYOUT_MS } from './showdownLayout';

/** Board sizes a run-out is allowed to pause at: flop, turn, river. */
export const RUNOUT_STOPS = [3, 4, 5] as const;

/**
 * Pause before the first street of a run-out.
 *
 * Shorter than the beats between streets: the chips have only just gone in, and
 * the cards are what everyone is waiting for.
 */
export const RUNOUT_LEAD_MS = 700;

/** Pause before each later street, long enough to read the board first. */
export const RUNOUT_BEAT_MS = 1100;

/**
 * Pause between the river landing and the result appearing.
 *
 * Without it the winner is announced on the same frame as the card that decided
 * it, which is the very thing the run-out exists to avoid.
 */
export const RUNOUT_RESULT_MS = 750;

/**
 * How long a finished run-out board stays up once its hands have finished
 * being laid out beneath it.
 *
 * Only applies when another board follows. The last board does not need it:
 * the result panel opens on top of it and nothing replaces it until the next
 * hand is asked for. Without this the next run started while the cards from
 * the previous one were still travelling, so a player running it three ways
 * saw three boards and read none of them.
 */
export const RUNOUT_HOLD_MS = 3000;

/**
 * Pause between the last player acting and the hands being shown.
 *
 * This used to be zero for any hand that did not run out, on the reasoning
 * that the river had already been on screen a while. True of the board, but
 * not of the decision: the final call and the reveal landed on the same frame,
 * so there was no beat in which to register that the betting had finished
 * before the cards answered it.
 */
export const SHOWDOWN_SETTLE_MS = 1000;

/**
 * The beat between one hand being tabled and the next being asked.
 *
 * Long enough to read the hand that just appeared, because the next player's
 * decision is supposed to be a reaction to it, and short enough that a
 * four-way showdown does not become a wait.
 */
export const SHOWDOWN_STEP_MS = 850;

/**
 * How long a player gets to decide whether to show a hand nobody can make
 * them show. Long enough to think about it, short enough that the rest of the
 * table is not held hostage by somebody who put their phone down.
 */
export const SHOW_CHOICE_MS = 6000;

/**
 * Sound played as a street is waited on, not as it lands.
 *
 * The river gets the urgent cue because by then the hand is one card from over.
 */
export type RunoutCue = 'tick' | 'tickUrgent';

export interface RunoutStep {
  /** How many board cards are on show once this step has been applied. */
  revealed: number;
  /** How long to wait before applying it. */
  delayMs: number;
  /** Cue to play while that wait is running. */
  cue: RunoutCue;
}

/** The street a board of `revealed` cards is sitting on. */
export function runoutStreet(revealed: number): Street {
  if (revealed >= 5) return 'river';
  if (revealed >= 4) return 'turn';
  if (revealed >= 3) return 'flop';
  return 'preflop';
}

export function runoutCue(stop: number): RunoutCue {
  return stop >= 5 ? 'tickUrgent' : 'tick';
}

/**
 * What the table says while a board is running out.
 *
 * Named per street rather than left as a generic "dealing", because during a
 * run-out the wait is the point: knowing the river is next is most of what
 * makes waiting for it worth anything.
 */
export function runoutLabel(revealed: number, target: number): string {
  const stop = nextRunoutStop(revealed, target);
  if (stop === 3) return 'All in · dealing the flop';
  if (stop === 4) return 'All in · dealing the turn';
  if (stop === 5) return 'All in · dealing the river';
  return 'All in · counting the pot';
}

export function runoutRunLabel(runIndex: number, runCount: number): string | null {
  return runCount > 1 ? `Run ${runIndex + 1} of ${runCount}` : null;
}

export function runoutStepDelay(stop: number): number {
  return stop <= 3 ? RUNOUT_LEAD_MS : RUNOUT_BEAT_MS;
}

/**
 * The next board size to stop at, or null once `revealed` has caught `target`.
 *
 * Stops are absolute board sizes rather than "one more card", so a run-out that
 * starts before the flop still shows the flop as three cards at once.
 */
export function nextRunoutStop(revealed: number, target: number): number | null {
  for (const stop of RUNOUT_STOPS) {
    if (stop > revealed && stop <= target) return stop;
  }
  return null;
}

export function nextRunoutStep(revealed: number, target: number): RunoutStep | null {
  const stop = nextRunoutStop(revealed, target);
  if (stop === null) return null;
  return { revealed: stop, delayMs: runoutStepDelay(stop), cue: runoutCue(stop) };
}

/** Every step needed to walk a board from `revealed` up to `target`. */
export function runoutPlan(revealed: number, target: number): RunoutStep[] {
  const plan: RunoutStep[] = [];
  let at = revealed;
  for (let step = nextRunoutStep(at, target); step; step = nextRunoutStep(at, target)) {
    plan.push(step);
    at = step.revealed;
  }
  return plan;
}

/**
 * Whether `state` is a settled hand whose board the table has not finished
 * showing. This is the only condition that earns a paced run-out: a hand that
 * reached showdown through normal betting has already had its river on screen.
 */
export function isRunningOut(state: Pick<GameState, 'street' | 'board'>, revealed: number): boolean {
  return state.street === 'showdown' && revealed < state.board.length;
}

/**
 * What the table should do next, given where the hand and the felt stand.
 *
 * The pacing used to live entirely inside a `useEffect`, which meant the only
 * way to check it was to drive a simulator and watch. Pulling the decision out
 * leaves the effect as a thin switch and makes the whole sequence, including
 * its timings, something a test can step through.
 */
export type RunoutAction =
  /** Nothing to do: the felt already matches the hand. */
  | { kind: 'idle' }
  /** Live hand: follow the engine and clear any result state. */
  | { kind: 'reset'; revealed: number }
  /** Reduced motion: show the whole hand and its result at once. */
  | { kind: 'settle'; revealed: number }
  /** Wait, then put the next street out. */
  | { kind: 'deal'; step: RunoutStep }
  /** Board is complete; wait, then allow the result on screen. */
  | { kind: 'result'; delayMs: number };

export interface RunoutInput {
  /** The engine says the hand is over. */
  handOver: boolean;
  /** Reduce Motion, or animations turned off. */
  animationsOff: boolean;
  /** How much board the felt is currently showing. */
  revealed: number;
  /** How much board the engine has dealt. */
  boardLength: number;
  /** Whether the result is already on screen. */
  resultsOpen: boolean;
  /** Whether this hand has already been turned face up for a run-out. */
  tabled: boolean;
  /**
   * Whether another board follows this one.
   *
   * Only the screen knows how many ways the hand is being run, and the gap
   * before a board is replaced is a different thing from the gap before a
   * result panel opens over it.
   */
  moreRuns?: boolean;
}

export function runoutAction(input: RunoutInput): RunoutAction {
  const { handOver, animationsOff, revealed, boardLength, resultsOpen, tabled, moreRuns } = input;

  if (!handOver) {
    return revealed !== boardLength || resultsOpen || tabled
      ? { kind: 'reset', revealed: boardLength }
      : { kind: 'idle' };
  }

  if (animationsOff) {
    return revealed !== boardLength || !resultsOpen
      ? { kind: 'settle', revealed: boardLength }
      : { kind: 'idle' };
  }

  const step = nextRunoutStep(revealed, boardLength);
  if (step) return { kind: 'deal', step };

  if (resultsOpen) return { kind: 'idle' };
  // A run-out gets both pauses: one for the river to land, then the beat
  // before the hands are turned over. Everything else gets the second.
  const settle = SHOWDOWN_SETTLE_MS + (tabled ? RUNOUT_RESULT_MS : 0);
  /*
   * A board that is about to be replaced owes the hands under it their whole
   * animation plus time to be read. One that is about to be covered by the
   * result panel owes nothing: the panel does not take the board away, and
   * the end of hand timer is already the player's reading time.
   */
  return { kind: 'result', delayMs: settle + (moreRuns ? REVEAL_LAYOUT_MS + RUNOUT_HOLD_MS : 0) };
}

/**
 * The hand as it stood with the chips in the middle and `revealed` cards out.
 *
 * Rebuilt from the settled state rather than from a snapshot taken before it,
 * because the action that closes the betting produces the showdown state
 * directly — there is no intermediate state in which the last call has been
 * paid but the pot has not. Taking each winner's payout back off their stack
 * reconstructs that moment exactly, and the pot, the contributions and the
 * all-in flags are all still intact on the settled state.
 */
export function runoutFelt(state: GameState, revealed: number, runIndex = 0): GameState {
  const owed = new Map(state.winners.map((winner) => [winner.playerId, winner.amount]));
  const run = state.runResults?.[runIndex];
  const board = run?.board ?? state.board;
  const settled = revealed >= board.length;
  /*
   * What the earlier runs have already paid out.
   *
   * Taking the whole hand's payout off every stack for every run put the
   * chips back where they were before the showdown and left them there: the
   * pot flew to the winner's seat at the end of each run and the number
   * beside the seat did not move until the last one, so running it three
   * ways looked like three results and one payment. A stack that grows a
   * third at a time is the thing that makes a run readable, and it is the
   * reason for running them one at a time rather than settling at the end.
   *
   * The current run counts only once its own board is complete, so the chips
   * arrive with the result rather than ahead of it.
   */
  const collected = new Map<string, number>();
  const lastPaid = settled ? runIndex : runIndex - 1;
  for (let i = 0; i <= lastPaid; i += 1) {
    for (const winner of state.runResults?.[i]?.winners ?? []) {
      collected.set(winner.playerId, (collected.get(winner.playerId) ?? 0) + winner.amount);
    }
  }
  return {
    ...state,
    players: state.players.map((player) => {
      const delta = (collected.get(player.id) ?? 0) - (owed.get(player.id) ?? 0);
      return delta !== 0 ? { ...player, chips: player.chips + delta } : player;
    }),
    board: board.slice(0, Math.max(0, revealed)),
    /*
     * A finished board is a showdown, even mid sequence.
     *
     * This used to report 'river' once five cards were down, because that is
     * what the street is called. But the table decides whether to lay the
     * hands out under the board by asking whether it is a showdown, so on a
     * run it never did: the boards came and went and nothing said who had won
     * each one. Settling three at once at the end is unreadable, which is the
     * whole reason for running them one at a time.
     *
     * Tied to the same condition as the winners below deliberately. The
     * street and the result have to appear together or the layout asks for
     * winners that are not there yet.
     */
    street: settled ? 'showdown' : runoutStreet(revealed),
    currentPlayerIndex: -1,
    winners: settled ? run?.winners ?? [] : [],
  };
}
