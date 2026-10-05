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
