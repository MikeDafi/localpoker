/**
 * How much money a bet should sound like.
 *
 * Every chip action used to play one sound, so calling the blind and shoving
 * a hundred times it were the same noise. At a real table they are not: the
 * difference between a call and a shove is partly how long the chips take to
 * stop rattling, and that is a thing you hear from across the room rather
 * than something you have to be watching for.
 *
 * The size that matters is relative to **the pot**, not to the blinds and not
 * absolute. A 200 bet into 100 is a huge bet; the same 200 into 4,000 is a
 * nuisance, and the blinds cannot tell those apart because by the river they
 * have nothing to do with how big the pot has become. Pot is also how players
 * actually talk about bets: a third, a half, pot, overbet.
 *
 * Doubling is the step. A quarter pot is one coin and every doubling from
 * there adds another, so half pot is two, pot is three, twice pot is four,
 * and anything bigger is the full handful.
 */

/** Past five it stops reading as "more" and starts reading as a rattle. */
export const MAX_CHIP_SOUNDS = 5;

/** Pot-sized is this many coins; the scale is built outwards from here. */
const POT_SIZED_SOUNDS = 3;

export function chipSoundsFor(amount: number, pot: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  /*
   * Preflop the pot is the blinds, so it is only ever zero on a table
   * configured without any. That is not a real game, but it must not make the
   * sound of a bet divide by zero.
   */
  if (!Number.isFinite(pot) || pot <= 0) return 1;
  const steps = POT_SIZED_SOUNDS + Math.floor(Math.log2(amount / pot));
  return Math.max(1, Math.min(MAX_CHIP_SOUNDS, steps));
}

/**
 * How many chips this action actually pushes into the middle.
 *
 * Not the same as the number attached to the action. A raise carries the
 * total it raises *to*, so a raise to 60 by somebody already in for 20 moves
 * 40 chips, and keying the sound off the 60 would make the second raise of a
 * street sound bigger than it was. A call carries no number at all.
 */
export function chipsCommitted(input: {
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';
  amount?: number;
  /** What this player already has out on this street. */
  playerBet: number;
  /** What is left in front of them, which is the most they can push. */
  playerChips: number;
  /** The bet they are facing. */
  tableBet: number;
}): number {
  const { action, amount, playerBet, playerChips, tableBet } = input;
  if (action === 'fold' || action === 'check') return 0;
  if (action === 'allin') return Math.max(0, playerChips);
  const target = action === 'call' ? tableBet : amount ?? tableBet;
  return Math.max(0, Math.min(playerChips, target - playerBet));
}
