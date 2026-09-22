import {
  get,
  onValue,
  ref,
  runTransaction,
  serverTimestamp,
  update,
  type Database,
} from 'firebase/database';

import { getDb, isFirebaseConfigured } from './config';
import { ensureSignedIn } from './auth';
import { captureError } from '../telemetry';

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

export type SocialSnapshot = {
  accepted: FriendEdgeRecord[];
  incoming: FriendRequestRecord[];
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
  return HANDLE_RE.test(handle) ? handle : null;
};

const usersPath = (uid: string): string => `localpoker/users/${uid}`;
const handlesPath = (handle: string): string => `localpoker/handles/${handle}`;
const friendsPath = (uid: string): string => `localpoker/friends/${uid}`;
const friendPath = (uid: string, friendUid: string): string => `${friendsPath(uid)}/${friendUid}`;
const requestsPath = (toUid: string): string => `localpoker/friendRequests/${toUid}`;
const requestPath = (toUid: string, fromUid: string): string => `${requestsPath(toUid)}/${fromUid}`;

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
    const claimed = await runTransaction(
      ref(db, handlesPath(handle)),
      (current) => {
        if (current === null || current === uid) {
          return uid;
        }
        return undefined;
      },
      { applyLocally: false },
    );

    if (!claimed.snapshot.exists() || claimed.snapshot.val() !== uid) {
      return { ok: false, reason: `@${handle} is already taken.` };
    }

    const displayName = cleanDisplayName(displayNameInput) || `Player ${handle}`;
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
      displayName: cleanDisplayName(user?.displayName ?? '') || `@${handle}`,
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
        fromName: cleanDisplayName(fromDisplayName) || `@${ownHandle}`,
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

export const subscribeSocialGraph = (cb: (snapshot: SocialSnapshot) => void): (() => void) => {
  const db = getConfiguredDb();
  if (!db) {
    cb({ accepted: [], incoming: [] });
    return noop;
  }

  let unsubscribed = false;
  let offFriends: (() => void) | null = null;
  let offRequests: (() => void) | null = null;
  let accepted: FriendEdgeRecord[] = [];
  let incoming: FriendRequestRecord[] = [];

  const emit = (): void => cb({ accepted, incoming });

  ensureSignedIn()
    .then((uid) => {
      if (unsubscribed) {
        return;
      }
      if (!uid) {
        cb({ accepted: [], incoming: [] });
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
    })
    .catch((error) => {
      reportFirebaseError('subscribe-social-graph', error);
      console.warn('Unable to subscribe to Firebase friends.', error);
      cb({ accepted: [], incoming: [] });
    });

  return () => {
    unsubscribed = true;
    offFriends?.();
    offRequests?.();
  };
};
