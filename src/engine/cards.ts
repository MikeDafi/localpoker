export type Suit = 'c' | 'd' | 'h' | 's';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Seed = number | string;

export const SUITS: readonly Suit[] = ['c', 'd', 'h', 's'] as const;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function rankToString(rank: Rank): string {
  if (rank <= 9) return String(rank);
  if (rank === 10) return 'T';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return 'A';
}

export function formatCard(card: Card): string {
  return `${rankToString(card.rank)}${card.suit}`;
}

export function seedToNumber(seed: Seed): number {
  if (typeof seed === 'number') return seed >>> 0;

  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: Seed): () => number {
  let value = seedToNumber(seed);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomFloat(seed: Seed): number {
  return mulberry32(seed)();
}

export function shuffleDeck(seed: Seed, deck: readonly Card[] = createDeck()): Card[] {
  const shuffled = deck.map((card) => ({ ...card }));
  const random = mulberry32(seed);

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}
