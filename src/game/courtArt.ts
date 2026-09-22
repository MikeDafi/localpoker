import type { Suit } from './suitPaths';

type CourtRank = 11 | 12 | 13;

const COURT_ART_BY_RANK: Record<CourtRank, Record<Suit, number>> = {
  11: {
    c: require('../../assets/cards/court/J-c.png'),
    d: require('../../assets/cards/court/J-d.png'),
    h: require('../../assets/cards/court/J-h.png'),
    s: require('../../assets/cards/court/J-s.png'),
  },
  12: {
    c: require('../../assets/cards/court/Q-c.png'),
    d: require('../../assets/cards/court/Q-d.png'),
    h: require('../../assets/cards/court/Q-h.png'),
    s: require('../../assets/cards/court/Q-s.png'),
  },
  13: {
    c: require('../../assets/cards/court/K-c.png'),
    d: require('../../assets/cards/court/K-d.png'),
    h: require('../../assets/cards/court/K-h.png'),
    s: require('../../assets/cards/court/K-s.png'),
  },
};

/** Court figure artwork, cropped to the card's central panel. */
export const COURT_ART = COURT_ART_BY_RANK as Record<number, Record<Suit, number>>;

export function courtArt(rank: number, suit: Suit): number | null {
  if (rank !== 11 && rank !== 12 && rank !== 13) return null;
  return COURT_ART_BY_RANK[rank][suit];
}
