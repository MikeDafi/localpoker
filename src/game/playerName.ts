/**
 * The starter handle a fresh install gets.
 *
 * This was eight adjectives by eight nouns. Sixty four combinations sounds
 * like plenty until you notice that every eighth new player is called "turbo"
 * something, which is exactly what a real player noticed. The problem is not
 * randomness, it is that the pool was small enough for the eye to spot the
 * repetition, and a name that obviously came out of a tiny list does not feel
 * like yours.
 *
 * Lives here rather than in AppContext because it is pure and worth asserting
 * on: the test below the pool is what stops someone quietly shrinking it again.
 */

/**
 * The name doubles as the handle other players add you by, so every word has
 * to be handle shaped: lowercase ASCII, no spaces, nothing that needs
 * escaping in a database key or a URL.
 */
export const NAME_ADJECTIVES = [
  'mighty', 'lucky', 'sneaky', 'royal', 'turbo', 'cosmic', 'wild', 'golden',
  'silent', 'rapid', 'clever', 'brave', 'sly', 'bold', 'swift', 'calm',
  'nimble', 'rogue', 'stoic', 'crafty', 'neon', 'velvet', 'copper', 'midnight',
  'amber', 'arctic', 'electric', 'feral', 'humble', 'jolly', 'keen', 'lunar',
  'noble', 'quiet', 'rusty', 'solar', 'tidy', 'urban', 'vivid', 'zesty',
  'breezy', 'cheeky', 'dapper', 'eager', 'frosty', 'gentle', 'hasty', 'ivory',
] as const;

export const NAME_NOUNS = [
  'ace', 'shark', 'bluff', 'chip', 'river', 'joker', 'king', 'bandit',
  'flop', 'turn', 'deuce', 'raise', 'tell', 'stack', 'rail', 'dealer',
  'bishop', 'comet', 'falcon', 'heron', 'jester', 'knight', 'lantern', 'magpie',
  'nomad', 'otter', 'piper', 'quill', 'rook', 'sparrow', 'tiger', 'vulture',
  'walrus', 'yak', 'zebra', 'anchor', 'beacon', 'cobra', 'drifter', 'ember',
  'fox', 'gambit', 'hawk', 'ibis', 'jackal', 'kestrel', 'lynx', 'marlin',
] as const;

/**
 * Every combination the pool can produce, before the numeric suffix.
 *
 * Over two thousand, against sixty four before, so no single word carries
 * more than about two percent of new names.
 */
export const NAME_COMBINATIONS = NAME_ADJECTIVES.length * NAME_NOUNS.length;

/**
 * `random` is injectable so the test can pin it. It must behave like
 * `Math.random`: in [0, 1).
 */
export function randomName(random: () => number = Math.random): string {
  const pick = <T,>(list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  const suffix = 1000 + Math.min(8999, Math.floor(random() * 9000));
  return `${pick(NAME_ADJECTIVES)}_${pick(NAME_NOUNS)}${suffix}`;
}
