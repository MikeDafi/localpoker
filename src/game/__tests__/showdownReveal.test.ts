import { describe, expect, it } from 'vitest';
import { showdownOrder, type ShowdownSeat } from '../showdownOrder';
import {
  advanceReveal,
  awaitingChoiceFrom,
  pendingPlayer,
  revealComplete,
  startReveal,
} from '../showdownReveal';

const seat = (id: string): ShowdownSeat => ({ id, holeCards: [{}, {}] });
const players = ['a', 'b', 'c', 'd'].map(seat);

/** Aggressor is 'c', so 'c' shows first and cannot muck. 'a' also won. */
const order = showdownOrder({
  players,
  dealerIndex: 0,
  lastAggressorIndex: 2,
  winnerIds: ['a'],
});

describe('walking the showdown', () => {
  it('asks in the order the rule sets', () => {
    let p = startReveal();
    const asked: string[] = [];
    while (!revealComplete(order, p)) {
      asked.push(pendingPlayer(order, p)!);
      p = advanceReveal(order, p, true);
    }
    expect(asked).toEqual(['c', 'd', 'a', 'b']);
  });

  it('tables a hand that asked to be shown', () => {
    const p = advanceReveal(order, startReveal(), true);
    expect(p.shown).toEqual(['c']);
    expect(p.mucked).toEqual([]);
  });

  it('lets a free hand be thrown away', () => {
    let p = advanceReveal(order, startReveal(), true); // c, forced
    p = advanceReveal(order, p, false);                // d, free
    expect(p.mucked).toEqual(['d']);
    expect(p.shown).toEqual(['c']);
  });

  it('tables a forced hand even when the answer was no', () => {
    // The first to act made the claim, so it is not a request.
    const p = advanceReveal(order, startReveal(), false);
    expect(p.shown).toEqual(['c']);
    expect(p.mucked).toEqual([]);
  });

  it('tables a winner even when the answer was no', () => {
    // A pot cannot be paid to a hand nobody saw.
    let p = startReveal();
    p = advanceReveal(order, p, false); // c forced
    p = advanceReveal(order, p, false); // d mucks
    p = advanceReveal(order, p, false); // a is a winner
    expect(p.shown).toContain('a');
    expect(p.mucked).not.toContain('a');
  });

  it('resolves every hand exactly once', () => {
    let p = startReveal();
    for (let i = 0; i < 10; i += 1) p = advanceReveal(order, p, i % 2 === 0);
    expect([...p.shown, ...p.mucked].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('stops asking once everybody has decided', () => {
    let p = startReveal();
    for (let i = 0; i < 4; i += 1) p = advanceReveal(order, p, true);
    expect(revealComplete(order, p)).toBe(true);
    expect(pendingPlayer(order, p)).toBeNull();
    // Past the end it must not keep adding people.
    expect(advanceReveal(order, p, true)).toEqual(p);
  });
});

describe('when the table waits for the player', () => {
  it('waits when they have a real choice', () => {
    let p = startReveal();
    p = advanceReveal(order, p, true); // c
    expect(awaitingChoiceFrom(order, p, 'd')).toBe(true);
  });

  it('does not wait on a hand that has to be shown', () => {
    // 'c' is first to act and 'a' won: neither is being asked anything.
    expect(awaitingChoiceFrom(order, startReveal(), 'c')).toBe(false);
    let p = advanceReveal(order, startReveal(), true);
    p = advanceReveal(order, p, false);
    expect(awaitingChoiceFrom(order, p, 'a')).toBe(false);
  });

  it('does not wait on somebody else', () => {
    let p = advanceReveal(order, startReveal(), true);
    expect(awaitingChoiceFrom(order, p, 'b')).toBe(false);
  });
});
