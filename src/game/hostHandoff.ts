/**
 * Handing the dealer's seat to somebody else when the host goes.
 *
 * Online play is host-authoritative: the host's phone holds the deck and
 * every hole card, and nobody else can deal. When the host left, the room
 * used to end for everyone. Now another seated player takes over and the
 * game carries on from the next hand.
 *
 * The hand in progress cannot be finished. The deck and the other players'
 * cards only ever existed on the old host's phone, so nobody left can deal
 * the next street or settle a showdown honestly. It is abandoned and every
 * player gets back exactly what they put into it, then the new host deals a
 * fresh hand from the chips everybody can see.
 *
 * Everything here is pure, so who takes over and what the next hand looks
 * like can be decided and tested without a device or a database.
 */

import { canStartHand, createGame, startHand, type GameConfig, type GameState, type PlayerInput } from '../engine';
import type { PublicGameState } from './onlineSync';
import { applyBlindLevel, blindsDue, type BlindLevel } from './tournament';

/**
 * How long the host must have been gone before a guest may take over.
 *
 * The rules allow a claim once `hostAwayAt` is 15 seconds old by the
 * server's clock. The client waits longer than that because it compares the
 * server's stamp with its own clock, and a phone running a few seconds fast
 * would otherwise be refused, retry, and be refused again. A claim refused
 * this way is harmless, it is just wasted.
 *
 * Longer than the 12 second connection grace too, so a host walking through
 * a dead spot keeps the table rather than losing it on the first blip.
 */
export const HOST_HANDOFF_AFTER_MS = 20_000;

/** Must match the `now - 15000` in the claim rules in database.rules.json. */
export const HOST_HANDOFF_RULES_MS = 15_000;

/**
 * Extra wait for each seat behind the first in line.
 *
 * The first in line normally claims straight away. If their phone is in a
 * pocket with the app suspended, nothing happens, so the next seat tries a
 * little later, and so on. The rules make a claim succeed at most once, so
 * staggering only decides who goes first, never whether two hosts exist.
 */
export const HOST_HANDOFF_STAGGER_MS = 8_000;

export type HandoffPlayer = {
  id: string;
  name?: string;
  seatIndex?: number;
  connected?: unknown;
};

export type HandoffRoom = {
  status?: string | null;
  hostId?: string | null;
  hostAwayAt?: number | null;
  players?: Record<string, HandoffPlayer | null | undefined> | null;
};

const seatOf = (player: HandoffPlayer): number =>
  typeof player.seatIndex === 'number' && Number.isFinite(player.seatIndex) ? player.seatIndex : Number.MAX_SAFE_INTEGER;

/**
 * Everyone who may take over, best first.
 *
 * Lowest seat first, then id, so every phone looking at the same roster
 * builds the same line. Somebody known to be disconnected goes to the back
 * rather than out: their phone cannot claim while it is gone, but if they
 * are the only one left they are still better than an empty chair.
 */
export function handoffLine(players: HandoffRoom['players'], departingHostId: string | null | undefined): string[] {
  return Object.values(players ?? {})
    .filter((player): player is HandoffPlayer => !!player && typeof player.id === 'string' && player.id !== departingHostId)
    .sort((a, b) => {
      const away = Number(a.connected === false) - Number(b.connected === false);
      return away || seatOf(a) - seatOf(b) || a.id.localeCompare(b.id);
    })
    .map((player) => player.id);
}

/** Who should become host, or null when nobody is left to. */
export function pickNextHost(players: HandoffRoom['players'], departingHostId: string | null | undefined): string | null {
  return handoffLine(players, departingHostId)[0] ?? null;
}

export type HandoffDecision =
  | { kind: 'none' }
  /** Not yet: look again at `checkAt` (local clock). */
  | { kind: 'wait'; checkAt: number }
  | { kind: 'claim' };

/**
 * Whether this phone should claim the host's seat now.
 *
 * `hostGoneSince` is when this phone first saw the host's seat empty. A host
 * that leaves deletes its own seat, which carries no timestamp, so the
 * stagger for later seats is measured from when each phone noticed.
 *
 * A host that is merely away keeps its seat, and `hostAwayAt` is the server's
 * own record of when it dropped. `connected === true` beats a stale marker:
 * nothing clears `hostAwayAt` on the instant a host reconnects, and a host
 * that is plainly here must never be replaced.
 */
export function decideHostHandoff(input: {
  room: HandoffRoom | null | undefined;
  myId: string | null | undefined;
  now: number;
  hostGoneSince?: number | null;
}): HandoffDecision {
  const { room, myId, now } = input;
  if (!room || room.status !== 'playing' || !myId || !room.hostId || room.hostId === myId) return { kind: 'none' };
  if (!room.players?.[myId]) return { kind: 'none' };

  const line = handoffLine(room.players, room.hostId);
  // One player left is not a table. The closure path ends it instead.
  if (line.length < 2) return { kind: 'none' };
  const rank = line.indexOf(myId);
  if (rank < 0) return { kind: 'none' };

  const host = room.players?.[room.hostId];
  let eligibleAt: number;
  if (!host) {
    eligibleAt = input.hostGoneSince ?? now;
  } else if (typeof room.hostAwayAt === 'number' && host.connected !== true) {
    eligibleAt = room.hostAwayAt + HOST_HANDOFF_AFTER_MS;
  } else {
    return { kind: 'none' };
  }

  const claimAt = eligibleAt + rank * HOST_HANDOFF_STAGGER_MS;
  return now >= claimAt ? { kind: 'claim' } : { kind: 'wait', checkAt: claimAt };
}

/**
 * What a player gets back when the hand they were in is abandoned.
 *
 * Before the showdown, everything a player has put in this hand is in
 * `contributions` and has already come off `chips`, blinds and antes
 * included, and nothing has been paid out yet. So the stack they sat down to
 * the hand with is exactly `chips + contributions`, and returning that to
 * everybody puts the table back where it was before the cards were dealt.
 *
 * At the showdown the pot has already been paid, so `chips` is the result
 * and adding the contributions again would mint chips. A finished hand is
 * left as it finished.
 */
export function refundedStack(publicState: Pick<PublicGameState, 'street' | 'players' | 'contributions'>, playerId: string): number {
  const player = publicState.players?.[playerId];
  if (!player) return 0;
  const chips = Math.max(0, player.chips ?? 0);
  if (publicState.street === 'showdown') return chips;
  return chips + Math.max(0, publicState.contributions?.[playerId] ?? 0);
}

/**
 * The next hand, dealt by the new host from what everybody could already see.
 *
 * `seated` is who is still at the table, which excludes the host who left.
 * Seats keep their published order and seat numbers, and the button moves on
 * from where it was, so the hand reads as the next one rather than as a new
 * game. Returns null when fewer than two players have chips, which is a table
 * that is over rather than one that needs a dealer.
 */
export function nextHandAfterHandoff(input: {
  publicState: PublicGameState;
  seated: readonly { id: string; name?: string }[];
  seed: string;
  /** The blinds this hand should be played at, when a tournament has moved them on. */
  level?: BlindLevel | null;
}): GameState | null {
  const { publicState } = input;
  const seatedIds = new Set(input.seated.map((player) => player.id));
  const order = (publicState.playerOrder ?? []).filter((id) => seatedIds.has(id) && !!publicState.players?.[id]);
  if (order.length < 2) return null;

  const players: PlayerInput[] = order.map((id) => {
    const published = publicState.players[id]!;
    const roster = input.seated.find((player) => player.id === id);
    return {
      id,
      name: published.name || roster?.name || 'Player',
      seatIndex: published.seatIndex,
      chips: refundedStack(publicState, id),
      isBot: false,
      // Whether somebody is here is the connection layer's call, made fresh
      // every hand. Carrying a stale flag over would deal them out for good.
      sittingOut: false,
    };
  });

  const baseConfig: GameConfig = { ...publicState.config, maxPlayers: Math.max(publicState.config.maxPlayers, players.length) };
  const config = input.level && blindsDue(baseConfig, input.level)
    ? applyBlindLevel({ config: baseConfig }, input.level).config
    : baseConfig;

  const game = createGame(config, players, input.seed);
  /*
   * startHand adds one to the hand number and moves the button one seat on
   * from `dealerIndex`. Starting from the published hand and the seat just
   * before the old button (or the old button itself, if they are still here)
   * makes the dealt hand the next hand at the same table.
   */
  game.handNumber = Math.max(0, publicState.handNumber ?? 0);
  game.dealerIndex = buttonBefore(publicState, order);
  if (!canStartHand(game)) return null;
  return startHand(game);
}

/**
 * Index in `order` of the last remaining player at or before the old button.
 *
 * If the host who left had the button, it lands on the seat before theirs,
 * so the deal moves on to whoever sat after them rather than skipping a seat.
 */
function buttonBefore(publicState: Pick<PublicGameState, 'playerOrder' | 'dealerId' | 'dealerIndex'>, order: readonly string[]): number {
  const previous = publicState.playerOrder ?? [];
  const dealerId = publicState.dealerId ?? previous[publicState.dealerIndex] ?? null;
  const at = dealerId ? previous.indexOf(dealerId) : -1;
  if (at < 0) return -1;
  for (let step = 0; step < previous.length; step += 1) {
    const id = previous[(at - step + previous.length) % previous.length];
    const index = order.indexOf(id!);
    if (index >= 0) return index;
  }
  return -1;
}
