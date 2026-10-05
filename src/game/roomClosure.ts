import { DISCONNECT_GRACE_MS, readConnection } from './connectionGrace';

export const HOST_LEFT_REASON = 'Host left the table.';
export const HOST_DISCONNECTED_REASON = 'Table closed because the host disconnected.';

export type RoomClosureSource = 'ended' | 'hostDisconnected';

export type RoomClosureNotice = {
  closed: true;
  source: RoomClosureSource;
  reason: string;
  endedAt?: number;
  hostDisconnectedSince?: number;
};

export type RoomClosureOpen = {
  closed: false;
  hostDisconnectedSince?: number;
  checkAgainAt?: number;
};

export type RoomClosure = RoomClosureNotice | RoomClosureOpen;

export type RoomClosurePlayer = {
  id?: string | null;
  connected?: unknown;
  isHost?: boolean | null;
};

export type RoomClosurePlayerMap =
  | Record<string, RoomClosurePlayer | null | undefined>
  | readonly (RoomClosurePlayer | null | undefined)[];

export type RoomClosureInput = {
  status?: string | null;
  endedReason?: string | null;
  endedAt?: number | null;
  hostId?: string | null;
  players?: RoomClosurePlayerMap | null;
  hostAwayAt?: number | null;
  hostDisconnectedSince?: number;
  now?: number;
  graceMs?: number;
};

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const hostPlayerFrom = (
  players: RoomClosurePlayerMap | null | undefined,
  hostId: string | null | undefined,
): RoomClosurePlayer | undefined => {
  if (!players) return undefined;

  if (!Array.isArray(players)) {
    const byId = players as Record<string, RoomClosurePlayer | null | undefined>;
    if (hostId && byId[hostId]) return byId[hostId] ?? undefined;
    return Object.entries(byId).find(([id, player]) => player?.isHost === true || id === hostId)?.[1] ?? undefined;
  }

  return players.find((player) => !!player && (player.isHost === true || player.id === hostId)) ?? undefined;
};

const endedReasonFrom = (reason: string | null | undefined): string => {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  return trimmed || HOST_LEFT_REASON;
};

export function evaluateRoomClosure(input: RoomClosureInput): RoomClosure {
  if (input.status === 'ended') {
    return {
      closed: true,
      source: 'ended',
      reason: endedReasonFrom(input.endedReason),
      ...(finiteNumber(input.endedAt) ? { endedAt: input.endedAt } : {}),
    };
  }

  if (input.status !== 'playing') {
    return { closed: false };
  }

  const host = hostPlayerFrom(input.players, input.hostId);
  const graceMs = input.graceMs ?? DISCONNECT_GRACE_MS;
  const now = input.now ?? Date.now();
  const hostAwayAt = finiteNumber(input.hostAwayAt) ? input.hostAwayAt : undefined;
  const rawConnected = host?.connected;
  const raw = typeof rawConnected === 'boolean'
    ? rawConnected
    : typeof hostAwayAt === 'number'
      ? false
      : undefined;
  const since = typeof hostAwayAt === 'number' ? hostAwayAt : input.hostDisconnectedSince;
  const connection = readConnection({ raw, since, now, graceMs });

  if (connection.connected === false) {
    return {
      closed: true,
      source: 'hostDisconnected',
      reason: HOST_DISCONNECTED_REASON,
      ...(typeof connection.since === 'number' ? { hostDisconnectedSince: connection.since } : {}),
    };
  }

  if (typeof connection.since === 'number') {
    return {
      closed: false,
      hostDisconnectedSince: connection.since,
      checkAgainAt: connection.since + graceMs,
    };
  }

  return { closed: false };
}
