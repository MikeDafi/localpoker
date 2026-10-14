import { describe, expect, it } from 'vitest';
import { propsEqual, sameValue } from '../propsEqual';

describe('propsEqual', () => {
  it('treats fresh literals with the same contents as equal', () => {
    expect(propsEqual(
      { player: { id: 'a', chips: 10, holeCards: [{ rank: 2, suit: 's' }] }, dealFrom: { x: 1, y: 2 }, shown: [true, false] },
      { player: { id: 'a', chips: 10, holeCards: [{ rank: 2, suit: 's' }] }, dealFrom: { x: 1, y: 2 }, shown: [true, false] },
    )).toBe(true);
  });

  it('notices any changed value, added key or reordered array', () => {
    expect(propsEqual({ player: { chips: 10 } }, { player: { chips: 11 } })).toBe(false);
    expect(propsEqual({ a: 1 } as object, { a: 1, b: undefined } as object)).toBe(false);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
  });

  it('compares functions and class instances by reference', () => {
    const f = () => 1;
    expect(propsEqual({ f }, { f })).toBe(true);
    expect(propsEqual({ f }, { f: () => 1 })).toBe(false);
    class Box { constructor(public v: number) {} }
    expect(propsEqual({ b: new Box(1) }, { b: new Box(1) })).toBe(false);
  });
});
