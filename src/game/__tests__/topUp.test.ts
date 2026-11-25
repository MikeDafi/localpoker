import { describe, expect, it } from 'vitest';
import { applyTopUp } from '../rebuyWindow';

const players = [
  { id: 'a', name: 'A', chips: 300 },
  { id: 'b', name: 'B', chips: 1500 },
];

describe('applyTopUp', () => {
  it('restores the starting stack between hands', () => {
    const d = applyTopUp({ players, playerId: 'a', startingStack: 1000, handOver: true });
    expect(d.status).toBe('applied');
    if (d.status === 'applied') expect(d.players.find((p) => p.id === 'a')?.chips).toBe(1000);
  });
  it('waits for the hand to end', () => {
    expect(applyTopUp({ players, playerId: 'a', startingStack: 1000, handOver: false }).status).toBe('deferred');
  });
  it('does nothing for a stack already at or above the start', () => {
    expect(applyTopUp({ players, playerId: 'b', startingStack: 1000, handOver: true }).status).toBe('not-needed');
  });
  it('is refused in a tournament', () => {
    expect(applyTopUp({ players, playerId: 'a', startingStack: 1000, handOver: true, tournament: true }).status).toBe('rejected');
  });
});
