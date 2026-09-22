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
import type { RoomAction, RoomPlayer, RoomPrivateView, RoomState } from './types';
import { captureError } from '../telemetry';
import { DEFAULT_GAME_SETTINGS, normalizeSettings, type GameSettings } from '../../game/settings';
import {
  redactGameState,
  type PublicGameState,
} from '../../game/onlineSync';
import { createGame, startHand, type GameConfig, type GameState, type PlayerInput } from '../../engine';

type Result = { ok: boolean; reason?: string };
type StartRoomGameResult = Result & { state?: GameState; publicState?: PublicGameState };

const NOT_CONFIGURED_REASON =
  'Firebase is not configured. Set EXPO_PUBLIC_FIREBASE_* variables to enable online play.';
const INVALID_KEY_RE = /[.#$\/\[\]]/;

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
const roomStatusPath = (code: string): string => `${roomPath(code)}/status`;
const viewPath = (code: string, playerId: string): string => `localpoker/views/${code}/${playerId}`;

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
    name: merged.name,
    ...(merged.palSeed ? { palSeed: merged.palSeed } : {}),
    seatIndex: merged.seatIndex,
    chips: merged.chips,
    connected: merged.connected,
    isHost: merged.isHost,
  };
};

const toDbAction = (action: RoomAction): RoomAction => ({
  seq: action.seq,
  playerId: action.playerId,
  type: action.type,
  ...(typeof action.amount === 'number' ? { amount: action.amount } : {}),
  ts: Number.isFinite(action.ts) && action.ts > 0 ? action.ts : (serverTimestamp() as unknown as number),
});

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
  return (
    typeof action.seq === 'number' &&
    typeof action.playerId === 'string' &&
    typeof action.type === 'string' &&
    typeof action.ts === 'number'
  );
};

const registerDisconnect = async (
  db: Database,
  code: string,
  playerId: string,
  endRoomOnDisconnect = false,
): Promise<void> => {
  try {
    await onDisconnect(ref(db, playerConnectedPath(code, playerId))).set(false);
    if (endRoomOnDisconnect) {
      await onDisconnect(ref(db, roomStatusPath(code))).set('ended');
    }
  } catch (error) {
    reportFirebaseError('register-disconnect', error);
    console.warn('Unable to register Firebase disconnect handler.', error);
  }
};

/** Creates a private room with the host seated and connected. */
export const createRoom = async (
  code: string,
  host: RoomPlayer,
  settingsJson: string,
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
      return { ok: false, reason: 'Room already exists.' };
    }

    const hostPlayer = toDbPlayer(host, { id: hostId, connected: true, isHost: true });
    const room: RoomState = {
      code: roomCode,
      hostId,
      status: 'lobby',
      createdAt: serverTimestamp() as unknown as number,
      settingsJson,
      players: {
        [hostId]: hostPlayer,
      },
      actionSeq: 0,
    };

    await set(roomRef, room);
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
 * the rules would have rejected *every* online write — create, join and act
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

/** Adds or updates a player in an existing room and marks them connected. */
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
    const roomSnapshot = await get(ref(db, roomPath(roomCode)));
    if (!roomSnapshot.exists()) {
      return { ok: false, reason: 'Room does not exist.' };
    }

    const room = roomSnapshot.val() as Partial<RoomState> | null;
    if (room?.status === 'ended') {
      return { ok: false, reason: 'Room has ended.' };
    }

    const playerValue = toDbPlayer(player, { id: playerId, connected: true });
    await update(ref(db, playerPath(roomCode, playerId)), playerValue);
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
    await set(ref(db, playerPath(roomCode, cleanPlayerId)), null);
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
        cb(snapshot.exists() ? (snapshot.val() as RoomState) : null);
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
  startingStack: settings.startingStack,
  maxPlayers: Math.max(playerCount, settings.maxPlayers),
  turnTimerSec: settings.turnTimerSec,
});

const sortedRoomPlayers = (room: Pick<RoomState, 'hostId' | 'players'>): RoomPlayer[] =>
  Object.values(room.players ?? {})
    .filter((player) => player.connected)
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
      updates[viewPath(roomCode, playerId)] = view;
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

    await update(ref(db), {
      [`${roomPath(roomCode)}/status`]: 'ended',
      [`${roomPath(roomCode)}/endedReason`]: reason.slice(0, 120),
      [`${roomPath(roomCode)}/endedAt`]: Date.now(),
    });
    hostGameCache.delete(roomCode);
    return { ok: true };
  } catch (error) {
    reportFirebaseError('end-room', error);
    console.warn('Unable to end Firebase room.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

/** Pushes an action event and advances the room action sequence when possible. */
export const pushAction = async (code: string, action: RoomAction): Promise<void> => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) {
    return;
  }
  const playerId = await authedPlayerId();
  if (!playerId) {
    return;
  }

  try {
    const actionRef = push(ref(db, actionsPath(roomCode)));
    if (!actionRef.key) {
      return;
    }

    const actionValue = toDbAction({ ...action, playerId });
    await update(ref(db), {
      [`${actionsPath(roomCode)}/${actionRef.key}`]: actionValue,
      [`${roomPath(roomCode)}/actionSeq`]: actionValue.seq,
    });
  } catch (error) {
    reportFirebaseError('push-action', error);
    console.warn('Unable to push Firebase room action.', error);
  }
};

/** Subscribes to newly observed room actions and ignores duplicates by push key. */
export const subscribeActions = (code: string, cb: (action: RoomAction) => void): (() => void) => {
  const db = getConfiguredDb();
  const roomCode = cleanKey(code);
  if (!db || !roomCode) {
    return noop;
  }

  const seenKeys = new Set<string>();

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
