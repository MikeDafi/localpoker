import {
  get,
  onValue,
  push,
  ref,
  runTransaction,
  serverTimestamp,
  update,
  type Database,
} from 'firebase/database';

import { getDb, isFirebaseConfigured } from './config';
import { deleteCurrentAuthUser, ensureSignedIn } from './auth';
import { captureError } from '../telemetry';
import { maskedPublicName, publicNameIssue } from '../../moderation/contentFilter';

export type FirebaseFriendResult<T extends object = object> =
  | ({ ok: true; reason?: string } & T)
  | { ok: false; reason: string };

export type DirectoryUser = {
  handle: string;
  displayName: string;
  updatedAt: number;
};

export type FriendRequestRecord = {
  fromUid: string;
  fromHandle: string;
  fromName: string;
  createdAt: number;
  status: 'pending' | 'accepted' | 'declined';
};

export type FriendEdgeRecord = {
  uid: string;
  handle: string;
  displayName: string;
  status: 'accepted';
  updatedAt: number;
};

export type BlockRecord = {
  uid: string;
  handle?: string;
  displayName: string;
  createdAt: number;
};

export type ReportContext = 'friends' | 'table';

export type ReportRecord = {
  reporterUid: string;
  reportedUid: string;
  reportedName: string;
  context: ReportContext;
  category: 'offensive_content';
  createdAt: number;
  roomCode?: string;
};

export type SocialSnapshot = {
  accepted: FriendEdgeRecord[];
  incoming: FriendRequestRecord[];
  blocked: BlockRecord[];
};

const NOT_CONFIGURED_REASON =
  'Online friend requests need Firebase setup. You can still share private room codes manually.';
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

const noop = (): void => {};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unexpected Firebase error';

const reportFirebaseError = (operation: string, error: unknown): void => {
  captureError(error, { tags: { area: 'firebase-friends', operation } });
};

const cleanDisplayName = (name: string): string => name.trim().replace(/\s+/g, ' ').slice(0, 24);

export const normalizeHandle = (input: string): string | null => {
  const beforeAt = input.trim().toLowerCase().replace(/^@+/, '').split('@')[0] ?? '';
  const handle = beforeAt.replace(/[^a-z0-9_]/g, '');
  if (publicNameIssue(handle, 'handle')) {
    return null;
  }
  return HANDLE_RE.test(handle) ? handle : null;
};

const usersPath = (uid: string): string => `localpoker/users/${uid}`;
const handlesPath = (handle: string): string => `localpoker/handles/${handle}`;
const friendsPath = (uid: string): string => `localpoker/friends/${uid}`;
const friendPath = (uid: string, friendUid: string): string => `${friendsPath(uid)}/${friendUid}`;
const requestsPath = (toUid: string): string => `localpoker/friendRequests/${toUid}`;
const requestPath = (toUid: string, fromUid: string): string => `${requestsPath(toUid)}/${fromUid}`;
const blocksPath = (uid: string): string => `localpoker/blocks/${uid}`;
const blockPath = (uid: string, blockedUid: string): string => `${blocksPath(uid)}/${blockedUid}`;
const reportsPath = (): string => 'localpoker/reports';
const userRoomsPath = (uid: string): string => `localpoker/userRooms/${uid}`;
const userRoomPath = (uid: string, code: string): string => `${userRoomsPath(uid)}/${code}`;
const roomPath = (code: string): string => `localpoker/rooms/${code}`;
const roomPlayerPath = (code: string, uid: string): string => `${roomPath(code)}/players/${uid}`;
const viewPath = (code: string, uid: string): string => `localpoker/views/${code}/${uid}`;

const getConfiguredDb = (): Database | null => {
  if (!isFirebaseConfigured()) {
    return null;
  }

  return getDb();
};

const notSignedInResult = (): { ok: false; reason: string } => ({
  ok: false,
  reason: 'Could not sign in to use online friends. Check your connection and try again.',
});

export const publishUserDirectory = async (
  handleInput: string,
  displayNameInput: string,
): Promise<FirebaseFriendResult<{ uid: string; handle: string }>> => {
  const db = getConfiguredDb();
  if (!db) {
    return { ok: false, reason: NOT_CONFIGURED_REASON };
  }

  const uid = await ensureSignedIn();
  if (!uid) {
    return notSignedInResult();
  }

  const existing = await get(ref(db, usersPath(uid)));
  const existingUser = existing.exists() ? (existing.val() as Partial<DirectoryUser>) : null;
  const handle = normalizeHandle(existingUser?.handle ?? handleInput);
  if (!handle) {
    return { ok: false, reason: 'Choose a handle using 3 to 20 letters, numbers, or underscores.' };
  }

  try {
    // Re-writing the handle you already own looks harmless but is not allowed:
    // the rules treat handles as create-or-release, so an owner-to-owner write
    // is rejected. Returning `undefined` aborts the transaction and leaves the
    // existing claim in place, which is the intended outcome anyway. Without
    // this, every profile change and every launch fired a permission_denied.
    const claimed = await runTransaction(
      ref(db, handlesPath(handle)),
      (current) => {
        if (current === null) {
          return uid;
        }
        return undefined;
      },
      { applyLocally: false },
    );

    // Aborting when you already hold the handle is success, not failure.
    if (!claimed.snapshot.exists() || claimed.snapshot.val() !== uid) {
      return { ok: false, reason: `@${handle} is already taken.` };
    }

    const displayName = cleanDisplayName(displayNameInput) || `Player ${handle}`;
    const displayNameIssue = publicNameIssue(displayName, 'name');
    if (displayNameIssue) {
      return { ok: false, reason: displayNameIssue };
    }
    await update(ref(db), {
      [usersPath(uid)]: {
        handle,
        displayName,
        updatedAt: Date.now(),
      } satisfies DirectoryUser,
    });

    return { ok: true, uid, handle };
  } catch (error) {
    reportFirebaseError('publish-user-directory', error);
    console.warn('Unable to publish Firebase user directory entry.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export const resolveHandle = async (
  handleInput: string,
): Promise<FirebaseFriendResult<{ uid: string; handle: string; displayName: string }>> => {
  const db = getConfiguredDb();
  if (!db) {
    return { ok: false, reason: NOT_CONFIGURED_REASON };
  }

  const uid = await ensureSignedIn();
  if (!uid) {
    return notSignedInResult();
  }

  const handle = normalizeHandle(handleInput);
  if (!handle) {
    return { ok: false, reason: 'Handles use 3 to 20 letters, numbers, or underscores.' };
  }

  try {
    const handleSnapshot = await get(ref(db, handlesPath(handle)));
    if (!handleSnapshot.exists()) {
      return { ok: false, reason: 'No player with that handle.' };
    }

    const foundUid = handleSnapshot.val() as string;
    const userSnapshot = await get(ref(db, usersPath(foundUid)));
    const user = userSnapshot.exists() ? (userSnapshot.val() as Partial<DirectoryUser>) : null;
    return {
      ok: true,
      uid: foundUid,
      handle,
      displayName: maskedPublicName(cleanDisplayName(user?.displayName ?? '') || `@${handle}`),
    };
  } catch (error) {
    reportFirebaseError('resolve-handle', error);
    console.warn('Unable to resolve Firebase friend handle.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export const sendFriendRequest = async (
  handleInput: string,
  fromDisplayName: string,
  fromHandleInput: string,
): Promise<FirebaseFriendResult<{ toUid: string; handle: string; displayName: string }>> => {
  const db = getConfiguredDb();
  if (!db) {
    return { ok: false, reason: NOT_CONFIGURED_REASON };
  }

  const fromUid = await ensureSignedIn();
  if (!fromUid) {
    return notSignedInResult();
  }

  const ownHandle = normalizeHandle(fromHandleInput);
  if (!ownHandle) {
    return { ok: false, reason: 'Set your handle before sending friend requests.' };
  }

  const target = await resolveHandle(handleInput);
  if (!target.ok || !target.uid || !target.handle || !target.displayName) {
    return { ok: false, reason: target.reason || 'No player with that handle.' };
  }
  if (target.uid === fromUid) {
    return { ok: false, reason: "That's you!" };
  }

  try {
    const existingFriend = await get(ref(db, friendPath(fromUid, target.uid)));
    if (existingFriend.exists()) {
      return { ok: false, reason: `${target.displayName} is already in your crew.` };
    }

    const blockedByTarget = await get(ref(db, blockPath(target.uid, fromUid)));
    if (blockedByTarget.exists()) {
      return { ok: false, reason: 'That player is not accepting friend requests from you.' };
    }

    const fromName = cleanDisplayName(fromDisplayName) || `@${ownHandle}`;
    const fromNameIssue = publicNameIssue(fromName, 'name');
    if (fromNameIssue) {
      return { ok: false, reason: fromNameIssue };
    }

    const requestRef = ref(db, requestPath(target.uid, fromUid));
    const existingRequest = await get(requestRef);
    if (existingRequest.exists()) {
      const request = existingRequest.val() as Partial<FriendRequestRecord>;
      if (request.status === 'pending') {
        return { ok: false, reason: `Request already sent to @${target.handle}.` };
      }
      if (request.status === 'accepted') {
        return { ok: false, reason: `${target.displayName} is already in your crew.` };
      }
    }

    await update(ref(db), {
      [requestPath(target.uid, fromUid)]: {
        fromUid,
        fromHandle: ownHandle,
        fromName,
        createdAt: serverTimestamp() as unknown as number,
        status: 'pending',
      } satisfies FriendRequestRecord,
    });

    return { ok: true, toUid: target.uid, handle: target.handle, displayName: target.displayName };
  } catch (error) {
    reportFirebaseError('send-friend-request', error);
    console.warn('Unable to send Firebase friend request.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export const acceptFriendRequest = async (fromUid: string): Promise<FirebaseFriendResult> => {
  const db = getConfiguredDb();
  if (!db) {
    return { ok: false, reason: NOT_CONFIGURED_REASON };
  }

  const toUid = await ensureSignedIn();
  if (!toUid) {
    return notSignedInResult();
  }

  try {
    const [requestSnapshot, selfSnapshot] = await Promise.all([
      get(ref(db, requestPath(toUid, fromUid))),
      get(ref(db, usersPath(toUid))),
    ]);
    if (!requestSnapshot.exists()) {
      return { ok: false, reason: 'Friend request no longer exists.' };
    }

    const request = requestSnapshot.val() as FriendRequestRecord;
    if (request.status !== 'pending') {
      return { ok: false, reason: 'Friend request is no longer pending.' };
    }

    const self = selfSnapshot.exists() ? (selfSnapshot.val() as DirectoryUser) : null;
    if (!self?.handle) {
      return { ok: false, reason: 'Set your handle before accepting friend requests.' };
    }

    const updatedAt = Date.now();
    await update(ref(db), {
      [requestPath(toUid, fromUid)]: { ...request, status: 'accepted' },
      [friendPath(toUid, fromUid)]: {
        uid: fromUid,
        handle: request.fromHandle,
        displayName: request.fromName,
        status: 'accepted',
        updatedAt,
      } satisfies FriendEdgeRecord,
      [friendPath(fromUid, toUid)]: {
        uid: toUid,
        handle: self.handle,
        displayName: self.displayName,
        status: 'accepted',
        updatedAt,
      } satisfies FriendEdgeRecord,
    });

    return { ok: true };
  } catch (error) {
    reportFirebaseError('accept-friend-request', error);
    console.warn('Unable to accept Firebase friend request.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export const declineFriendRequest = async (fromUid: string): Promise<FirebaseFriendResult> => {
  const db = getConfiguredDb();
  if (!db) {
    return { ok: false, reason: NOT_CONFIGURED_REASON };
  }

  const toUid = await ensureSignedIn();
  if (!toUid) {
    return notSignedInResult();
  }

  try {
    const snapshot = await get(ref(db, requestPath(toUid, fromUid)));
    if (!snapshot.exists()) {
      return { ok: false, reason: 'Friend request no longer exists.' };
    }

    const request = snapshot.val() as FriendRequestRecord;
    await update(ref(db), {
      [requestPath(toUid, fromUid)]: { ...request, status: 'declined' },
    });
    return { ok: true };
  } catch (error) {
    reportFirebaseError('decline-friend-request', error);
    console.warn('Unable to decline Firebase friend request.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export const removeFriendship = async (friendUid: string): Promise<FirebaseFriendResult> => {
  const db = getConfiguredDb();
  if (!db) {
    return { ok: false, reason: NOT_CONFIGURED_REASON };
  }

  const uid = await ensureSignedIn();
  if (!uid) {
    return notSignedInResult();
  }

  try {
    await update(ref(db), {
      [friendPath(uid, friendUid)]: null,
      [friendPath(friendUid, uid)]: null,
    });
    return { ok: true };
  } catch (error) {
    reportFirebaseError('remove-friendship', error);
    console.warn('Unable to remove Firebase friend.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export const blockUser = async (
  blockedUid: string,
  displayNameInput: string,
  handleInput?: string,
): Promise<FirebaseFriendResult> => {
  const db = getConfiguredDb();
  if (!db) {
    return { ok: false, reason: NOT_CONFIGURED_REASON };
  }

  const uid = await ensureSignedIn();
  if (!uid) {
    return notSignedInResult();
  }
  if (blockedUid === uid) {
    return { ok: false, reason: "You can't block yourself." };
  }

  try {
    const displayName = maskedPublicName(cleanDisplayName(displayNameInput) || 'Blocked player');
    const handle = normalizeHandle(handleInput ?? '');
    await update(ref(db), {
      [blockPath(uid, blockedUid)]: {
        uid: blockedUid,
        ...(handle ? { handle } : {}),
        displayName,
        createdAt: serverTimestamp() as unknown as number,
      } satisfies BlockRecord,
      [friendPath(uid, blockedUid)]: null,
      [friendPath(blockedUid, uid)]: null,
      [requestPath(uid, blockedUid)]: null,
      [requestPath(blockedUid, uid)]: null,
    });
    return { ok: true };
  } catch (error) {
    reportFirebaseError('block-user', error);
    console.warn('Unable to block Firebase user.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export const reportUser = async (
  reportedUid: string,
  reportedNameInput: string,
  context: ReportContext,
  roomCode?: string,
): Promise<FirebaseFriendResult> => {
  const db = getConfiguredDb();
  if (!db) {
    return { ok: false, reason: NOT_CONFIGURED_REASON };
  }

  const uid = await ensureSignedIn();
  if (!uid) {
    return notSignedInResult();
  }
  if (reportedUid === uid) {
    return { ok: false, reason: "You can't report yourself." };
  }

  try {
    const reportRef = push(ref(db, reportsPath()));
    if (!reportRef.key) {
      return { ok: false, reason: 'Could not create a report.' };
    }
    await update(ref(db), {
      [`${reportsPath()}/${reportRef.key}`]: {
        reporterUid: uid,
        reportedUid,
        reportedName: maskedPublicName(cleanDisplayName(reportedNameInput) || 'Reported player'),
        context,
        category: 'offensive_content',
        createdAt: serverTimestamp() as unknown as number,
        ...(roomCode ? { roomCode: roomCode.slice(0, 12) } : {}),
      } satisfies ReportRecord,
    });
    return { ok: true };
  } catch (error) {
    reportFirebaseError('report-user', error);
    console.warn('Unable to report Firebase user.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export type DeleteAccountHints = {
  knownFriendUids?: string[];
  knownOutgoingRequestUids?: string[];
  knownRoomCodes?: string[];
};

const readKeys = <T>(value: Record<string, T> | null | undefined): string[] => Object.keys(value ?? {});

export const deleteOnlineAccount = async (
  hints: DeleteAccountHints = {},
): Promise<FirebaseFriendResult<{ remoteDeleted: boolean }>> => {
  const db = getConfiguredDb();
  if (!db) {
    return { ok: true, remoteDeleted: false, reason: NOT_CONFIGURED_REASON };
  }

  const uid = await ensureSignedIn();
  if (!uid) {
    return { ok: true, remoteDeleted: false, reason: 'Could not sign in, so only local data was deleted.' };
  }

  try {
    const [userSnapshot, friendsSnapshot, roomsSnapshot] = await Promise.all([
      get(ref(db, usersPath(uid))),
      get(ref(db, friendsPath(uid))),
      get(ref(db, userRoomsPath(uid))),
    ]);

    const user = userSnapshot.exists() ? (userSnapshot.val() as Partial<DirectoryUser>) : null;
    const friendUids = new Set([
      ...readKeys(friendsSnapshot.val() as Record<string, FriendEdgeRecord> | null),
      ...(hints.knownFriendUids ?? []),
    ]);
    const roomCodes = new Set([
      ...readKeys(roomsSnapshot.val() as Record<string, unknown> | null),
      ...(hints.knownRoomCodes ?? []),
    ]);

    for (const code of roomCodes) {
      const roomSnapshot = await get(ref(db, roomPath(code)));
      if (!roomSnapshot.exists()) {
        continue;
      }
      const room = roomSnapshot.val() as {
        hostId?: string;
        players?: Record<string, unknown>;
      } | null;
      if (room?.hostId === uid) {
        const playerIds = Object.keys(room.players ?? {});
        const cleanup: Record<string, unknown> = {};
        for (const playerId of playerIds) {
          cleanup[viewPath(code, playerId)] = null;
          cleanup[userRoomPath(playerId, code)] = null;
        }
        if (Object.keys(cleanup).length > 0) {
          await update(ref(db), cleanup);
        }
        await update(ref(db), { [roomPath(code)]: null });
      } else if (room?.players?.[uid]) {
        await update(ref(db), {
          [roomPlayerPath(code, uid)]: null,
          [viewPath(code, uid)]: null,
          [userRoomPath(uid, code)]: null,
        });
      }
    }

    const updates: Record<string, unknown> = {
      [usersPath(uid)]: null,
      [friendsPath(uid)]: null,
      [requestsPath(uid)]: null,
      [blocksPath(uid)]: null,
      [userRoomsPath(uid)]: null,
    };

    if (user?.handle) {
      const handleSnapshot = await get(ref(db, handlesPath(user.handle)));
      if (handleSnapshot.exists() && handleSnapshot.val() === uid) {
        updates[handlesPath(user.handle)] = null;
      }
    }

    for (const friendUid of friendUids) {
      updates[friendPath(friendUid, uid)] = null;
    }
    for (const toUid of hints.knownOutgoingRequestUids ?? []) {
      updates[requestPath(toUid, uid)] = null;
    }

    await update(ref(db), updates);
    const authDeleted = await deleteCurrentAuthUser();
    return {
      ok: true,
      remoteDeleted: true,
      ...(authDeleted ? {} : { reason: 'Online records were deleted, but the anonymous auth session could not be deleted.' }),
    };
  } catch (error) {
    reportFirebaseError('delete-online-account', error);
    console.warn('Unable to delete Firebase account data.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export const subscribeSocialGraph = (cb: (snapshot: SocialSnapshot) => void): (() => void) => {
  const db = getConfiguredDb();
  if (!db) {
    cb({ accepted: [], incoming: [], blocked: [] });
    return noop;
  }

  let unsubscribed = false;
  let offFriends: (() => void) | null = null;
  let offRequests: (() => void) | null = null;
  let offBlocks: (() => void) | null = null;
  let accepted: FriendEdgeRecord[] = [];
  let incoming: FriendRequestRecord[] = [];
  let blocked: BlockRecord[] = [];

  const emit = (): void => cb({ accepted, incoming, blocked });

  ensureSignedIn()
    .then((uid) => {
      if (unsubscribed) {
        return;
      }
      if (!uid) {
        cb({ accepted: [], incoming: [], blocked: [] });
        return;
      }

      offFriends = onValue(ref(db, friendsPath(uid)), (snapshot) => {
        const value = snapshot.val() as Record<string, FriendEdgeRecord> | null;
        accepted = Object.values(value ?? {}).filter((friend) => friend.status === 'accepted');
        emit();
      });

      offRequests = onValue(ref(db, requestsPath(uid)), (snapshot) => {
        const value = snapshot.val() as Record<string, FriendRequestRecord> | null;
        incoming = Object.values(value ?? {}).filter((request) => request.status === 'pending');
        emit();
      });

      offBlocks = onValue(ref(db, blocksPath(uid)), (snapshot) => {
        const value = snapshot.val() as Record<string, BlockRecord> | null;
        blocked = Object.values(value ?? {});
        emit();
      });
    })
    .catch((error) => {
      reportFirebaseError('subscribe-social-graph', error);
      console.warn('Unable to subscribe to Firebase friends.', error);
      cb({ accepted: [], incoming: [], blocked: [] });
    });

  return () => {
    unsubscribed = true;
    offFriends?.();
    offRequests?.();
    offBlocks?.();
  };
};
