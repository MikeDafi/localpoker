/**
 * What the chips in front of a seat say.
 *
 * A call is the one wager whose size nobody needs to read: it is the bet
 * already on the table. Printing the number made a call look like a bet of
 * its own, so a caller's pill says "Call" and every other wager keeps its
 * amount.
 */

import type { GameState } from '../engine/types';

/**
 * Whether this seat's chips this street are a call.
 *
 * The aggressor set the price and a player who has not acted yet only posted
 * a blind. The engine counts the big blind as the aggressor before the flop,
 * so a big blind checking its option is not read as a call.
 */
export function calledThisStreet(state: Pick<GameState, 'players' | 'currentBet' | 'lastAggressorIndex' | 'priceSetterIndex' | 'street'>, index: number): boolean {
  const player = state.players[index];
  if (!player || state.street === 'showdown') return false;
  return player.hasActed
    && !player.folded
    && player.currentBet > 0
    && player.currentBet === state.currentBet
    // Whoever set the price did not call it. That is the last aggressor
    // unless a short all-in raised the price since, which is not aggression
    // but was being labelled a call.
    && index !== (state.priceSetterIndex ?? state.lastAggressorIndex);
}
