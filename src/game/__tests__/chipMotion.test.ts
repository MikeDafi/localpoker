import { describe, expect, it } from 'vitest';
import {
  CHIP_COMMIT_DURATION_MS,
  CHIP_SWEEP_DURATION_MS,
  actionReadDelayMs,
  chipMotionEvents,
  chipMotionPath,
  currentStreetBetTotal,
  displayedPotAmount,
  heroBetChipPoint,
  heroSeatChipPoint,
  initialChipMotionEvents,
  opponentBetChipPoint,
  opponentSeatChipPoint,
  potChipPoint,
  renderedBetPillTotal,
  sweptPotAmount,
  totalCommittedChips,
  type ChipMotionState,
} from '../chipMotion';
import { applyAction, buildSidePots, createGame, startHand, type GameState, type Player } from '../../engine';

const state = (overrides: Partial<ChipMotionState> = {}): ChipMotionState => ({
  handNumber: 1,
  street: 'preflop',
  players: [
    { id: 'a', currentBet: 0 },
    { id: 'b', currentBet: 0 },
    { id: 'c', currentBet: 0 },
  ],
  contributions: {},
  pots: [],
  ...overrides,
});

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    seatIndex: 0,
    chips: 1_000,
    holeCards: [],
    folded: false,
    allIn: false,
    currentBet: 0,
    hasActed: false,
    isBot: false,
    sittingOut: false,
    ...overrides,
  };
}

function applyOk(game: GameState, playerId: string, action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount?: number): GameState {
  const result = applyAction(game, playerId, action, amount);
  expect(result.ok, result.ok ? undefined : result.error).toBe(true);
  return result.state;
}

function checkThroughStreet(game: GameState, expectedStreet: GameState['street']): GameState {
  let next = game;
  while (next.street !== expectedStreet) {
    const actor = next.players[next.currentPlayerIndex];
    expect(actor, `expected an actor while advancing to ${expectedStreet}`).toBeTruthy();
    next = applyOk(next, actor.id, 'check');
  }
  return next;
}

function expectLivePotInvariant(
  game: GameState,
  expected: { readout: number; swept: number; pills: number; total: number },
): void {
  expect(displayedPotAmount(game)).toBe(expected.readout);
  expect(sweptPotAmount(game)).toBe(expected.swept);
  expect(renderedBetPillTotal(game)).toBe(expected.pills);
  expect(totalCommittedChips(game)).toBe(expected.total);
  expect(sweptPotAmount(game) + renderedBetPillTotal(game)).toBe(totalCommittedChips(game));
}

describe('chip pot arithmetic', () => {
  it('uses side pots as the committed total when they are present', () => {
    const s = state({
      contributions: { a: 20, b: 50, c: 50 },
      pots: [
        { amount: 60 },
        { amount: 60 },
      ],
    });
    expect(totalCommittedChips(s)).toBe(120);
  });

  it('falls back to contributions before pots exist', () => {
    const s = state({ contributions: { a: 5, b: 10 }, pots: [] });
    expect(totalCommittedChips(s)).toBe(15);
  });

  it('keeps current street bets out of the swept chip amount', () => {
    const s = state({
      contributions: { a: 10, b: 20 },
      pots: [{ amount: 30 }],
      players: [
        { id: 'a', currentBet: 10 },
        { id: 'b', currentBet: 20 },
      ],
    });
    expect(currentStreetBetTotal(s)).toBe(30);
    expect(sweptPotAmount(s)).toBe(0);
    expect(displayedPotAmount(s)).toBe(30);
  });

  it('uses the full committed total for the centre readout after bets are swept', () => {
    const s = state({
      street: 'flop',
      contributions: { a: 10, b: 20 },
      pots: [{ amount: 30 }],
      players: [
        { id: 'a', currentBet: 0 },
        { id: 'b', currentBet: 0 },
      ],
    });
    expect(sweptPotAmount(s)).toBe(30);
    expect(displayedPotAmount(s)).toBe(30);
  });

  it('hides the live pot readout at showdown after chips have been awarded', () => {
    const s = state({
      street: 'showdown',
      contributions: { a: 150, b: 150, c: 50 },
      pots: [
        { amount: 150 },
        { amount: 200 },
      ],
      players: [
        { id: 'a', currentBet: 100 },
        { id: 'b', currentBet: 100 },
        { id: 'c', currentBet: 0 },
      ],
    });
    expect(currentStreetBetTotal(s)).toBe(0);
    expect(totalCommittedChips(s)).toBe(350);
    expect(sweptPotAmount(s)).toBe(0);
    expect(displayedPotAmount(s)).toBe(0);
  });

  it('shows the full running total during a live all-in street', () => {
    const s = state({
      contributions: { a: 20, b: 100 },
      pots: [
        { amount: 40 },
        { amount: 80 },
      ],
      players: [
        { id: 'a', currentBet: 20 },
        { id: 'b', currentBet: 100 },
      ],
    });
    expect(sweptPotAmount(s)).toBe(0);
    expect(displayedPotAmount(s)).toBe(120);
  });

  it('keeps all-in side-pot bets out front until the street ends', () => {
    const players: Player[] = [
      player('a', { currentBet: 20, allIn: true }),
      player('b', { currentBet: 50 }),
      player('c', { currentBet: 50 }),
    ];
    const contributions = { a: 20, b: 50, c: 50 };
    const pots = buildSidePots(players, contributions);
    const currentStreet = state({
      contributions,
      pots,
      players,
    });
    const showdown = state({ ...currentStreet, street: 'showdown' });
    expect(pots.map((pot) => pot.amount)).toEqual([60, 60]);
    expect(sweptPotAmount(currentStreet)).toBe(0);
    expect(displayedPotAmount(currentStreet)).toBe(120);
    expect(sweptPotAmount(showdown)).toBe(0);
    expect(displayedPotAmount(showdown)).toBe(0);
  });

  it('matches the table bet-pill invariant on real engine states through a hand', () => {
    let game = startHand(createGame(
      { smallBlind: 10, bigBlind: 20, startingStack: 2_000, maxPlayers: 6, turnTimerSec: 20 },
      [
        { id: 'hero', name: 'Golden Chip' },
        { id: 'ravi', name: 'Ravi' },
        { id: 'mika', name: 'Mika' },
        { id: 'jules', name: 'Jules' },
        { id: 'nina', name: 'Nina' },
        { id: 'theo', name: 'Theo' },
      ],
      42,
    ));

    expect(game.players.map((p) => ({ id: p.id, chips: p.chips, currentBet: p.currentBet }))).toEqual([
      { id: 'hero', chips: 2_000, currentBet: 0 },
      { id: 'ravi', chips: 1_990, currentBet: 10 },
      { id: 'mika', chips: 1_980, currentBet: 20 },
      { id: 'jules', chips: 2_000, currentBet: 0 },
      { id: 'nina', chips: 2_000, currentBet: 0 },
      { id: 'theo', chips: 2_000, currentBet: 0 },
    ]);
    expectLivePotInvariant(game, { readout: 30, swept: 0, pills: 30, total: 30 });

    game = applyOk(game, 'jules', 'raise', 60);
    expect(game.players.map((p) => ({ id: p.id, chips: p.chips, currentBet: p.currentBet }))).toEqual([
      { id: 'hero', chips: 2_000, currentBet: 0 },
      { id: 'ravi', chips: 1_990, currentBet: 10 },
      { id: 'mika', chips: 1_980, currentBet: 20 },
      { id: 'jules', chips: 1_940, currentBet: 60 },
      { id: 'nina', chips: 2_000, currentBet: 0 },
      { id: 'theo', chips: 2_000, currentBet: 0 },
    ]);
    expectLivePotInvariant(game, { readout: 90, swept: 0, pills: 90, total: 90 });

    game = applyOk(game, 'nina', 'call');
    expectLivePotInvariant(game, { readout: 150, swept: 0, pills: 150, total: 150 });

    game = applyOk(game, 'theo', 'call');
    game = applyOk(game, 'hero', 'call');
    game = applyOk(game, 'ravi', 'call');
    game = applyOk(game, 'mika', 'call');
    expect(game.street).toBe('flop');
    expectLivePotInvariant(game, { readout: 360, swept: 360, pills: 0, total: 360 });

    game = checkThroughStreet(game, 'turn');
    expectLivePotInvariant(game, { readout: 360, swept: 360, pills: 0, total: 360 });
    game = checkThroughStreet(game, 'river');
    expectLivePotInvariant(game, { readout: 360, swept: 360, pills: 0, total: 360 });
    game = checkThroughStreet(game, 'showdown');

    expect(game.street).toBe('showdown');
    expect(totalCommittedChips(game)).toBe(360);
    expect(sweptPotAmount(game)).toBe(0);
    expect(renderedBetPillTotal(game)).toBe(0);
    expect(displayedPotAmount(game)).toBe(0);
  });
});

describe('chip motion events', () => {
  it('emits initial blind commits for a newly dealt hand', () => {
    const events = initialChipMotionEvents(state({
      players: [
        { id: 'sb', currentBet: 5 },
        { id: 'bb', currentBet: 10 },
      ],
    }));
    expect(events).toEqual([
      { phase: 'commit', playerId: 'sb', amount: 5, delayMs: 0, durationMs: CHIP_COMMIT_DURATION_MS },
      { phase: 'commit', playerId: 'bb', amount: 10, delayMs: 0, durationMs: CHIP_COMMIT_DURATION_MS },
    ]);
  });

  it('emits a commit when a player adds chips during a street', () => {
    const prev = state({
      contributions: { a: 10 },
      players: [{ id: 'a', currentBet: 10 }],
    });
    const next = state({
      contributions: { a: 25 },
      pots: [{ amount: 25 }],
      players: [{ id: 'a', currentBet: 25 }],
    });
    expect(chipMotionEvents(prev, next)).toEqual([
      { phase: 'commit', playerId: 'a', amount: 15, delayMs: 0, durationMs: CHIP_COMMIT_DURATION_MS },
    ]);
  });

  it('sweeps every final bet after a call completes the round', () => {
    const prev = state({
      contributions: { a: 100, b: 50 },
      pots: [{ amount: 150 }],
      players: [
        { id: 'a', currentBet: 100 },
        { id: 'b', currentBet: 50 },
      ],
    });
    const next = state({
      street: 'flop',
      contributions: { a: 100, b: 100 },
      pots: [{ amount: 200 }],
      players: [
        { id: 'a', currentBet: 0 },
        { id: 'b', currentBet: 0 },
      ],
    });
    const events = chipMotionEvents(prev, next);
    expect(events).toEqual([
      { phase: 'commit', playerId: 'b', amount: 50, delayMs: 0, durationMs: CHIP_COMMIT_DURATION_MS },
      { phase: 'sweep', playerId: 'a', amount: 100, delayMs: 430, durationMs: CHIP_SWEEP_DURATION_MS },
      { phase: 'sweep', playerId: 'b', amount: 100, delayMs: 430, durationMs: CHIP_SWEEP_DURATION_MS },
    ]);
  });

  it('sweeps prior bets when a fold ends the hand', () => {
    const prev = state({
      contributions: { a: 40, b: 40 },
      pots: [{ amount: 80 }],
      players: [
        { id: 'a', currentBet: 40 },
        { id: 'b', currentBet: 40 },
      ],
    });
    const next = state({
      street: 'showdown',
      contributions: { a: 40, b: 40 },
      pots: [{ amount: 80 }],
      players: [
        { id: 'a', currentBet: 40 },
        { id: 'b', currentBet: 40 },
      ],
    });
    expect(chipMotionEvents(prev, next)).toEqual([
      { phase: 'sweep', playerId: 'a', amount: 40, delayMs: 70, durationMs: CHIP_SWEEP_DURATION_MS },
      { phase: 'sweep', playerId: 'b', amount: 40, delayMs: 70, durationMs: CHIP_SWEEP_DURATION_MS },
    ]);
  });
});

describe('chip motion geometry', () => {
  it('resolves seat, bet, and pot points for table overlays', () => {
    expect(opponentSeatChipPoint({ left: 20, top: 10 }, 80, 90)).toEqual({ x: 60, y: 47.8 });
    expect(opponentBetChipPoint({ left: 20, top: 10 }, 80, 90)).toEqual({ x: 60, y: 94 });
    expect(heroSeatChipPoint(320, 300, 100)).toEqual({ x: 160, y: 242 });
    expect(heroBetChipPoint(320, 300)).toEqual({ x: 160, y: 286 });
    expect(potChipPoint({
      areaWidth: 320,
      laneTop: 80,
      boardBox: { x: 60, y: 20, w: 200, h: 52 },
    })).toEqual({ x: 160, y: 176 });
  });

  it('maps commit paths to the bet point and sweep paths to the pot', () => {
    const seat = { x: 10, y: 20 };
    const bet = { x: 30, y: 40 };
    const pot = { x: 50, y: 60 };
    expect(chipMotionPath('commit', seat, bet, pot)).toEqual({ from: seat, to: bet });
    expect(chipMotionPath('sweep', seat, bet, pot)).toEqual({ from: bet, to: pot });
  });

  it('removes the bot read delay when animations are disabled', () => {
    expect(actionReadDelayMs(true)).toBe(0);
    expect(actionReadDelayMs(false)).toBeGreaterThan(0);
  });
});
