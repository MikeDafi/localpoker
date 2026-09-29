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
import type { RoomAction, RoomPlayer, RoomPrivateView, RoomState, RoomSummary, RoomVisibility } from './types';
import { captureError } from '../telemetry';
import { DEFAULT_GAME_SETTINGS, normalizeSettings, type GameSettings } from '../../game/settings';
import {
  applyConnectionStatusToGameState,
  redactGameState,
  type PublicGameState,
} from '../../game/onlineSync';
import { maskedPublicName } from '../../moderation/contentFilter';
import { createGame, startHand, type GameConfig, type GameState, type PlayerInput } from '../../engine';

type Result = { ok: boolean; reason?: string };
type StartRoomGameResult = Result & { state?: GameState; publicState?: PublicGameState };
type PushActionResult = Result & { action?: RoomAction };

const NOT_CONFIGURED_REASON =
  'Firebase is not configured. Set EXPO_PUBLIC_FIREBASE_* variables to enable online play.';
const INVALID_KEY_RE = /[.#$\/\[\]]/;
const ENDED_ROOM_RECLAIM_MS = 24 * 60 * 60 * 1000;
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
const viewPath = (code: string, playerId: string): string => `localpoker/views/${code}/${playerId}`;
const emotePath = (code: string, playerId: string): string => `${roomPath(code)}/emotes/${playerId}`;
const userRoomPath = (playerId: string, code: string): string => `localpoker/userRooms/${playerId}/${code}`;
/**
 * Where a room advertises itself.
 *
 * `localpoker/rooms/$code` is readable only by the host and the players already
 * in it, so a browse list cannot be built from it without opening every private
 * game to the world. These two nodes carry a summary instead: `publicRooms` is
 * the open lobby anyone may read, and `roomInvites/$friendUid` is a per-friend
 * inbox, so a private table is discoverable by your friends and by nobody else.
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

const isReclaimableEndedRoom = (room: Partial<RoomState> | null): boolean =>
  room?.status === 'ended' &&
  typeof room.endedAt === 'number' &&
  Date.now() - room.endedAt >= ENDED_ROOM_RECLAIM_MS;

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
 * refused invite must never read to the host as a refused table.
 */
const publishDiscovery = async (
  db: Database,
  roomCode: string,
  hostId: string,
  hostName: string,
  options: { visibility?: RoomVisibility; friendUids?: readonly string[] },
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
  // Friends get told about the table either way: a private room is private
  // from strangers, not from the people it is for.
  for (const friendUid of options.friendUids ?? []) {
    if (friendUid && friendUid !== hostId) discovery[roomInvitePath(friendUid, roomCode)] = summary;
  }
  if (Object.keys(discovery).length === 0) return;
  try {
    await update(ref(db), discovery);

    /*
     * Deliberately no onDisconnect teardown of these entries.
     *
     * Removing them when the host's connection dropped seemed like the tidy
     * way to clean up after a client that had gone for good. It is not: iOS
     * closes the socket within seconds of the app being backgrounded, so the
     * host switching apps to send someone the code deleted the very invite
     * they were about to talk about, and the friend opened the app to find
     * nothing there.
     *
     * A dropped connection is not an intent to withdraw anything, which is
     * the same reason it no longer ends the room. Invites are withdrawn
     * explicitly when the table starts or ends, the invitee deletes one that
     * turns out to lead nowhere, and an abandoned room is swept after ten
     * minutes.
     */

    /*
     * Notify the friends who are not already looking at the app.
     *
     * Someone online sees the invite arrive in their Join Room list, so a push
     * on top of that is just a second copy of the same news. Someone away has
     * no other way of hearing about it, which is the case the notification
     * exists for. Presence is read rather than assumed, and a failed read
     * falls through to sending, because a missed invite is worse than a
     * duplicate one.
     */
    for (const friendUid of options.friendUids ?? []) {
      if (!friendUid || friendUid === hostId) continue;
      void (async () => {
        let away = true;
        try {
          const snap = await get(ref(db, `localpoker/presence/${friendUid}/online`));
          away = snap.val() !== true;
        } catch {
          // Unreadable presence is not a reason to stay silent.
        }
        if (away) void sendPush(friendUid, 'room-invite', hostName, roomCode);
      })();
    }
  } catch (error) {
    reportFirebaseError('create-room-discovery', error);
    console.warn('Room created but could not publish invites.', error);
  }
};

/**
 * How many tables one person may have open at once.
 *
 * Without a cap a host accumulates rooms every time they set one up and walk
 * away, each one advertising itself to their friends until it is swept, so
 * the Join Room list fills with tables belonging to one person who is not at
 * any of them.
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

  try {
    const roomRef = ref(db, roomPath(roomCode));
    const existing = await get(roomRef);
    if (existing.exists()) {
      const existingRoom = existing.val() as Partial<RoomState> | null;
      // Re-entering a lobby you already host is not a collision, it is the
      // normal result of stepping back into Game Setup to change the blinds
      // and returning. Treating it as one meant the host was told "Room
      // already exists" about their own table, and editing settings after
      // creating a room was impossible. Refresh the settings in place and
      // leave the players who have already joined exactly where they are.
      if (existingRoom?.hostId === hostId && existingRoom?.status === 'lobby') {
        await update(roomRef, {
          settingsJson,
          visibility: options.visibility === 'public' ? 'public' : 'private',
          hostName: host.name,
        });
        await publishDiscovery(db, roomCode, hostId, host.name, options, 'lobby', settingsJson);
        await registerDisconnect(db, roomCode, hostId);
        return { ok: true };
      }
      if (!isReclaimableEndedRoom(existingRoom)) {
        return { ok: false, reason: 'Room already exists.' };
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

    const visibility: RoomVisibility = options.visibility === 'public' ? 'public' : 'private';
    const hostPlayer = toDbPlayer(host, { id: hostId, connected: true, isHost: true });
    const invitedUids = (options.friendUids ?? []).filter((uid) => uid && uid !== hostId);
    const invitedMap = invitedUids.length
      ? Object.fromEntries(invitedUids.map((uid) => [uid, true]))
      : null;
    const room: RoomState = {
      code: roomCode,
      hostId,
      status: 'lobby',
      createdAt: serverTimestamp() as unknown as number,
      settingsJson,
      visibility,
      hostName: host.name,
      players: {
        [hostId]: hostPlayer,
      },
      actionSeq: 0,
      // Who this table advertised itself to. Without it the host cannot
      // withdraw its own invites later, which is exactly why a friend's Join
      // Table kept opening a room that had already started or gone.
      ...(invitedMap ? { invited: invitedMap } : {}),
    };

    // The room has to land before its discovery entries, and this cannot be one
    // atomic write.
    //
    // The rules on `publicRooms/$code` and `roomInvites/$uid/$code` both check
    // `root.../rooms/$code/hostId === auth.uid` to prove the writer hosts the
    // room. `root` is the database *before* the write, so during creation that
    // lookup sees nothing and the check fails. Because a multi-path update is
    // atomic, that rejected the entire write: no room, no invites, no listing,
    // just PERMISSION_DENIED. It only bit when the write actually included
    // those paths, which is to say whenever the host had friends or ticked
    // public, which is every real "play with friends" table.
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

    const connectedByPlayerId = Object.fromEntries(
      cached.players.map((player) => [player.id, room.players?.[player.id]?.connected === true]),
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
    if (room?.status && room.status !== 'lobby') {
      void forgetInvite(db, roomCode, playerId);
      return { ok: false, reason: 'That game has already started.' };
    }

    const playerValue = toDbPlayer(player, { id: playerId, connected: true });
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
  smallBlind: settings.smallBlind,
  bigBlind: settings.bigBlind,
  ante: settings.ante,
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
    chips: player.chips || settings.startingStack,
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

    const { publicState, privateViews } = redactGameState(state, {
      code: roomCode,
      playerMeta: playerMetaFromRoom(room),
      updatedAt: Date.now(),
    });
    const updates: Record<string, unknown> = {
      [`${roomPath(roomCode)}/publicState`]: publicState,
      [`${roomPath(roomCode)}/status`]: 'playing',
    };

    for (const [playerId, view] of Object.entries(privateViews)) {
      if (room.players?.[playerId]) {
        updates[viewPath(roomCode, playerId)] = view;
      }
    }

    await update(ref(db), updates);
    setCachedHostGame(roomCode, state);
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
      [`${roomPath(roomCode)}/publicState`]: publicState,
      [`${roomPath(roomCode)}/actions`]: null,
      [`${roomPath(roomCode)}/actionSeq`]: 0,
    };

    for (const [playerId, view] of Object.entries(privateViews)) {
      updates[viewPath(roomCode, playerId)] = view;
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
export const getRoomSeats = async (
  code: string,
  limit = 3,
): Promise<{ id: string; name: string; palSeed?: string }[]> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) return [];
  try {
    const snapshot = await get(ref(db, playersPath(roomCode)));
    const players = (snapshot.val() as Record<string, RoomPlayer> | null) ?? {};
    return Object.values(players)
      // The host first, then everyone else, so the row always leads with the
      // person whose table it is.
      .sort((a, b) => Number(!!b.isHost) - Number(!!a.isHost) || (a.seatIndex ?? 0) - (b.seatIndex ?? 0))
      .slice(0, limit)
      .map((p) => ({ id: p.id, name: p.name, palSeed: p.palSeed }));
  } catch {
    // A table we cannot read is simply drawn without faces.
    return [];
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
