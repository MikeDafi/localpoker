/**
 * Plain-English explanations for every figure the app shows.
 *
 * Poker stats are jargon by nature, VPIP and PFR mean nothing until someone
 * tells you, and a number you cannot interpret is worse than no number at all
 * because it invites the wrong conclusion. So every stat surfaced anywhere in
 * the app has an entry here, and the screens build their rows from these keys
 * rather than from hand-written lists. That makes "every stat has help" a
 * structural property instead of something to remember.
 *
 * Where a figure has a healthy range, it is stated: knowing you are at 60% VPIP
 * is only useful once you know that is loose.
 */

export interface StatHelp {
  /** Short label as shown in the UI. */
  label: string;
  /** What it expands to, where the name is an acronym. */
  expands?: string;
  /** What it measures, in a sentence or two. */
  what: string;
  /** How to read your own number, where there is a sensible yardstick. */
  reading?: string;
}

export const STAT_HELP = {
  vpip: {
    label: 'VPIP',
    expands: 'Voluntarily Put money In Pot',
    what: 'How often you choose to put chips in before the flop, by calling or raising. Blinds you were forced to post do not count.',
    reading: 'Roughly 20–30% is solid. Much higher means you are playing too many weak hands; much lower means you are folding away playable ones.',
  },
  pfr: {
    label: 'PFR',
    expands: 'Pre-Flop Raise',
    what: 'How often you raise before the flop.',
    reading: 'Read it next to VPIP. The closer the two are, the more you raise rather than call, and raising is usually the stronger move.',
  },
  af: {
    label: 'Aggression',
    expands: 'Aggression Factor',
    what: 'How much you bet and raise compared with how much you call.',
    reading: 'Above about 2 means you drive the betting. Below 1 means you mostly call and let others set the price.',
  },
  winRate: {
    label: 'Win rate',
    what: 'The share of hands you finish having won some part of the pot.',
    reading: 'It falls as the table gets bigger, simply because there are more players to beat, so compare it against tables of a similar size.',
  },
  showdownWin: {
    label: 'Showdown win',
    what: 'When a hand goes all the way to cards on the table, how often yours is best.',
    reading: 'A very high number is not automatically good: it can mean you only ever show down monsters and are folding too much before then.',
  },
  handsLifetime: {
    label: 'Hands (lifetime)',
    what: 'Every hand you have played, across all sessions.',
    reading: 'The other percentages only settle down after a few hundred hands, so treat them as rough until this number is large.',
  },
  handsSession: {
    label: 'Hands (session)',
    what: 'Hands played since you sat down at this table.',
  },
  netChips: {
    label: 'Net chips',
    what: 'Chips won minus chips lost over your whole history.',
    reading: 'Play money, so it is a scoreboard rather than a bankroll.',
  },
  handsWon: {
    label: 'Wins',
    what: 'The number of hands you have won outright or shared.',
  },
  coinsEarned: {
    label: 'Coins earned',
    what: 'Coins collected from playing and winning hands. Spend them in the store.',
  },
  biggestPot: {
    label: 'Biggest pot',
    what: 'The largest pot you have ever taken down.',
  },
  winChance: {
    label: 'Win chance',
    what: 'Your chance of winning this hand as it stands, worked out by dealing the unknown cards many times over and counting how often you come out ahead.',
    reading: 'It moves with every community card, so it is a snapshot of right now rather than a verdict on your hand.',
  },
} as const satisfies Record<string, StatHelp>;

export type StatKey = keyof typeof STAT_HELP;

/** Stats shown in the in-game overlay, in display order. */
export const LIVE_STAT_KEYS: StatKey[] = [
  'vpip',
  'pfr',
  'af',
  'winRate',
  'showdownWin',
  'handsLifetime',
  'handsSession',
  'netChips',
];

/** Stats shown on the profile's stats screen, in display order. */
export const PROFILE_STAT_KEYS: StatKey[] = [
  'winRate',
  'vpip',
  'pfr',
  'showdownWin',
  'af',
  'handsLifetime',
  'handsWon',
  'coinsEarned',
  'biggestPot',
];

/** Stats shown for an opponent, which is only what play reveals about them. */
export const OPPONENT_STAT_KEYS: StatKey[] = ['vpip', 'pfr', 'af', 'winRate', 'showdownWin', 'handsLifetime'];

/** The full explanation for a stat, as a single paragraph. */
export function statHelpText(key: StatKey): string {
  // Widened deliberately: `as const` narrows each entry to its own literal
  // shape, so the optional fields are absent from the type of entries that
  // happen not to use them.
  const h: StatHelp = STAT_HELP[key];
  const opener = h.expands ? `${h.expands}. ` : '';
  return `${opener}${h.what}${h.reading ? ` ${h.reading}` : ''}`;
}
