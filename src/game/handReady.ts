import { readConnection } from './connectionGrace';

export type HandReadyRecord = {
  handNumber: number;
  ts: number;
};

export type HandReadyByPlayerId = Record<string, HandReadyRecord | null | undefined>;

export type HandReadyPlayer = {
  id: string;
  name?: string | null;
  seatIndex?: number | null;
  chips?: number | null;
  sittingOut?: boolean | null;
  isBot?: boolean | null;
  connected?: unknown;
};

export type HandReadyPlayerMap =
  | Record<string, HandReadyPlayer | null | undefined>
  | readonly (HandReadyPlayer | null | undefined)[];

export type HandReadyPublicPlayer = Omit<HandReadyPlayer, 'id'> & { id?: string | null };

export type HandReadyPublicPlayerMap =
  | Record<string, HandReadyPublicPlayer | null | undefined>
  | readonly (HandReadyPublicPlayer | null | undefined)[];

export type HandReadyWaitingPlayer = {
  id: string;
  name: string;
};

export type HandReadySkipReason = 'disconnected' | 'out' | 'sittingOut';

export type HandReadySkippedPlayer = HandReadyWaitingPlayer & {
  reason: HandReadySkipReason;
};

export type NextHandReadinessInput = {
  handNumber: number;
  players: HandReadyPlayerMap;
  ready?: HandReadyByPlayerId | null;
  publicPlayers?: HandReadyPublicPlayerMap | null;
  disconnectedSince?: Record<string, number | undefined> | null;
  now?: number;
  graceMs?: number;
};

export type NextHandReadiness = {
  canStartNextHand: boolean;
  waitingPlayers: HandReadyWaitingPlayer[];
  readyPlayerIds: string[];
  autoReadyPlayerIds: string[];
  activePlayerIds: string[];
  skippedPlayers: HandReadySkippedPlayer[];
  disconnectedSince: Record<string, number>;
};

const isFiniteHandNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const own = Object.prototype.hasOwnProperty;

const hasOwn = (value: object, key: string): boolean => own.call(value, key);

const connectedFrom = (roomPlayer: HandReadyPlayer, publicPlayer?: HandReadyPublicPlayer): unknown => {
  if (hasOwn(roomPlayer, 'connected')) return roomPlayer.connected;
  return publicPlayer?.connected;
};

const playerName = (player: HandReadyPlayer, publicPlayer?: HandReadyPublicPlayer): string => {
  const name = player.name ?? publicPlayer?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : player.id;
};

const playerEntries = (players: HandReadyPlayerMap): HandReadyPlayer[] => {
  const entries = Array.isArray(players)
    ? players
    : Object.entries(players).map(([id, player]) => player ? { ...player, id: player.id || id } : null);

  return entries
    .filter((player): player is HandReadyPlayer => !!player && typeof player.id === 'string' && player.id.length > 0)
    .sort((a, b) => {
      const aSeat = typeof a.seatIndex === 'number' ? a.seatIndex : Number.MAX_SAFE_INTEGER;
      const bSeat = typeof b.seatIndex === 'number' ? b.seatIndex : Number.MAX_SAFE_INTEGER;
      return aSeat - bSeat || playerName(a).localeCompare(playerName(b)) || a.id.localeCompare(b.id);
    });
};

const publicPlayerEntries = (players: HandReadyPublicPlayerMap | null | undefined): Map<string, HandReadyPublicPlayer> => {
  const mapped = new Map<string, HandReadyPublicPlayer>();
  if (!players) return mapped;

  const entries = Array.isArray(players)
    ? players.map((player) => [player?.id ?? '', player] as const)
    : Object.entries(players).map(([id, player]) => [player?.id ?? id, player] as const);

  for (const [id, player] of entries) {
    if (player && typeof id === 'string' && id.length > 0) {
      mapped.set(id, player);
    }
  }
  return mapped;
};

const numberFrom = (primary: unknown, fallback: unknown): number | undefined => {
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback;
  return undefined;
};

const booleanFrom = (primary: unknown, fallback: unknown): boolean => {
  if (typeof primary === 'boolean') return primary;
  if (typeof fallback === 'boolean') return fallback;
  return false;
};

export const isReadyForHand = (
  ready: HandReadyRecord | null | undefined,
  handNumber: number,
): boolean => (
  isFiniteHandNumber(handNumber) &&
  !!ready &&
  isFiniteHandNumber(ready.handNumber) &&
  ready.handNumber === handNumber
);

export function evaluateNextHandReadiness(input: NextHandReadinessInput): NextHandReadiness {
  const handNumber = isFiniteHandNumber(input.handNumber) ? input.handNumber : -1;
  const ready = input.ready ?? {};
  const publicPlayers = publicPlayerEntries(input.publicPlayers);
  const waitingPlayers: HandReadyWaitingPlayer[] = [];
  const readyPlayerIds: string[] = [];
  const autoReadyPlayerIds: string[] = [];
  const activePlayerIds: string[] = [];
  const skippedPlayers: HandReadySkippedPlayer[] = [];
  const disconnectedSince: Record<string, number> = {};
  const now = input.now ?? Date.now();

  for (const player of playerEntries(input.players)) {
    const publicPlayer = publicPlayers.get(player.id);
    const name = playerName(player, publicPlayer);
    const chips = numberFrom(publicPlayer?.chips, player.chips);
    const sittingOut = booleanFrom(publicPlayer?.sittingOut, player.sittingOut);
    const isBot = booleanFrom(publicPlayer?.isBot, player.isBot);
    const connection = readConnection({
      raw: connectedFrom(player, publicPlayer),
      since: input.disconnectedSince?.[player.id],
      now,
      graceMs: input.graceMs,
    });

    if (typeof connection.since === 'number') {
      disconnectedSince[player.id] = connection.since;
    }

    if (sittingOut) {
      skippedPlayers.push({ id: player.id, name, reason: 'sittingOut' });
      continue;
    }
    if (typeof chips === 'number' && chips <= 0) {
      skippedPlayers.push({ id: player.id, name, reason: 'out' });
      continue;
    }
    if (connection.connected === false) {
      skippedPlayers.push({ id: player.id, name, reason: 'disconnected' });
      continue;
    }
    if (isBot) {
      activePlayerIds.push(player.id);
      autoReadyPlayerIds.push(player.id);
      continue;
    }

    activePlayerIds.push(player.id);
    if (isReadyForHand(ready[player.id], handNumber)) {
      readyPlayerIds.push(player.id);
    } else {
      waitingPlayers.push({ id: player.id, name });
    }
  }

  return {
    canStartNextHand: activePlayerIds.length >= 2 && waitingPlayers.length === 0,
    waitingPlayers,
    readyPlayerIds,
    autoReadyPlayerIds,
    activePlayerIds,
    skippedPlayers,
    disconnectedSince,
  };
}

/*
 * How long the host waits on everybody else once it has asked for the next
 * hand itself.
 *
 * Consent has to have a deadline, like every other wait at this table (the
 * turn clock, the rebuy window, the show or muck choice). Build 46 shipped it
 * without one, and anything that kept a single answer from arriving stopped
 * the game for good: a phone locked after its owner folded, a seat whose
 * roster entry read as connected, or a `handReady` write the deployed rules
 * refused. Long enough for somebody still reading the result to tap, short
 * enough that a missing answer costs one beat rather than the table.
 */
export const NEXT_HAND_CONSENT_MS = 15_000;

export type NextHandDealInput = {
  readiness: Pick<NextHandReadiness, 'activePlayerIds' | 'waitingPlayers'>;
  /** The host's own seat id, which counts as ready once `hostAskedAt` is set. */
  hostId: string | null | undefined;
  /**
   * When the host asked for the next hand on its own device, or null.
   *
   * Local rather than read back from `handReady`, because the host's own flag
   * goes through the same rules as everybody else's. If that write is refused
   * the host must still be able to say "I am done", or nothing ever deals.
   */
  hostAskedAt: number | null;
  /** A rebuy window still counting down, which decides on its own clock. */
  rebuyWaiting: boolean;
  now: number;
  timeoutMs?: number;
};

export type NextHandDeal = {
  deal: boolean;
  reason: 'everyone' | 'deadline' | null;
  /** The humans the host is still waiting on, excluding the host. */
  waitingOn: HandReadyWaitingPlayer[];
  /** Whole seconds until the host deals anyway, or null if no clock is running. */
  secondsLeft: number | null;
};

/**
 * Whether the host should deal the next hand now.
 *
 * Pure so that the deadlock that shipped can be pinned by a test: whatever
 * the readiness flags say, a host that has asked always deals within
 * `timeoutMs`, unless a rebuy window is still deciding the table.
 */
export function decideNextHandDeal(input: NextHandDealInput): NextHandDeal {
  const timeoutMs = input.timeoutMs ?? NEXT_HAND_CONSENT_MS;
  const waitingOn = input.readiness.waitingPlayers.filter((p) => p.id !== input.hostId);
  const idle: NextHandDeal = { deal: false, reason: null, waitingOn, secondsLeft: null };

  // The rebuy window owns the table until it closes. Dealing over it is the
  // "Table over while the rebuy clock is still running" contradiction.
  if (input.rebuyWaiting) return idle;
  // Nobody deals before the host has finished with the hand itself: the host
  // is a player too, and its own countdown is what asks on its behalf.
  if (input.hostAskedAt === null) return idle;

  if (waitingOn.length === 0 && input.readiness.activePlayerIds.length >= 2) {
    return { deal: true, reason: 'everyone', waitingOn, secondsLeft: null };
  }

  const leftMs = input.hostAskedAt + timeoutMs - input.now;
  if (leftMs <= 0) return { deal: true, reason: 'deadline', waitingOn, secondsLeft: 0 };
  return { deal: false, reason: null, waitingOn, secondsLeft: Math.ceil(leftMs / 1000) };
}

/**
 * Whether two `disconnectedSince` maps say the same thing.
 *
 * The readiness evaluation hands back when each absent player was first seen
 * gone, and the screen has to carry that into the next evaluation for the
 * grace window to ever run out. Passing nothing, as build 46 did, restarted
 * the window on every render, so a player who had really left was waited on
 * forever. Compared by value so carrying it does not loop renders.
 */
export function sameDisconnectedSince(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => b[key] === a[key]);
}

/**
 * What the Next Hand button says once this player has asked.
 *
 * An empty list used to print "Waiting for 0 players", which is the moment
 * between the last answer and the host's deal landing. The countdown is the
 * host's own deadline, so the table can see the wait is bounded.
 */
export function nextHandWaitLabel(input: {
  waitingOn: readonly HandReadyWaitingPlayer[];
  secondsLeft?: number | null;
}): string {
  const clock = typeof input.secondsLeft === 'number' && input.secondsLeft > 0 ? ` ${input.secondsLeft}s` : '';
  if (input.waitingOn.length === 0) return 'Dealing…';
  if (input.waitingOn.length === 1) return `Waiting for ${input.waitingOn[0]!.name}…${clock}`;
  return `Waiting for ${input.waitingOn.length} players…${clock}`;
}
