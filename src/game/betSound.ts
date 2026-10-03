/**
 * How much money a bet should sound like.
 *
 * Every chip action used to play one sound, so calling the blind and shoving
 * a hundred times it were the same noise. At a real table they are not: the
 * difference between a call and a shove is partly how long the chips take to
 * stop rattling, and that is a thing you hear from across the room rather
 * than something you have to be watching for.
 *
 * The size that matters is relative to the blinds, not absolute. A 200 bet is
 * enormous at 2/5 and a min-raise at 100/200, and a table whose sounds were
 * keyed on the raw number would be shouting at the wrong moments the instant
 * anyone changed the stakes.
 *
 * Doubling is the step, because that is roughly how bet sizes are reasoned
 * about: a pot-sized bet, then twice that, then twice again. One chip at the
 * big blind, two at twice it, three at four times, and so on, which keeps the
 * loud end rare without ever letting it run away.
 */

/** Past five it stops reading as "more" and starts reading as a rattle. */
export const MAX_CHIP_SOUNDS = 5;

export function chipSoundsFor(amount: number, bigBlind: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  // A table with no blinds is not a real configuration, but it must not make
  // the sound of a bet divide by zero.
  if (!Number.isFinite(bigBlind) || bigBlind <= 0) return 1;
  const steps = 1 + Math.floor(Math.log2(amount / bigBlind));
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
