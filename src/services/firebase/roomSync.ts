import {
  get,
  onDisconnect,
  onValue,
  push,
  ref,
  serverTimestamp,
  set,
  update,
  type Database,
} from 'firebase/database';

import { getDb, isFirebaseConfigured } from './config';
import { ensureSignedIn } from './auth';
import { sendPush } from './push';
import type { RoomAction, RoomPlayer, RoomPrivateView, RoomRebuyRequest, RoomRunVote, RoomState, RoomStatus, RoomSummary, RoomVisibility } from './types';
import { captureError } from '../telemetry';
import { DEFAULT_GAME_SETTINGS, normalizeSettings, type GameSettings } from '../../game/settings';
import { blindsForMode, isTournamentMode } from '../../game/gameMode';
import {
  hasExposedHoleCard,
  normalizeHoleCardExposure,
  type HoleCardIndex,
} from '../../game/holeCardExposure';
import { isEndedRoomReclaimable, planHostedRoomOpen } from '../../game/lobbyRoom';
import { readConnection } from '../../game/connectionGrace';
import {
  applyConnectionStatusToGameState,
  redactGameState,
  type ExposedHoleCardsByPlayer,
  type PublicGameState,
} from '../../game/onlineSync';
import { maskedPublicName } from '../../moderation/contentFilter';
import { createGame, startHand, type GameConfig, type GameState, type PlayerInput } from '../../engine';

/**
 * When each player was first seen unreachable, keyed by room and player.
 *
 * Module level because the grace window has to survive the individual roster
 * snapshots it is measured across; a value recomputed on every snapshot would
 * restart the countdown every time and never close.
 */
const disconnectedSince = new Map<string, number>();

type Result = { ok: boolean; reason?: string };
type StartRoomGameResult = Result & { state?: GameState; publicState?: PublicGameState };
type PushActionResult = Result & { action?: RoomAction };
type RebuyRequestResult = Result & { request?: RoomRebuyRequest };
type RunVoteResult = Result & { vote?: RoomRunVote };

const NOT_CONFIGURED_REASON =
  'Firebase is not configured. Set EXPO_PUBLIC_FIREBASE_* variables to enable online play.';
const INVALID_KEY_RE = /[.#$\/\[\]]/;
const MAX_ACTION_SEQ = Number.MAX_SAFE_INTEGER - 1;
const ACTION_PUSH_RETRIES = 3;

const noop = (): void => {};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unexpected Firebase error';

const reportFirebaseError = (operation: string, error: unknown): void => {
  captureError(error, { tags: { area: 'firebase-room-sync', operation } });
};

const cleanKey = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed && !INVALID_KEY_RE.test(trimmed) ? trimmed : null;
};

const roomPath = (code: string): string => `localpoker/rooms/${code}`;
const playersPath = (code: string): string => `${roomPath(code)}/players`;
const playerPath = (code: string, playerId: string): string => `${playersPath(code)}/${playerId}`;
const playerConnectedPath = (code: string, playerId: string): string =>
  `${playerPath(code, playerId)}/connected`;
const actionsPath = (code: string): string => `${roomPath(code)}/actions`;
const actionSeqPath = (code: string): string => `${roomPath(code)}/actionSeq`;
const rebuysPath = (code: string): string => `${roomPath(code)}/rebuys`;
const rebuyPath = (code: string, playerId: string): string => `${rebuysPath(code)}/${playerId}`;
const runVotePath = (code: string, playerId: string): string => `${roomPath(code)}/runVotes/${playerId}`;
const viewPath = (code: string, playerId: string): string => `localpoker/views/${code}/${playerId}`;
const emotePath = (code: string, playerId: string): string => `${roomPath(code)}/emotes/${playerId}`;
const shownPath = (code: string, playerId: string): string => `${roomPath(code)}/shown/${playerId}`;
const exposedPath = (code: string, playerId: string, index: HoleCardIndex): string =>
  `${roomPath(code)}/exposed/${playerId}/${index}`;
const userRoomPath = (playerId: string, code: string): string => `localpoker/userRooms/${playerId}/${code}`;
/**
 * Where a room advertises itself.
 *
 * `localpoker/rooms/$code` is readable only by the host and the players already
 * in it, so a browse list cannot be built from it without opening every private
 * game to the world. These two nodes carry a summary instead: `publicRooms` is
 * the open lobby anyone may read, and `roomInvites/$friendUid` is a per-friend
 * inbox used only after the host deliberately taps Invite.
 */
const publicRoomPath = (code: string): string => `localpoker/publicRooms/${code}`;
const roomInvitePath = (friendUid: string, code: string): string =>
  `localpoker/roomInvites/${friendUid}/${code}`;

const unavailableResult = (): Result => ({ ok: false, reason: NOT_CONFIGURED_REASON });

const getConfiguredDb = (): Database | null => {
  if (!isFirebaseConfigured()) {
    return null;
  }

  return getDb();
};

const toDbPlayer = (player: RoomPlayer, overrides: Partial<RoomPlayer> = {}): RoomPlayer => {
  const merged = { ...player, ...overrides };

  return {
    id: merged.id,
    name: maskedPublicName(merged.name.trim().replace(/\s+/g, ' ').slice(0, 24) || 'Player'),
    ...(merged.palSeed ? { palSeed: merged.palSeed } : {}),
    ...(merged.palJson ? { palJson: merged.palJson.slice(0, 600) } : {}),
    seatIndex: merged.seatIndex,
    chips: merged.chips,
    connected: merged.connected,
    isHost: merged.isHost,
  };
};


const toDbAction = (action: RoomAction, seq: number): RoomAction => ({
  seq,
  playerId: action.playerId,
  type: action.type,
  ...(typeof action.amount === 'number' ? { amount: action.amount } : {}),
  ts: Number.isFinite(action.ts) && action.ts > 0 ? action.ts : (serverTimestamp() as unknown as number),
});

const toDbRebuyRequest = (playerId: string): RoomRebuyRequest => ({
  playerId,
  ts: Date.now(),
});

const toDbRunVote = (choice: 1 | 2 | 3 | 4): RoomRunVote => ({
  choice,
  ts: Date.now(),
});

const exposedFromRoom = (room: Pick<RoomState, 'exposed'>): ExposedHoleCardsByPlayer => {
  const exposed: ExposedHoleCardsByPlayer = {};
  for (const [playerId, value] of Object.entries(room.exposed ?? {})) {
    const exposure = normalizeHoleCardExposure(value);
    if (hasExposedHoleCard(exposure)) {
      exposed[playerId] = exposure;
    }
  }
  return exposed;
};

const nextActionSeq = (roomSeq: unknown): Result & { seq?: number } => {
  const current = roomSeq === null || typeof roomSeq === 'undefined' ? 0 : roomSeq;
  if (typeof current !== 'number' || !Number.isSafeInteger(current) || current < 0 || current >= MAX_ACTION_SEQ) {
    return {
      ok: false,
      reason: 'Room action sequence is invalid. Leave and recreate the room.',
    };
  }

  /*
   * The next seat in the sequence, and nothing cleverer.
   *
   * This used to be Math.max(requestedSeq, current + 1), and the caller passes
   * Date.now() as the requested value, so the very first action of every hand
   * asked to jump the counter from 0 to about 1.7e12. The rule on actionSeq
   * allows an increase of at most 100, to stop anyone exhausting the sequence,
   * so every action was refused with PERMISSION_DENIED and the retry button
   * re-sent the identical doomed write forever.
   *
   * Ordering by time is already carried by `ts`. The sequence only has to be
   * monotonic, so it counts. Two players acting at once both compute the same
   * number and one write loses the race, which is what the retry loop in
   * pushAction is for: it re-reads the counter and takes the next seat.
   */
  const seq = current + 1;
  if (!Number.isSafeInteger(seq) || seq > MAX_ACTION_SEQ) {
    return {
      ok: false,
      reason: 'Room action sequence is exhausted. Leave and recreate the room.',
    };
  }

  return { ok: true, seq };
};

const hostGameCache = new Map<string, GameState>();

export const getCachedHostGame = (code: string): GameState | null => {
  const roomCode = cleanKey(code);
  return roomCode ? hostGameCache.get(roomCode) ?? null : null;
};

const setCachedHostGame = (code: string, state: GameState): void => {
  const roomCode = cleanKey(code);
  if (roomCode) {
    hostGameCache.set(roomCode, state);
  }
};

const isRoomAction = (value: unknown): value is RoomAction => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const action = value as Partial<RoomAction>;
  const seq = action.seq;
  return (
    typeof seq === 'number' &&
    Number.isSafeInteger(seq) &&
    seq > 0 &&
    typeof action.playerId === 'string' &&
    typeof action.type === 'string' &&
    typeof action.ts === 'number'
  );
};

const isRoomRebuyRequest = (playerId: string, value: unknown): value is RoomRebuyRequest => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const request = value as Partial<RoomRebuyRequest>;
  return (
    request.playerId === playerId &&
    typeof request.ts === 'number' &&
    Number.isFinite(request.ts) &&
    request.ts > 0
  );
};

const isReclaimableEndedRoom = (room: Partial<RoomState> | null): boolean =>
  isEndedRoomReclaimable(room);

const registerDisconnect = async (
  db: Database,
  code: string,
  playerId: string,
  endRoomOnDisconnect = false,
): Promise<void> => {
  try {
    await onDisconnect(ref(db, playerConnectedPath(code, playerId))).set(false);
    if (endRoomOnDisconnect) {
      /*
       * A host dropping off used to end the table there and then, so locking
       * the phone, taking a call, or walking through a tunnel killed everyone
       * else's game. Losing a connection is not the same as leaving.
       *
       * The room is marked as awaiting the host instead. It stays playable,
       * the host can walk back into it, and only once nobody has been near it
       * for ABANDONED_AFTER_MS does it become fair game for deletion. Leaving
       * on purpose still ends it immediately, because that is a decision
       * rather than an accident.
       */
      await onDisconnect(ref(db, roomPath(code))).update({
        hostAwayAt: serverTimestamp() as unknown as number,
      });
      // Registering means the host is here now, so clear any marker left by a
      // previous drop; otherwise a host who reconnected still looked absent
      // and the table stayed one sweep away from deletion.
      await set(ref(db, `${roomPath(code)}/hostAwayAt`), null);
    }
  } catch (error) {
    reportFirebaseError('register-disconnect', error);
    console.warn('Unable to register Firebase disconnect handler.', error);
  }
};

/** Creates a private room with the host seated and connected. */
/** Build the public summary of a room from what the room already knows. */
const roomSummaryOf = (
  room: Pick<RoomState, 'code' | 'status'>,
  settingsJson: string,
  hostUid: string,
  hostName: string,
  visibility: RoomVisibility,
): RoomSummary => {
  const settings = settingsFromJson(settingsJson);
  return {
    code: room.code,
    hostUid,
    // Published to strangers in the open lobby, so it gets the same treatment
    // as any other public name rather than being trusted because it is ours.
    hostName: maskedPublicName(hostName).slice(0, 24) || 'Host',
    visibility,
    status: room.status,
    playerCount: 1,
    smallBlind: settings.smallBlind,
    bigBlind: settings.bigBlind,
    startingStack: settings.startingStack,
    gameMode: settings.gameMode,
    updatedAt: Date.now(),
  };
};

const settingsFromJson = (settingsJson: string): GameSettings => {
  try {
    return normalizeSettings(JSON.parse(settingsJson) as Partial<GameSettings>);
  } catch {
    return DEFAULT_GAME_SETTINGS;
  }
};

/**
 * Rooms this player can see without being handed a code.
 *
 * Friends' tables come back first and flagged, because a game with someone you
 * know is the one you actually want; the open lobby is the fallback. Ended and
 * in-progress rooms are dropped: a list you cannot join is worse than a short
 * one.
 */
export const subscribeOpenRooms = (
  onRooms: (rooms: { friends: RoomSummary[]; public: RoomSummary[] }) => void,
): (() => void) => {
  const db = getConfiguredDb();
  if (!db) {
    onRooms({ friends: [], public: [] });
    return () => {};
  }

  let friendRooms: RoomSummary[] = [];
  let publicRooms: RoomSummary[] = [];
  // A host ending a room clears its public advert, but a per-friend invite can
  // outlive the table (the host no longer knows who it was sent to). Age is the
  // backstop: a lobby nobody entered in hours is not worth offering.
  const FRESH_MS = 6 * 60 * 60 * 1000;
  const joinable = (room: RoomSummary | null): boolean =>
    !!room
    && room.status === 'lobby'
    && typeof room.code === 'string'
    && Date.now() - (room.updatedAt ?? 0) < FRESH_MS;
  const byNewest = (a: RoomSummary, b: RoomSummary) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

  const emit = () => {
    const friendCodes = new Set(friendRooms.map((room) => room.code));
    onRooms({
      friends: [...friendRooms].sort(byNewest),
      // A friend's public table belongs in the friends list, not in both.
      public: publicRooms.filter((room) => !friendCodes.has(room.code)).sort(byNewest),
    });
  };

  const read = (snapshot: { val: () => unknown }): RoomSummary[] =>
    Object.values((snapshot.val() as Record<string, RoomSummary>) ?? {}).filter(joinable);

  const unsubPublic = onValue(ref(db, 'localpoker/publicRooms'), (snapshot) => {
    publicRooms = read(snapshot);
    emit();
  }, () => { publicRooms = []; emit(); });

  let unsubInvites: (() => void) | null = null;
  void authedPlayerId().then((uid) => {
    if (!uid) return;
    unsubInvites = onValue(ref(db, `localpoker/roomInvites/${uid}`), (snapshot) => {
      friendRooms = read(snapshot);
      emit();
    }, () => { friendRooms = []; emit(); });
  });

  return () => {
    unsubPublic();
    if (unsubInvites) unsubInvites();
  };
};

/**
 * True when `code` already belongs to a room that cannot be taken over.
 *
 * Room codes are short enough that two hosts can land on the same one, so the
 * create screen checks a candidate before showing it rather than letting the
 * host discover the clash after they have already read the code out.
 *
 * A room that ended long enough ago is reclaimable, so it counts as free here
 * for the same reason `createRoom` lets it be overwritten.
 */
export const isRoomCodeTaken = async (code: string): Promise<boolean> => {
  const db = getConfiguredDb();
  if (!db) return false;

  const roomCode = cleanKey(code);
  if (!roomCode) return false;

  const snapshot = await get(ref(db, roomPath(roomCode)));
  if (!snapshot.exists()) return false;
  return !isReclaimableEndedRoom(snapshot.val() as Partial<RoomState> | null);
};

/**
 * Publish the entries that let other people find a room.
 *
 * Deliberately separate from the room write and deliberately allowed to fail:
 * these are hints. A room missing them is harder to find, not broken, so a
 * refused listing must never read to the host as a refused table.
 */
const publishDiscovery = async (
  db: Database,
  roomCode: string,
  hostId: string,
  hostName: string,
  options: { visibility?: RoomVisibility },
  status: string,
  settingsJson: string,
): Promise<void> => {
  const visibility: RoomVisibility = options.visibility === 'public' ? 'public' : 'private';
  const summary = roomSummaryOf(
    { code: roomCode, hostId, status } as RoomState,
    settingsJson, hostId, hostName, visibility,
  );
  const discovery: Record<string, unknown> = {};
  if (visibility === 'public') discovery[publicRoomPath(roomCode)] = summary;
  if (Object.keys(discovery).length === 0) return;
  try {
    await update(ref(db), discovery);

    /*
     * Deliberately no onDisconnect teardown of these entries.
     *
     * Removing them when the host's connection dropped seemed like the tidy
     * way to clean up after a client that had gone for good. It is not: iOS
     * closes the socket within seconds of the app being backgrounded, so the
     * host switching apps to send someone the code deleted the public listing,
     * and the friend opened the app to find nothing there.
     *
     * A dropped connection is not an intent to withdraw anything, which is
     * the same reason it no longer ends the room. Listings are withdrawn
     * explicitly when the table starts or ends, and an abandoned room is swept
     * after ten minutes.
     */

  } catch (error) {
    reportFirebaseError('create-room-discovery', error);
    console.warn('Room created but could not publish discovery.', error);
  }
};

const sendRoomInvitePushIfAway = async (
  db: Database,
  friendUid: string,
  hostId: string,
  hostName: string,
  roomCode: string,
): Promise<void> => {
  if (!friendUid || friendUid === hostId) return;
  let away = true;
  try {
    const snap = await get(ref(db, `localpoker/presence/${friendUid}/online`));
    away = snap.val() !== true;
  } catch {
    // Unreadable presence is not a reason to stay silent about an explicit invite.
  }
  if (away) void sendPush(friendUid, 'room-invite', hostName, roomCode);
};

const refreshRoomInviteSummaries = async (
  db: Database,
  roomCode: string,
  hostId: string,
  hostName: string,
  visibility: RoomVisibility,
  status: RoomStatus,
  settingsJson: string,
  friendUids: readonly string[],
): Promise<void> => {
  const summary = roomSummaryOf({ code: roomCode, status }, settingsJson, hostId, hostName, visibility);
  const updates: Record<string, unknown> = {};
  for (const rawUid of friendUids) {
    const uid = cleanKey(rawUid);
    if (uid && uid !== hostId) updates[roomInvitePath(uid, roomCode)] = summary;
  }
  if (Object.keys(updates).length === 0) return;
  try {
    await update(ref(db), updates);
  } catch (error) {
    /*
     * Existing invites are hints. A failed refresh must not turn a settings
     * edit into a dead lobby, because the room itself already has the truth.
     */
    reportFirebaseError('refresh-room-invite-summaries', error);
  }
};

export const inviteFriendToRoom = async (
  code: string,
  friendUid: string,
): Promise<Result> => {
  const db = getConfiguredDb();
  if (!db) {
    return unavailableResult();
  }

  const roomCode = cleanKey(code);
  const invitee = cleanKey(friendUid);
  if (!roomCode || !invitee) {
    return { ok: false, reason: 'Invite target must be valid.' };
  }

  const hostId = await authedPlayerId();
  if (!hostId) {
    return notSignedInResult();
  }
  if (invitee === hostId) {
    return { ok: false, reason: "You're already at this table." };
  }

  try {
    const snapshot = await get(ref(db, roomPath(roomCode)));
    if (!snapshot.exists()) {
      return { ok: false, reason: 'Room does not exist.' };
    }

    const room = snapshot.val() as Partial<RoomState> | null;
    if (room?.hostId !== hostId) {
      return { ok: false, reason: 'Only the host can invite friends.' };
    }
    if (room.status !== 'lobby') {
      return { ok: false, reason: 'Invite before the first hand starts.' };
    }

    const settingsJson = typeof room.settingsJson === 'string' ? room.settingsJson : '{}';
    const visibility: RoomVisibility = room.visibility === 'public' ? 'public' : 'private';
    const hostName = room.hostName || 'Host';
    const summary = roomSummaryOf(
      { code: roomCode, status: 'lobby' },
      settingsJson,
      hostId,
      hostName,
      visibility,
    );

    await update(ref(db), {
      [roomInvitePath(invitee, roomCode)]: summary,
      [`${roomPath(roomCode)}/invited/${invitee}`]: true,
    });
    void sendRoomInvitePushIfAway(db, invitee, hostId, hostName, roomCode);
    return { ok: true };
  } catch (error) {
    reportFirebaseError('invite-room-friend', error);
    console.warn('Unable to invite friend to Firebase room.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

/**
 * How many tables one person may have open at once.
 *
 * Without a cap a host accumulates rooms every time they set one up and walk
 * away, and public rooms keep advertising themselves until they are swept.
 * The Join Room list should not fill with tables belonging to one person who
 * is not at any of them.
 */
export const MAX_ROOMS_PER_HOST = 3;

/**
 * The codes this player still hosts, oldest first.
 *
 * Counted from `userRooms`, which is the player's own index and readable only
 * by them, rather than by scanning every room in the database.
 */
export const hostedRoomCodes = async (db: Database, hostId: string): Promise<string[]> => {
  try {
    const snapshot = await get(ref(db, `localpoker/userRooms/${hostId}`));
    const entries = Object.values((snapshot.val() as Record<string, { code?: string; role?: string; updatedAt?: number }> | null) ?? {});
    return entries
      .filter((e) => e?.role === 'host' && typeof e.code === 'string')
      .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))
      .map((e) => e.code as string);
  } catch (error) {
    reportFirebaseError('count-hosted-rooms', error);
    return [];
  }
};

/** Everyone this room advertised itself to, so the advert can be withdrawn. */
const invitedUidsOf = (room: Partial<RoomState> | null): string[] =>
  Object.keys((room as { invited?: Record<string, unknown> } | null)?.invited ?? {});

/** Paths that advertise a room, which stop being true the moment it starts. */
const discoveryTeardown = (room: Partial<RoomState> | null, roomCode: string): Record<string, null> => {
  const updates: Record<string, null> = { [publicRoomPath(roomCode)]: null };
  for (const uid of invitedUidsOf(room)) updates[roomInvitePath(uid, roomCode)] = null;
  return updates;
};

export const createRoom = async (
  code: string,
  host: RoomPlayer,
  settingsJson: string,
  options: { visibility?: RoomVisibility; friendUids?: readonly string[] } = {},
): Promise<Result> => {
  const db = getConfiguredDb();
  if (!db) {
    return unavailableResult();
  }

  const roomCode = cleanKey(code);
  if (!roomCode) {
    return { ok: false, reason: 'Room code must be a valid Firebase key.' };
  }
  const hostId = await authedPlayerId();
  if (!hostId) {
    return notSignedInResult();
  }

  const visibility: RoomVisibility = options.visibility === 'public' ? 'public' : 'private';
  const hostPlayer = toDbPlayer(host, { id: hostId, connected: true, isHost: true });
  /*
   * Older callers passed the whole friends list here so creation could fan out
   * invite records. Creation is not consent to notify everyone, so friendUids
   * is tolerated for compatibility but deliberate invites use inviteFriendToRoom.
   */

  try {
    const roomRef = ref(db, roomPath(roomCode));
    const existing = await get(roomRef);
    if (existing.exists()) {
      const existingRoom = existing.val() as Partial<RoomState> | null;
      const plan = planHostedRoomOpen(existingRoom, hostId);
      if (plan.type === 'attach') {
        const existingInvitedUids = invitedUidsOf(existingRoom);
        const staleInviteUids = plan.reopenEnded ? existingInvitedUids : [];
        /*
         * A settings edit returns through the host path for the same table.
         * Refresh it in place, including the host's seat and discovery hints,
         * instead of treating the existing code as someone else's collision.
         */
        const updates: Record<string, unknown> = {
          [publicRoomPath(roomCode)]: null,
          [`${roomPath(roomCode)}/settingsJson`]: settingsJson,
          [`${roomPath(roomCode)}/tournamentStartedAt`]: null,
          [`${roomPath(roomCode)}/visibility`]: visibility,
          [`${roomPath(roomCode)}/hostName`]: host.name,
          [userRoomPath(hostId, roomCode)]: { code: roomCode, role: 'host', updatedAt: Date.now() },
        };
        if (plan.reopenEnded) {
          updates[`${roomPath(roomCode)}/status`] = 'lobby';
          updates[`${roomPath(roomCode)}/endedReason`] = null;
          updates[`${roomPath(roomCode)}/endedAt`] = null;
          updates[`${roomPath(roomCode)}/actions`] = null;
          updates[`${roomPath(roomCode)}/publicState`] = null;
          updates[`${roomPath(roomCode)}/shown`] = null;
          updates[`${roomPath(roomCode)}/exposed`] = null;
          updates[`${roomPath(roomCode)}/runVotes`] = null;
          updates[`${roomPath(roomCode)}/invited`] = null;
          updates[playersPath(roomCode)] = { [hostId]: hostPlayer };
        } else {
          updates[playerPath(roomCode, hostId)] = hostPlayer;
        }
        await update(ref(db), updates);
        for (const uid of staleInviteUids) {
          try {
            await set(ref(db, roomInvitePath(uid, roomCode)), null);
          } catch (error) {
            /*
             * Invitees can delete their own hints, so a missing stale hint must
             * not block the host from returning to the lobby they still own.
             */
            reportFirebaseError('refresh-room-discovery-teardown', error);
          }
        }
        await publishDiscovery(db, roomCode, hostId, host.name, options, 'lobby', settingsJson);
        if (!plan.reopenEnded) {
          await refreshRoomInviteSummaries(
            db,
            roomCode,
            hostId,
            host.name,
            visibility,
            'lobby',
            settingsJson,
            existingInvitedUids,
          );
        }
        await registerDisconnect(db, roomCode, hostId, true);
        return { ok: true };
      }
      if (plan.type === 'reject') {
        return { ok: false, reason: plan.reason };
      }
    }

    /*
     * Tidy up first, then refuse only if they genuinely have three live ones.
     *
     * A host who set up tables and wandered off would otherwise hit the cap
     * against rooms that no longer exist, so the stale entries are cleared
     * before the count is taken rather than counting ghosts against them.
     */
    const hosted = await hostedRoomCodes(db, hostId);
    const others = hosted.filter((c) => c !== roomCode);
    if (others.length >= MAX_ROOMS_PER_HOST) {
      const live: string[] = [];
      for (const other of others) {
        const snap = await get(ref(db, roomPath(other)));
        const room = snap.val() as Partial<RoomState> | null;
        if (!snap.exists() || room?.status === 'ended' || isAbandonedRoom(room)) {
          await set(ref(db, userRoomPath(hostId, other)), null);
          continue;
        }
        live.push(other);
      }
      if (live.length >= MAX_ROOMS_PER_HOST) {
        return {
          ok: false,
          reason: `You already have ${MAX_ROOMS_PER_HOST} tables open. Close one before starting another.`,
        };
      }
    }

    const room: RoomState = {
      code: roomCode,
      hostId,
      status: 'lobby',
      createdAt: serverTimestamp() as unknown as number,
      settingsJson,
      tournamentStartedAt: null,
      visibility,
      hostName: host.name,
      players: {
        [hostId]: hostPlayer,
      },
      actionSeq: 0,
    };

    // The room has to land before its discovery entries, and this cannot be one
    // atomic write.
    //
    // The rule on `publicRooms/$code` checks
    // `root.../rooms/$code/hostId === auth.uid` to prove the writer hosts the
    // room. `root` is the database *before* the write, so during creation that
    // lookup sees nothing and the check fails. Because a multi-path update is
    // atomic, that rejected the entire write: no room, no listing, just
    // PERMISSION_DENIED. It only bit when the write actually included the
    // public path, which is to say whenever the host ticked Public.
    //
    // Rules cannot see a sibling path's `newData`, so the cross-reference
    // cannot simply be rewritten to look at the pending room. Writing in two
    // steps lets the existing strict rule stand. Losing atomicity is benign:
    // discovery entries are hints, and a room without them is merely harder to
    // find, not broken.
    await update(ref(db), {
      [roomPath(roomCode)]: room,
      [userRoomPath(hostId, roomCode)]: { code: roomCode, role: 'host', updatedAt: Date.now() },
    });

    await publishDiscovery(db, roomCode, hostId, host.name, options, 'lobby', settingsJson);

    await registerDisconnect(db, roomCode, hostId, true);
    return { ok: true };
  } catch (error) {
    reportFirebaseError('create-room', error);
    console.warn('Unable to create Firebase room.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

/**
 * The identity the database rules judge every write by.
 *
 * `database.rules.json` scopes all room writes to `auth.uid`: the room's
 * `hostId`, the `players/$uid` path and each action's `playerId` must equal it.
 * The lobby previously passed the locally-generated `profile.id`, so publishing
 * the rules would have rejected *every* online write, create, join and act
 * alike. Identity is therefore resolved here rather than trusted from the
 * caller, so no call site can get it wrong.
 *
 * Returns null when Firebase is configured but the player could not be signed
 * in; callers surface that instead of writing something the rules will refuse.
 */
const authedPlayerId = async (): Promise<string | null> => {
  const uid = await ensureSignedIn();
  return uid ? cleanKey(uid) : null;
};

/** Shared failure when anonymous sign-in hasn't completed. */
const notSignedInResult = (): Result => ({
  ok: false,
  reason: 'Could not sign in to play online. Check your connection and try again.',
});

const presenceReconcileInFlight = new Set<string>();

const reconcileHostPresence = async (roomCode: string, room: RoomState | null): Promise<void> => {
  if (!room || room.status !== 'playing' || presenceReconcileInFlight.has(roomCode)) {
    return;
  }

  presenceReconcileInFlight.add(roomCode);
  try {
    const hostId = await authedPlayerId();
    if (!hostId || room.hostId !== hostId) {
      return;
    }

    const cached = getCachedHostGame(roomCode);
    if (!cached) {
      return;
    }

    /*
     * `=== true` used to live here, which turned a missing flag into a
     * confident false and folded everybody the roster had not described yet.
     * readConnection keeps unknown as unknown, and makes a real disconnection
     * wait out a grace window so a phone blinking between cells does not cost
     * somebody the hand they were in the middle of.
     */
    const connectedByPlayerId = Object.fromEntries(
      cached.players.map((player) => {
        const key = `${roomCode}:${player.id}`;
        const reading = readConnection({
          raw: room.players?.[player.id]?.connected,
          since: disconnectedSince.get(key),
          now: Date.now(),
        });
        if (reading.since === undefined) disconnectedSince.delete(key);
        else disconnectedSince.set(key, reading.since);
        return [player.id, reading.connected];
      }),
    );
    const result = applyConnectionStatusToGameState(cached, connectedByPlayerId);
    if (!result.changed) {
      return;
    }

    setCachedHostGame(roomCode, result.state);
    await publishHostGameState(roomCode, result.state);
  } catch (error) {
    reportFirebaseError('reconcile-host-presence', error);
    console.warn('Unable to reconcile disconnected online players.', error);
  } finally {
    presenceReconcileInFlight.delete(roomCode);
  }
};

/** Adds or updates a player in an existing room and marks them connected. */
/**
 * Drop an invite that turned out to lead nowhere.
 *
 * The host withdraws its invites when the table starts or ends, but it cannot
 * do so if it crashed, lost the network, or was simply killed, and the entry
 * then sits in the invitee's list advertising a table that will refuse them.
 * Whoever discovers it is dead is in the best position to remove it, and the
 * rules already let someone delete their own invite.
 */
const forgetInvite = async (db: Database, roomCode: string, uid: string): Promise<void> => {
  try {
    await set(ref(db, roomInvitePath(uid, roomCode)), null);
  } catch (error) {
    reportFirebaseError('forget-stale-invite', error);
  }
};

/**
 * How long a table survives with nobody attending it.
 *
 * Long enough to cover a lock screen, a lift, or a phone call; short enough
 * that abandoned rooms do not pile up in everyone's Join Room list.
 */
export const ABANDONED_AFTER_MS = 10 * 60 * 1000;

/** True when nothing has attended this room for long enough to bin it. */
export const isAbandonedRoom = (room: Partial<RoomState> | null, now = Date.now()): boolean => {
  if (!room) return false;
  const away = (room as { hostAwayAt?: unknown }).hostAwayAt;
  const ended = (room as { endedAt?: unknown }).endedAt;
  const stamp = typeof away === 'number' ? away : typeof ended === 'number' ? ended : null;
  if (stamp === null) return false;
  return now - stamp > ABANDONED_AFTER_MS;
};

/** True when Firebase refused a read or write, rather than failing some other way. */
const isPermissionDenied = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code.toUpperCase().includes('PERMISSION_DENIED')) return true;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.toUpperCase().includes('PERMISSION_DENIED');
};

export const joinRoom = async (code: string, player: RoomPlayer): Promise<Result> => {
  const db = getConfiguredDb();
  if (!db) {
    return unavailableResult();
  }

  const roomCode = cleanKey(code);
  if (!roomCode) {
    return { ok: false, reason: 'Room code must be a valid Firebase key.' };
  }
  const playerId = await authedPlayerId();
  if (!playerId) {
    return notSignedInResult();
  }

  try {
    let roomSnapshot;
    try {
      roomSnapshot = await get(ref(db, roomPath(roomCode)));
    } catch (readError) {
      // A room is readable to outsiders only while it sits in the lobby, so a
      // refused read here means the room exists and has already dealt in. Say
      // that, rather than surfacing a raw permission error for what is really
      // an ordinary "you are too late".
      if (isPermissionDenied(readError)) {
        void forgetInvite(db, roomCode, playerId);
        return { ok: false, reason: 'That game has already started.' };
      }
      throw readError;
    }
    if (!roomSnapshot.exists()) {
      void forgetInvite(db, roomCode, playerId);
      return { ok: false, reason: 'Room does not exist.' };
    }

    const room = roomSnapshot.val() as Partial<RoomState> | null;
    if (room?.status === 'ended') {
      void forgetInvite(db, roomCode, playerId);
      return { ok: false, reason: 'Room has ended.' };
    }
    /*
     * Somebody who already has a seat is coming back, not joining.
     *
     * This used to refuse anyone the moment the first hand was dealt, which
     * also refused the players who were already at the table. Going to the
     * home screen keeps your seat, so the table is still holding one for you
     * and the only way back in was the resume card: typing the code said the
     * game had already started, about a game you were in.
     *
     * The rules have always allowed this. A seated player may rewrite their
     * own record on a room that has not ended, provided the seat, the stack
     * and the role do not change, which is why those are carried over from
     * what the table already holds rather than from this device.
     */
    const seated = room?.players?.[playerId];
    if (room?.status && room.status !== 'lobby' && !seated) {
      void forgetInvite(db, roomCode, playerId);
      return { ok: false, reason: 'That game has already started.' };
    }

    const playerValue = toDbPlayer(player, {
      id: playerId,
      connected: true,
      ...(seated ? { seatIndex: seated.seatIndex, chips: seated.chips, isHost: seated.isHost } : {}),
    });
    await update(ref(db), {
      [playerPath(roomCode, playerId)]: playerValue,
      [userRoomPath(playerId, roomCode)]: { code: roomCode, role: 'player', updatedAt: Date.now() },
    });
    await registerDisconnect(db, roomCode, playerId);
    return { ok: true };
  } catch (error) {
    reportFirebaseError('join-room', error);
    console.warn('Unable to join Firebase room.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

/**
 * The host clearing a seat somebody has stopped using.
 *
 * Used when a busted player lets their rebuy window run out. Their seat is
 * holding up everyone else, and with no Cloud Functions the host is the only
 * party that can act on the table's behalf. Deliberate, bounded and announced,
 * which is what separates it from a dropped socket: losing a connection still
 * costs nobody their seat.
 */
export const removePlayerFromRoom = async (code: string, playerId: string): Promise<void> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  const target = cleanKey(playerId);
  if (!db || !roomCode || !target) return;
  try {
    await update(ref(db), {
      [playerPath(roomCode, target)]: null,
      [viewPath(roomCode, target)]: null,
      [userRoomPath(target, roomCode)]: null,
      [`${roomPath(roomCode)}/shown/${target}`]: null,
      [`${roomPath(roomCode)}/exposed/${target}`]: null,
      [`${roomPath(roomCode)}/runVotes/${target}`]: null,
    });
  } catch (error) {
    reportFirebaseError('remove-player', error);
  }
};

/** Removes a player from a room; silently no-ops when Firebase is unavailable. */
export const leaveRoom = async (code: string, playerId: string): Promise<void> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  const cleanPlayerId = (await authedPlayerId()) ?? cleanKey(playerId);
  if (!db || !roomCode || !cleanPlayerId) {
    return;
  }

  try {
    await onDisconnect(ref(db, playerConnectedPath(roomCode, cleanPlayerId))).cancel();
    const roomSnapshot = await get(ref(db, roomPath(roomCode)));
    const room = roomSnapshot.exists() ? (roomSnapshot.val() as RoomState) : null;
    if (room?.hostId === cleanPlayerId) {
      const updates: Record<string, unknown> = {
        [`${roomPath(roomCode)}/status`]: 'ended',
        [`${roomPath(roomCode)}/endedReason`]: 'Host left the room.',
        [`${roomPath(roomCode)}/endedAt`]: Date.now(),
        [`${roomPath(roomCode)}/actions`]: null,
        [`${roomPath(roomCode)}/publicState`]: null,
        [`${roomPath(roomCode)}/shown`]: null,
        [`${roomPath(roomCode)}/exposed`]: null,
        [`${roomPath(roomCode)}/runVotes`]: null,
        /*
         * Withdraw the adverts, not just the room.
         *
         * Ending the room left its public listing and every outstanding
         * invite in place, so a table whose host had walked away still showed
         * up under Join Room and still sat in friends' invites. Tapping one
         * got as far as joinRoom before being refused, which reads as the app
         * being broken rather than the room being over. A room that has ended
         * should stop being offered.
         */
        ...discoveryTeardown(room, roomCode),
      };
      for (const id of Object.keys(room.players ?? {})) {
        updates[viewPath(roomCode, id)] = null;
        updates[userRoomPath(id, roomCode)] = null;
      }

      await update(ref(db), updates);
      hostGameCache.delete(roomCode);
      return;
    }

    await update(ref(db), {
      [playerPath(roomCode, cleanPlayerId)]: null,
      [viewPath(roomCode, cleanPlayerId)]: null,
      [userRoomPath(cleanPlayerId, roomCode)]: null,
      [`${roomPath(roomCode)}/exposed/${cleanPlayerId}`]: null,
      [`${roomPath(roomCode)}/runVotes/${cleanPlayerId}`]: null,
    });
  } catch (error) {
    reportFirebaseError('leave-room', error);
    console.warn('Unable to leave Firebase room.', error);
  }
};

/** Subscribes to room state changes; invokes cb(null) in offline/no-op mode. */
export const subscribeRoom = (
  code: string,
  cb: (room: RoomState | null) => void,
): (() => void) => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) {
    cb(null);
    return noop;
  }

  try {
    return onValue(
      ref(db, roomPath(roomCode)),
      (snapshot) => {
        const nextRoom = snapshot.exists() ? (snapshot.val() as RoomState) : null;
        cb(nextRoom);
        void reconcileHostPresence(roomCode, nextRoom);
      },
      (error) => {
        reportFirebaseError('room-subscription-callback', error);
        console.warn('Firebase room subscription failed.', error);
        cb(null);
      },
    );
  } catch (error) {
    reportFirebaseError('subscribe-room', error);
    console.warn('Unable to subscribe to Firebase room.', error);
    cb(null);
    return noop;
  }
};

const settingsFromRoom = (room: Partial<RoomState> | null): GameSettings => {
  if (!room?.settingsJson) {
    return DEFAULT_GAME_SETTINGS;
  }

  try {
    return normalizeSettings(JSON.parse(room.settingsJson) as Partial<GameSettings>);
  } catch {
    return DEFAULT_GAME_SETTINGS;
  }
};

const gameConfigFromSettings = (settings: GameSettings, playerCount: number): GameConfig => ({
  ...blindsForMode(settings.gameMode, settings),
  startingStack: settings.startingStack,
  maxPlayers: Math.max(playerCount, settings.maxPlayers),
  turnTimerSec: settings.turnTimerSec,
});

/*
 * Everyone seated, not only everyone whose socket happens to be up.
 *
 * Filtering on `connected` meant a player who had backgrounded the app for a
 * few seconds was simply not dealt in, which is a harsh reading of "away" now
 * that a dropped connection is explicitly tolerated for ten minutes. If they
 * really have gone, the turn timer folds them and the hand carries on.
 */
const sortedRoomPlayers = (room: Pick<RoomState, 'hostId' | 'players'>): RoomPlayer[] =>
  Object.values(room.players ?? {})
    .sort((a, b) => {
      if (a.id === room.hostId) return -1;
      if (b.id === room.hostId) return 1;
      return a.seatIndex - b.seatIndex || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });

const playerMetaFromRoom = (room: Pick<RoomState, 'players'>) =>
  Object.fromEntries(
    Object.values(room.players ?? {}).map((player) => [
      player.id,
      {
        connected: player.connected,
        isHost: player.isHost,
        palSeed: player.palSeed,
      },
    ]),
  );

const buildHostGame = (room: RoomState, seed: string): GameState | null => {
  const seated = sortedRoomPlayers(room);
  if (seated.length < 2) {
    return null;
  }

  const settings = settingsFromRoom(room);
  const players: PlayerInput[] = seated.map((player, seatIndex) => ({
    id: player.id,
    name: player.name,
    seatIndex,
    /*
     * Everyone buys in for the amount the table was set up with.
     *
     * This took `player.chips` when it had one, and the lobby writes a stack
     * onto every room player as it seats them, so that value always existed
     * and the host's chosen buy-in was never reached: a table set to 5,000
     * dealt everyone 2,000. The room's settings are the authority on what a
     * seat costs, and this is where a hand is dealt from, so it decides.
     */
    chips: settings.startingStack,
    isBot: false,
  }));

  return startHand(createGame(gameConfigFromSettings(settings, players.length), players, seed));
};

export const publishHostGameState = async (code: string, state: GameState): Promise<Result> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) {
    return unavailableResult();
  }

  const hostId = await authedPlayerId();
  if (!hostId) {
    return notSignedInResult();
  }

  try {
    const roomSnapshot = await get(ref(db, roomPath(roomCode)));
    if (!roomSnapshot.exists()) {
      return { ok: false, reason: 'Room does not exist.' };
    }

    const room = roomSnapshot.val() as RoomState;
    if (room.hostId !== hostId) {
      return { ok: false, reason: 'Only the host can publish game state.' };
    }
    if (room.status === 'ended') {
      return { ok: false, reason: 'Room has ended.' };
    }

    const isNewPublishedHand = room.publicState?.handNumber !== state.handNumber;
    const { publicState, privateViews } = redactGameState(state, {
      code: roomCode,
      playerMeta: playerMetaFromRoom(room),
      updatedAt: Date.now(),
      // Read from the room, so a player tabling their hand reaches everyone
      // rather than only changing their own screen.
      revealed: Object.entries((room as { shown?: Record<string, unknown> }).shown ?? {})
        .filter(([, v]) => v === true)
        .map(([id]) => id),
      exposed: isNewPublishedHand ? {} : exposedFromRoom(room),
    });
    /*
     * The table first, the hole cards second, as two writes.
     *
     * These used to go up together, so a single view the rules would not
     * accept failed the public state along with it and the table stopped
     * advancing for everyone. Whatever is wrong with one player's cards, the
     * hand itself should still move: the public state is the part everybody
     * depends on, and it is already redacted, so publishing it alone reveals
     * nothing.
     */
    const table: Record<string, unknown> = {
      [`${roomPath(roomCode)}/publicState`]: publicState,
      [`${roomPath(roomCode)}/status`]: 'playing',
    };
    // A new hand forgets what was tabled in the last one, or cards stay face
    // up across hands. Keyed on the hand number rather than on the street:
    // tying it to "not a showdown" wiped a hand tabled after a pot won on a
    // fold, which never reaches a showdown and is the one case the Show
    // button exists for.
    if (isNewPublishedHand) {
      table[`${roomPath(roomCode)}/shown`] = null;
      table[`${roomPath(roomCode)}/exposed`] = null;
      table[`${roomPath(roomCode)}/runVotes`] = null;
    }
    await update(ref(db), table);
    setCachedHostGame(roomCode, state);

    // Clear the view of anyone not holding cards this hand, rather than
    // leaving last hand's behind for them to look at.
    const views: Record<string, unknown> = {};
    for (const playerId of Object.keys(room.players ?? {})) {
      views[viewPath(roomCode, playerId)] = privateViews[playerId] ?? null;
    }
    try {
      await update(ref(db), views);
    } catch (error) {
      // The hand is published and playable; someone may be missing their own
      // cards. Worth reporting, not worth failing the publish over.
      reportFirebaseError('publish-private-views', error);
      console.warn('Published the table but could not publish every private view.', error);
    }
    return { ok: true };
  } catch (error) {
    reportFirebaseError('publish-host-game-state', error);
    console.warn('Unable to publish Firebase game state.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export const startRoomGame = async (code: string): Promise<StartRoomGameResult> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) {
    return unavailableResult();
  }

  const hostId = await authedPlayerId();
  if (!hostId) {
    return notSignedInResult();
  }

  try {
    const roomSnapshot = await get(ref(db, roomPath(roomCode)));
    if (!roomSnapshot.exists()) {
      return { ok: false, reason: 'Room does not exist.' };
    }

    const room = roomSnapshot.val() as RoomState;
    if (room.hostId !== hostId) {
      return { ok: false, reason: 'Only the host can start the game.' };
    }
    if (room.status === 'ended') {
      return { ok: false, reason: 'Room has ended.' };
    }

    const settings = settingsFromRoom(room);
    const tournamentStartedAt = isTournamentMode(settings.gameMode) ? Date.now() : null;
    const state = buildHostGame(room, `${roomCode}:${hostId}:${Date.now()}`);
    if (!state) {
      return { ok: false, reason: 'At least two connected players are required to start.' };
    }

    const { publicState, privateViews } = redactGameState(state, {
      code: roomCode,
      playerMeta: playerMetaFromRoom(room),
      updatedAt: Date.now(),
    });
    const updates: Record<string, unknown> = {
      [`${roomPath(roomCode)}/status`]: 'playing',
      // The browse list offers tables you can sit at, and this one has
      // started. Per-friend invites have to go too: clearing only the public
      // advert left a friend's invite pointing at a table that would refuse
      // them, which is what made Join Table look like it did nothing.
      ...discoveryTeardown(room, roomCode),
      [`${roomPath(roomCode)}/tournamentStartedAt`]: tournamentStartedAt,
      [`${roomPath(roomCode)}/publicState`]: publicState,
      [`${roomPath(roomCode)}/actions`]: null,
      [`${roomPath(roomCode)}/actionSeq`]: 0,
    };

    // Same rule as every other publish: a view only exists for someone who
    // was dealt in, because one carrying an empty hand is refused and would
    // take the whole multi-path write down with it.
    for (const playerId of Object.keys(room.players ?? {})) {
      updates[viewPath(roomCode, playerId)] = privateViews[playerId] ?? null;
    }

    await update(ref(db), updates);
    await registerDisconnect(db, roomCode, hostId, true);
    setCachedHostGame(roomCode, state);
    return { ok: true, state, publicState };
  } catch (error) {
    reportFirebaseError('start-room-game', error);
    console.warn('Unable to start Firebase room game.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export const subscribePrivateView = (
  code: string,
  cb: (view: RoomPrivateView | null) => void,
): (() => void) => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) {
    cb(null);
    return noop;
  }

  let unsubscribed = false;
  let offValue: (() => void) | null = null;

  authedPlayerId()
    .then((playerId) => {
      if (unsubscribed) {
        return;
      }
      if (!playerId) {
        cb(null);
        return;
      }
      offValue = onValue(
        ref(db, viewPath(roomCode, playerId)),
        (snapshot) => {
          cb(snapshot.exists() ? (snapshot.val() as RoomPrivateView) : null);
        },
        (error) => {
          reportFirebaseError('private-view-subscription-callback', error);
          console.warn('Firebase private view subscription failed.', error);
          cb(null);
        },
      );
    })
    .catch((error) => {
      reportFirebaseError('subscribe-private-view-auth', error);
      console.warn('Unable to subscribe to Firebase private view.', error);
      cb(null);
    });

  return () => {
    unsubscribed = true;
    offValue?.();
  };
};

export const endRoom = async (code: string, reason = 'ended'): Promise<Result> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) {
    return unavailableResult();
  }

  const hostId = await authedPlayerId();
  if (!hostId) {
    return notSignedInResult();
  }

  try {
    const roomSnapshot = await get(ref(db, roomPath(roomCode)));
    if (!roomSnapshot.exists()) {
      return { ok: false, reason: 'Room does not exist.' };
    }
    const room = roomSnapshot.val() as RoomState;
    if (room.hostId !== hostId) {
      return { ok: false, reason: 'Only the host can end the room.' };
    }

    const updates: Record<string, unknown> = {
      [`${roomPath(roomCode)}/status`]: 'ended',
      [`${roomPath(roomCode)}/endedReason`]: reason.slice(0, 120),
      [`${roomPath(roomCode)}/endedAt`]: Date.now(),
      [`${roomPath(roomCode)}/actions`]: null,
      [`${roomPath(roomCode)}/publicState`]: null,
      // Stop advertising a table nobody can join any more, to anybody.
      ...discoveryTeardown(room, roomCode),
    };

    for (const playerId of Object.keys(room.players ?? {})) {
      updates[viewPath(roomCode, playerId)] = null;
      updates[userRoomPath(playerId, roomCode)] = null;
    }

    await update(ref(db), updates);
    hostGameCache.delete(roomCode);
    return { ok: true };
  } catch (error) {
    reportFirebaseError('end-room', error);
    console.warn('Unable to end Firebase room.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

/**
 * A reaction, sent to the rest of the table.
 *
 * Emotes were local-only: tapping one showed a bubble over your own seat and
 * nothing left the device, so the feature looked like it worked while being
 * invisible to the person it was aimed at.
 *
 * Written under the sender's own uid and overwritten each time rather than
 * appended, so the node cannot be used as an unbounded log, and never throws:
 * a reaction that fails to send must not interrupt a hand.
 */
export const sendEmoteToRoom = async (
  code: string,
  emote: { type: string; value: string; anim?: string },
): Promise<boolean> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return false;
  try {
    const playerId = await authedPlayerId();
    if (!playerId) return false;
    await set(ref(db, emotePath(roomCode, playerId)), {
      type: emote.type,
      value: emote.value,
      ...(emote.anim ? { anim: emote.anim } : {}),
      ts: Date.now(),
    });
    return true;
  } catch (error) {
    reportFirebaseError('send-emote', error);
    return false;
  }
};

/**
 * Who is sitting at a listed table.
 *
 * Read from the room rather than carried on the summary, because the summary
 * is written by the host and nobody updates it when a guest sits down, so its
 * player count was stale the moment anybody joined. A lobby is readable by
 * anyone signed in, which is what makes this possible without a second write
 * path and without trusting a count the host last touched at creation.
 */
/**
 * Delete the tables you host and are no longer at.
 *
 * The rules were changed to permit clearing an abandoned room, but nothing
 * ever did it, so a table survived its host indefinitely: one left over from
 * an older build sat in Public tables refusing everyone who tapped it. Only
 * the host can reliably tidy up, since only they may delete the room and its
 * adverts, so they do it on the way past.
 *
 * Deliberately called from the menu rather than from a table: reaching the
 * menu means you are not sitting at one of these. A room is spared unless it
 * has ended, or has gone untouched for longer than the grace period, so
 * stepping out to answer a message does not bin your own game.
 */
export const sweepMyStaleRooms = async (): Promise<number> => {
  const db = getConfiguredDb();
  if (!db) return 0;
  const uid = await authedPlayerId();
  if (!uid) return 0;

  let removed = 0;
  try {
    for (const code of await hostedRoomCodes(db, uid)) {
      const snapshot = await get(ref(db, roomPath(code)));
      const room = snapshot.val() as Partial<RoomState> | null;

      if (!snapshot.exists() || !room) {
        await update(ref(db), { [userRoomPath(uid, code)]: null, [publicRoomPath(code)]: null });
        removed += 1;
        continue;
      }
      if (room.hostId !== uid) continue;

      const ended = room.status === 'ended';
      // createdAt covers rooms from before hostAwayAt existed, which is
      // exactly the case that produced the one that would not go away.
      const stamp = typeof (room as { hostAwayAt?: number }).hostAwayAt === 'number'
        ? (room as { hostAwayAt?: number }).hostAwayAt as number
        : typeof room.createdAt === 'number' ? room.createdAt : null;
      const stale = stamp !== null && Date.now() - stamp > ABANDONED_AFTER_MS;
      if (!ended && !stale) continue;

      const teardown: Record<string, unknown> = {
        [roomPath(code)]: null,
        [userRoomPath(uid, code)]: null,
        ...discoveryTeardown(room, code),
      };
      await update(ref(db), teardown);
      removed += 1;
    }
  } catch (error) {
    reportFirebaseError('sweep-stale-rooms', error);
  }
  return removed;
};

export type RoomListingInfo = {
  seats: { id: string; name: string; palSeed?: string; palJson?: string }[];
  /** False when the advert outlived the table it points at. */
  joinable: boolean;
};

/**
 * What a listed table actually looks like right now.
 *
 * The advert is written by the host and then never touched, so on its own it
 * cannot say whether the room still exists, has already dealt, or was
 * abandoned hours ago. A table whose host walked away kept being offered, and
 * refused everyone who tapped it. Reading the room settles all three, and is
 * possible because a lobby is readable by anyone signed in.
 */
export const getRoomListingInfo = async (code: string, limit = 3): Promise<RoomListingInfo> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return { seats: [], joinable: true };
  try {
    const snapshot = await get(ref(db, roomPath(roomCode)));
    const room = snapshot.val() as Partial<RoomState> | null;
    if (!snapshot.exists() || !room) return { seats: [], joinable: false };
    if (room.status !== 'lobby' || isAbandonedRoom(room)) return { seats: [], joinable: false };
    return { seats: seatsOf(room, limit), joinable: true };
  } catch {
    // A table we cannot read is left alone rather than hidden on a guess.
    return { seats: [], joinable: true };
  }
};

const seatsOf = (room: Partial<RoomState>, limit: number) => {
  const players = (room.players as Record<string, RoomPlayer> | undefined) ?? {};
  return Object.values(players)
      // The host first, then everyone else, so the row always leads with the
      // person whose table it is.
    .sort((a, b) => Number(!!b.isHost) - Number(!!a.isHost) || (a.seatIndex ?? 0) - (b.seatIndex ?? 0))
    .slice(0, limit)
    .map((p) => ({ id: p.id, name: p.name, palSeed: p.palSeed, palJson: p.palJson }));
};

/**
 * Table your own hand, so the rest of the room can see it.
 *
 * Hole cards are published at a real showdown automatically, but a hand that
 * won because everyone folded is never shown, which is precisely when someone
 * wants to reveal a bluff. Choosing to show was local state and changed
 * nothing on anybody else's screen.
 *
 * Only the owner can set their own flag, so this cannot be used to expose
 * another player, and the host clears the node when the next hand is dealt.
 */
export const revealOwnHand = async (code: string): Promise<boolean> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return false;
  try {
    const playerId = await authedPlayerId();
    if (!playerId) return false;
    await set(ref(db, shownPath(roomCode, playerId)), true);
    return true;
  } catch (error) {
    reportFirebaseError('reveal-own-hand', error);
    return false;
  }
};

/**
 * Expose one hole card during a live hand.
 *
 * This is deliberately separate from `shown`: showing one card is not a
 * showdown decision, and the host publishes only the chosen slot rather than
 * treating the whole hand as tabled.
 */
export const exposeOwnCard = async (code: string, index: HoleCardIndex): Promise<boolean> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return false;
  try {
    const playerId = await authedPlayerId();
    if (!playerId) return false;
    await set(ref(db, exposedPath(roomCode, playerId, index)), true);
    return true;
  } catch (error) {
    reportFirebaseError('expose-own-card', error);
    return false;
  }
};

/** Who has tabled their hand this hand. */
export const subscribeShownHands = (
  code: string,
  cb: (playerIds: string[]) => void,
): (() => void) => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return noop;
  try {
    return onValue(ref(db, `${roomPath(roomCode)}/shown`), (snapshot) => {
      const value = (snapshot.val() as Record<string, unknown> | null) ?? {};
      cb(Object.entries(value).filter(([, v]) => v === true).map(([k]) => k));
    });
  } catch (error) {
    reportFirebaseError('subscribe-shown-hands', error);
    return noop;
  }
};

/** Who has exposed at least one card during this hand. */
export const subscribeExposedCards = (
  code: string,
  cb: () => void,
): (() => void) => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return noop;
  try {
    return onValue(ref(db, `${roomPath(roomCode)}/exposed`), (snapshot) => {
      if (snapshot.exists()) cb();
    });
  } catch (error) {
    reportFirebaseError('subscribe-exposed-cards', error);
    return noop;
  }
};

/** Vote for how many boards to run after everyone is all in. */
export const voteRunItTwice = async (code: string, choice: 1 | 2 | 3 | 4): Promise<RunVoteResult> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return unavailableResult();

  const playerId = await authedPlayerId();
  if (!playerId) return notSignedInResult();

  const vote = toDbRunVote(choice);
  try {
    await set(ref(db, runVotePath(roomCode, playerId)), vote);
    return { ok: true, vote };
  } catch (error) {
    reportFirebaseError('vote-run-it-twice', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

/**
 * Ask the host to rebuy this seat.
 *
 * A guest cannot mutate the game state that matters. The node carries no chip
 * amount on purpose: the host derives that from its table config when it
 * handles the request.
 */
export const requestRebuy = async (code: string): Promise<RebuyRequestResult> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return unavailableResult();

  const playerId = await authedPlayerId();
  if (!playerId) return notSignedInResult();

  const request = toDbRebuyRequest(playerId);
  try {
    await set(ref(db, rebuyPath(roomCode, playerId)), request);
    return { ok: true, request };
  } catch (error) {
    reportFirebaseError('request-rebuy', error);
    console.warn('Unable to request Firebase rebuy.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

/** Clears a rebuy request after the host has handled it. */
export const clearRebuyRequest = async (code: string, playerId: string): Promise<void> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  const cleanPlayerId = cleanKey(playerId);
  if (!db || !roomCode || !cleanPlayerId) return;

  try {
    await set(ref(db, rebuyPath(roomCode, cleanPlayerId)), null);
  } catch (error) {
    reportFirebaseError('clear-rebuy-request', error);
  }
};

/** Rebuy requests from seated players, delivered to the host. */
export const subscribeRebuyRequests = (
  code: string,
  cb: (request: RoomRebuyRequest) => void,
): (() => void) => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return noop;

  const seen = new Map<string, number>();
  try {
    return onValue(ref(db, rebuysPath(roomCode)), (snapshot) => {
      const value = snapshot.val() as Record<string, unknown> | null;
      if (!value) return;
      for (const [playerId, raw] of Object.entries(value)) {
        if (!isRoomRebuyRequest(playerId, raw)) continue;
        if ((seen.get(playerId) ?? 0) >= raw.ts) continue;
        seen.set(playerId, raw.ts);
        cb(raw);
      }
    }, (error) => {
      reportFirebaseError('rebuy-subscription-callback', error);
      console.warn('Firebase rebuy subscription failed.', error);
    });
  } catch (error) {
    reportFirebaseError('subscribe-rebuy-requests', error);
    console.warn('Unable to subscribe to Firebase rebuy requests.', error);
    return noop;
  }
};

/** Reactions from everyone else at the table. */
export const subscribeEmotes = (
  code: string,
  cb: (playerId: string, emote: { type: string; value: string; anim?: string; ts: number }) => void,
): (() => void) => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return noop;

  // Only fire for reactions newer than the moment we subscribed, or joining a
  // table would replay whatever the last person happened to send.
  const joinedAt = Date.now();
  const lastSeen = new Map<string, number>();
  try {
    return onValue(ref(db, `${roomPath(roomCode)}/emotes`), (snapshot) => {
      const value = snapshot.val() as Record<string, { type?: unknown; value?: unknown; anim?: unknown; ts?: unknown }> | null;
      if (!value) return;
      for (const [playerId, raw] of Object.entries(value)) {
        const ts = typeof raw?.ts === 'number' ? raw.ts : 0;
        if (ts <= joinedAt) continue;
        if ((lastSeen.get(playerId) ?? 0) >= ts) continue;
        lastSeen.set(playerId, ts);
        if (typeof raw?.type !== 'string' || typeof raw?.value !== 'string') continue;
        cb(playerId, {
          type: raw.type,
          value: raw.value,
          ...(typeof raw.anim === 'string' ? { anim: raw.anim } : {}),
          ts,
        });
      }
    });
  } catch (error) {
    reportFirebaseError('subscribe-emotes', error);
    return noop;
  }
};

/** Pushes an action event and advances the room action sequence when possible. */
export const pushAction = async (code: string, action: RoomAction): Promise<PushActionResult> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) {
    return unavailableResult();
  }
  const playerId = await authedPlayerId();
  if (!playerId) {
    return notSignedInResult();
  }

  let lastFailure: string | undefined;
  for (let attempt = 0; attempt < ACTION_PUSH_RETRIES; attempt += 1) {
    try {
      const seqSnapshot = await get(ref(db, actionSeqPath(roomCode)));
      const sequenced = nextActionSeq(seqSnapshot.exists() ? seqSnapshot.val() : 0);
      if (!sequenced.ok || typeof sequenced.seq !== 'number') {
        return sequenced;
      }

      const actionRef = push(ref(db, actionsPath(roomCode)));
      if (!actionRef.key) {
        return { ok: false, reason: 'Could not allocate an action key.' };
      }

      const actionValue = toDbAction({ ...action, playerId }, sequenced.seq);
      await update(ref(db), {
        [`${actionsPath(roomCode)}/${actionRef.key}`]: actionValue,
        [actionSeqPath(roomCode)]: actionValue.seq,
      });
      return { ok: true, action: actionValue };
    } catch (error) {
      lastFailure = getErrorMessage(error);
      if (attempt === ACTION_PUSH_RETRIES - 1) {
        reportFirebaseError('push-action', error);
        console.warn('Unable to push Firebase room action.', error);
      }
    }
  }

  return { ok: false, reason: lastFailure ?? 'Unable to push action.' };
};

/** Subscribes to newly observed room actions and ignores duplicates by push key. */
export const subscribeActions = (code: string, cb: (action: RoomAction) => void): (() => void) => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) {
    return noop;
  }

  const seenKeys = new Set<string>();
  let lastDeliveredSeq = 0;

  try {
    return onValue(
      ref(db, actionsPath(roomCode)),
      (snapshot) => {
        const value = snapshot.val() as Record<string, unknown> | null;
        if (!value) {
          return;
        }

        Object.entries(value)
          .filter((entry): entry is [string, RoomAction] => isRoomAction(entry[1]))
          .filter(([key]) => !seenKeys.has(key))
          .sort(([, actionA], [, actionB]) => actionA.seq - actionB.seq || actionA.ts - actionB.ts)
          .forEach(([key, action]) => {
            seenKeys.add(key);
            if (action.seq <= lastDeliveredSeq) {
              return;
            }
            lastDeliveredSeq = action.seq;
            cb(action);
          });
      },
      (error) => {
        reportFirebaseError('action-subscription-callback', error);
        console.warn('Firebase action subscription failed.', error);
      },
    );
  } catch (error) {
    reportFirebaseError('subscribe-actions', error);
    console.warn('Unable to subscribe to Firebase room actions.', error);
    return noop;
  }
};

/** Updates a player's presence and registers onDisconnect cleanup when connected. */
export const setPlayerConnected = async (
  code: string,
  playerId: string,
  connected: boolean,
): Promise<void> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  const cleanPlayerId = (await authedPlayerId()) ?? cleanKey(playerId);
  if (!db || !roomCode || !cleanPlayerId) {
    return;
  }

  try {
    const connectedRef = ref(db, playerConnectedPath(roomCode, cleanPlayerId));
    if (connected) {
      await registerDisconnect(db, roomCode, cleanPlayerId);
    } else {
      await onDisconnect(connectedRef).cancel();
    }

    await set(connectedRef, connected);
  } catch (error) {
    reportFirebaseError('set-player-connected', error);
    console.warn('Unable to update Firebase player presence.', error);
  }
};
