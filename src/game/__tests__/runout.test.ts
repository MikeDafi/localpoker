import { describe, expect, it } from 'vitest';
import { applyAction, createGame, startHand } from '../../engine/holdem';
import type { GameState } from '../../engine/types';
import {
  isRunningOut,
  nextRunoutStep,
  runoutCue,
  runoutAction,
  runoutFelt,
  runoutLabel,
  runoutPlan,
  runoutStreet,
  RUNOUT_BEAT_MS,
  RUNOUT_LEAD_MS,
} from '../runout';

function ok(result: ReturnType<typeof applyAction>): GameState {
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
  return (result as { ok: true; state: GameState }).state;
}

/**
 * A real heads-up hand that ends with both players all in before the flop, so
 * the engine deals the whole board and settles the pot in a single step. This
 * is the situation the pacing exists for, built through the engine rather than
 * hand-written, so the test breaks if the engine ever stops producing it.
 */
function shovedPreflop(): GameState {
  const game = createGame(
    { smallBlind: 5, bigBlind: 10, startingStack: 200, maxPlayers: 6, turnTimerSec: 30 },
    [
      { id: 'a', name: 'A', chips: 200, seatIndex: 0 },
      { id: 'b', name: 'B', chips: 200, seatIndex: 1 },
    ],
    7,
  );
  const dealt = startHand(game);
  const shover = dealt.players[dealt.currentPlayerIndex]!;
  const afterShove = ok(applyAction(dealt, shover.id, 'allin'));
  const caller = afterShove.players[afterShove.currentPlayerIndex]!;
  return ok(applyAction(afterShove, caller.id, 'call'));
}

describe('run-out pacing', () => {
  it('the engine really does settle an all-in hand in one step', () => {
    const settled = shovedPreflop();
    // Everything arrives together: five board cards, the winners and an ended
    // hand. Without pacing this is one frame on screen.
    expect(settled.street).toBe('showdown');
    expect(settled.board).toHaveLength(5);
    expect(settled.winners.length).toBeGreaterThan(0);
  });

  it('treats a settled hand with board still to show as running out', () => {
    const settled = shovedPreflop();
    expect(isRunningOut(settled, 0)).toBe(true);
    expect(isRunningOut(settled, 3)).toBe(true);
    expect(isRunningOut(settled, 5)).toBe(false);
  });

  it('does not pace a hand that reached the river through betting', () => {
    const settled = shovedPreflop();
    // The board was already fully on screen before the hand ended.
    expect(isRunningOut(settled, 5)).toBe(false);
    expect(nextRunoutStep(5, 5)).toBeNull();
  });

  it('does not pace a hand that ended before the board was complete', () => {
    // Everyone folded on the flop: three cards dealt, three cards shown.
    const folded = { street: 'showdown' as const, board: [1, 2, 3] as never[] };
    expect(isRunningOut(folded, 3)).toBe(false);
  });

  it('stops at the flop, the turn and the river in that order', () => {
    expect(runoutPlan(0, 5).map((s) => s.revealed)).toEqual([3, 4, 5]);
  });

  it('shows the flop as one stop of three cards, never one card at a time', () => {
    const first = nextRunoutStep(0, 5);
    expect(first?.revealed).toBe(3);
  });

  it('picks up midway when the betting closed after the flop or turn', () => {
    expect(runoutPlan(3, 5).map((s) => s.revealed)).toEqual([4, 5]);
    expect(runoutPlan(4, 5).map((s) => s.revealed)).toEqual([5]);
  });

  it('leads in quickly, then leaves time to read the board between streets', () => {
    const [flop, turn, river] = runoutPlan(0, 5);
    expect(flop!.delayMs).toBe(RUNOUT_LEAD_MS);
    expect(turn!.delayMs).toBe(RUNOUT_BEAT_MS);
    expect(river!.delayMs).toBe(RUNOUT_BEAT_MS);
    expect(turn!.delayMs).toBeGreaterThan(flop!.delayMs);
  });

  it('saves the urgent cue for the river', () => {
    expect(runoutCue(3)).toBe('tick');
    expect(runoutCue(4)).toBe('tick');
    expect(runoutCue(5)).toBe('tickUrgent');
  });

  it('names the street each stop lands on', () => {
    expect(runoutStreet(0)).toBe('preflop');
    expect(runoutStreet(3)).toBe('flop');
    expect(runoutStreet(4)).toBe('turn');
    expect(runoutStreet(5)).toBe('river');
  });

  it('tells the table which street it is waiting on', () => {
    expect(runoutLabel(0, 5)).toContain('flop');
    expect(runoutLabel(3, 5)).toContain('turn');
    expect(runoutLabel(4, 5)).toContain('river');
    // Nothing left to deal, but the result is still being held back.
    expect(runoutLabel(5, 5)).toContain('pot');
  });

  it('terminates from any starting point', () => {
    for (let revealed = 0; revealed <= 5; revealed += 1) {
      expect(runoutPlan(revealed, 5).length).toBeLessThanOrEqual(3);
    }
    // A board that is somehow ahead of the target asks for nothing.
    expect(runoutPlan(5, 3)).toEqual([]);
  });
});

describe('the felt during a run-out', () => {
  it('shows only the streets dealt so far', () => {
    const settled = shovedPreflop();
    expect(runoutFelt(settled, 0).board).toHaveLength(0);
    expect(runoutFelt(settled, 3).board).toHaveLength(3);
    expect(runoutFelt(settled, 4).board).toHaveLength(4);
    // The cards shown are the real ones, in order, not substitutes.
    expect(runoutFelt(settled, 3).board).toEqual(settled.board.slice(0, 3));
  });

  it('keeps the result hidden so the board decides the hand, not the panel', () => {
    const settled = shovedPreflop();
    const felt = runoutFelt(settled, 3);
    expect(felt.winners).toEqual([]);
    expect(felt.street).toBe('flop');
  });

  it('puts the pot back in the middle instead of paying it out early', () => {
    const settled = shovedPreflop();
    const felt = runoutFelt(settled, 3);
    const potTotal = felt.pots.reduce((sum, pot) => sum + pot.amount, 0);
    expect(potTotal).toBeGreaterThan(0);

    // Stacks must read as they did with the chips still in the middle, or the
    // winner is obvious from the numbers before a single card has landed.
    const paid = new Map(settled.winners.map((w) => [w.playerId, w.amount]));
    for (const player of felt.players) {
      const payout = paid.get(player.id) ?? 0;
      const settledPlayer = settled.players.find((p) => p.id === player.id)!;
      expect(player.chips).toBe(settledPlayer.chips - payout);
    }
  });

  it('gives away nothing about who won', () => {
    const settled = shovedPreflop();
    const winnerId = settled.winners[0]!.playerId;
    const felt = runoutFelt(settled, 0);
    const winner = felt.players.find((p) => p.id === winnerId)!;
    const loser = felt.players.find((p) => p.id !== winnerId)!;
    // Both shoved the same stack, so mid-run-out they must look identical.
    expect(winner.chips).toBe(loser.chips);
  });

  it('nobody is to act while the board runs out', () => {
    const settled = shovedPreflop();
    expect(runoutFelt(settled, 3).currentPlayerIndex).toBe(-1);
  });

  it('leaves the settled hand untouched', () => {
    const settled = shovedPreflop();
    const before = JSON.stringify(settled);
    runoutFelt(settled, 3);
    expect(JSON.stringify(settled)).toBe(before);
  });

  it('hands back the real result once the river is out', () => {
    const settled = shovedPreflop();
    const felt = runoutFelt(settled, 5);
    expect(felt.board).toEqual(settled.board);
    expect(felt.street).toBe('river');
    // The last step of the sequence is switching back to the settled state, so
    // what matters here is that nothing is left to reveal.
    expect(isRunningOut(settled, 5)).toBe(false);
  });
});

/**
 * Drive the table's own pacing decision the way the screen does: apply each
 * action, advance the clock, ask again. This is the check the simulator was
 * meant to provide, without depending on XCUITest to catch a one-second label.
 */
function playOut(settled: GameState, options: { animationsOff?: boolean; startRevealed?: number } = {}) {
  let revealed = options.startRevealed ?? 0;
  let resultsOpen = false;
  let tabled = false;
  let elapsed = 0;
  const timeline: { at: number; revealed: number }[] = [];
  const cues: string[] = [];

  for (let guard = 0; guard < 20; guard += 1) {
    const action = runoutAction({
      handOver: settled.street === 'showdown',
      animationsOff: options.animationsOff ?? false,
      revealed,
      boardLength: settled.board.length,
      resultsOpen,
      tabled,
    });
    if (action.kind === 'idle') break;
    if (action.kind === 'reset') { revealed = action.revealed; resultsOpen = false; tabled = false; continue; }
    if (action.kind === 'settle') { revealed = action.revealed; resultsOpen = true; continue; }
    if (action.kind === 'deal') {
      tabled = true;
      cues.push(action.step.cue);
      elapsed += action.step.delayMs;
      revealed = action.step.revealed;
      timeline.push({ at: elapsed, revealed });
      continue;
    }
    elapsed += action.delayMs;
    resultsOpen = true;
    timeline.push({ at: elapsed, revealed });
  }

  return { timeline, cues, revealed, resultsOpen, tabled, elapsed };
}

describe('the table paces a run-out over time', () => {
  it('puts the flop, turn and river out at separate moments', () => {
    const played = playOut(shovedPreflop());
    expect(played.timeline.map((t) => t.revealed)).toEqual([3, 4, 5, 5]);
    // Every street lands at a strictly later moment: that is the whole feature.
    const moments = played.timeline.map((t) => t.at);
    expect(moments).toEqual([...moments].sort((a, b) => a - b));
    expect(new Set(moments).size).toBe(moments.length);
  });

  it('never shows the result before the river', () => {
    const played = playOut(shovedPreflop());
    const river = played.timeline.find((t) => t.revealed === 5)!;
    const result = played.timeline[played.timeline.length - 1]!;
    expect(result.at).toBeGreaterThan(river.at);
    expect(played.resultsOpen).toBe(true);
  });

  it('takes a few seconds, not a frame and not a minute', () => {
    const played = playOut(shovedPreflop());
    expect(played.elapsed).toBeGreaterThan(2000);
    expect(played.elapsed).toBeLessThan(6000);
  });

  it('builds to the river with the urgent cue last', () => {
    expect(playOut(shovedPreflop()).cues).toEqual(['tick', 'tick', 'tickUrgent']);
  });

  it('tables the hands, and leaves them tabled once the result lands', () => {
    const played = playOut(shovedPreflop());
    expect(played.tabled).toBe(true);
  });

  it('reaches exactly the board the engine dealt', () => {
    const settled = shovedPreflop();
    expect(playOut(settled).revealed).toBe(settled.board.length);
  });

  it('skips the whole performance when motion is reduced', () => {
    const played = playOut(shovedPreflop(), { animationsOff: true });
    expect(played.elapsed).toBe(0);
    expect(played.resultsOpen).toBe(true);
    expect(played.revealed).toBe(5);
    expect(played.cues).toEqual([]);
  });

  it('does not pause a hand whose river was already on screen', () => {
    // Nothing left to reveal, so the result is not held back.
    const played = playOut(shovedPreflop(), { startRevealed: 5 });
    expect(played.cues).toEqual([]);
    expect(played.elapsed).toBe(0);
    expect(played.resultsOpen).toBe(true);
  });

  it('clears everything when the next hand starts', () => {
    const live = { ...shovedPreflop(), street: 'preflop' as const, board: [] };
    const action = runoutAction({
      handOver: false, animationsOff: false, revealed: 5,
      boardLength: 0, resultsOpen: true, tabled: true,
    });
    expect(action).toEqual({ kind: 'reset', revealed: 0 });
    expect(playOut(live).revealed).toBe(0);
  });
});
