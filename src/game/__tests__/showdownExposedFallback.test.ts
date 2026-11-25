import { describe, expect, it } from 'vitest';
import { selectShowdownHands } from '../showdownLayout';

describe('selectShowdownHands on a guest', () => {
  it('draws a flipped opponent from the published cards when it holds none of its own', () => {
    const ace = { rank: 14, suit: 's' } as const;
    const king = { rank: 13, suit: 'h' } as const;
    const rows = selectShowdownHands(
      [{ playerId: 'me', amount: 10, hand: { cards: [ace] } }],
      [
        { id: 'me', name: 'me', holeCards: [ace as never, king as never] },
        { id: 'host', name: 'host', holeCards: [] },
      ],
      {
        localPlayerId: 'me',
        localCardsShown: true,
        label: () => 'Pair',
        contested: true,
        shownIds: ['me'],
        cardExposure: (id) => (id === 'host' ? [true, true] : [false, false]),
        exposedCards: (id) => (id === 'host' ? [king as never, ace as never] : undefined),
      },
    );
    const host = rows.find((r) => r.playerId === 'host');
    expect(host?.hole).toEqual([king, ace]);
  });
});
