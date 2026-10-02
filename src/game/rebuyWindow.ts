/**
 * What happens when the table runs out of players who can bet.
 *
 * A hand needs two seated players holding chips. When somebody busts, the
 * table used to simply stop and say it was waiting, with no indication of what
 * it was waiting for or how long it would wait, which is forever. The busted
 * player, meanwhile, had no prompt at all unless they happened to be the local
 * one, so two people could sit looking at each other indefinitely.
 *
 * So the wait is now explicit and bounded: everybody who busted gets a window
 * to rebuy, the table says whose it is and how long is left, and when it runs
 * out whoever did not take it is shown the door rather than left occupying a
 * seat nobody can play against.
 */

/**
 * How long a busted player has to decide.
 *
 * Long enough to notice a prompt, read it, and mean the answer; short enough
 * that the rest of the table is not held hostage by somebody who put their
 * phone down. iOS also closes the socket within seconds of backgrounding, so a
 * much longer window would mostly be spent waiting on people who already left.
 */
export const REBUY_WINDOW_MS = 45_000;

/** A hand cannot be dealt to fewer than two players who can put chips in. */
export const MIN_PLAYERS_TO_DEAL = 2;

export interface SeatedPlayer {
  id: string;
  name: string;
  chips: number;
  sittingOut?: boolean;
}

/** Players who could be dealt in right now. */
export function playersAbleToDeal(players: readonly SeatedPlayer[]): SeatedPlayer[] {
  return players.filter((p) => p.chips > 0 && !p.sittingOut);
}

/** Whether a hand can start at all. */
export function canDealHand(players: readonly SeatedPlayer[]): boolean {
  return playersAbleToDeal(players).length >= MIN_PLAYERS_TO_DEAL;
}

/**
 * Players holding nothing.
 *
 * Sitting out is a choice and not the same as being broke, so somebody who
 * stepped away with chips in front of them is left alone.
 */
export function bustedPlayers(players: readonly SeatedPlayer[]): SeatedPlayer[] {
  return players.filter((p) => p.chips <= 0 && !p.sittingOut);
}

export type RebuyPhase =
  /** Nobody is holding the table up. */
  | { phase: 'none' }
  /** Waiting on at least one player to decide, with time left on the clock. */
  | { phase: 'waiting'; msLeft: number; secondsLeft: number; players: SeatedPlayer[] }
  /** The window closed and these players have to go. */
  | { phase: 'expired'; players: SeatedPlayer[] };

/**
 * Where the rebuy window stands.
 *
 * `openedAt` is null until a hand actually fails to start, so simply busting
 * on the last hand of the night does not start a clock nobody is watching.
 */
export function rebuyPhase(input: {
  players: readonly SeatedPlayer[];
  openedAt: number | null;
  now: number;
  windowMs?: number;
}): RebuyPhase {
  const windowMs = input.windowMs ?? REBUY_WINDOW_MS;
  const busted = bustedPlayers(input.players);

  /*
   * Nobody is being waited on if the hand could be dealt regardless.
   *
   * With three players and one busted, the other two can simply play on, and
   * putting the short player on a countdown would evict somebody the table
   * never needed to wait for.
   */
  if (busted.length === 0 || canDealHand(input.players)) return { phase: 'none' };
  if (input.openedAt === null) return { phase: 'waiting', msLeft: windowMs, secondsLeft: Math.ceil(windowMs / 1000), players: busted };

  const msLeft = input.openedAt + windowMs - input.now;
  if (msLeft <= 0) return { phase: 'expired', players: busted };
  return { phase: 'waiting', msLeft, secondsLeft: Math.ceil(msLeft / 1000), players: busted };
}

/**
 * What to put on screen while the clock runs.
 *
 * Names the player, because "waiting for players" tells somebody staring at a
 * frozen table nothing about whether to keep waiting.
 */
export function rebuyNotice(phase: RebuyPhase, localPlayerId: string): string | null {
  if (phase.phase !== 'waiting') return null;
  const others = phase.players.filter((p) => p.id !== localPlayerId);
  const youAreBusted = phase.players.some((p) => p.id === localPlayerId);
  const clock = `${phase.secondsLeft}s`;

  if (youAreBusted && others.length === 0) return `Rebuy to keep playing \u00b7 ${clock}`;
  if (youAreBusted) return `Rebuy to keep playing \u00b7 ${clock}`;
  if (others.length === 1) return `Waiting for ${others[0]!.name} to rebuy \u00b7 ${clock}`;
  return `Waiting for ${others.length} players to rebuy \u00b7 ${clock}`;
}

/**
 * Who leaves when the window closes.
 *
 * Everyone still holding nothing. A player who rebought is no longer busted,
 * so they simply are not in this list.
 */
export function playersToEvict(players: readonly SeatedPlayer[]): SeatedPlayer[] {
  return bustedPlayers(players);
}

/**
 * Whether the local player is the one being shown the door.
 *
 * Their own eviction is a navigation, everyone else's is a seat opening up,
 * and the two must not be confused or a spectator gets thrown out of a table
 * they were still playing at.
 */
export function localPlayerEvicted(phase: RebuyPhase, localPlayerId: string): boolean {
  return phase.phase === 'expired' && phase.players.some((p) => p.id === localPlayerId);
}
