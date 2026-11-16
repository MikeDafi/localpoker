import {
  endAt,
  get,
  limitToFirst,
  onValue,
  orderByKey,
  push,
  query,
  ref,
  serverTimestamp,
  startAt,
  type Database,
} from 'firebase/database';

import { getDb, isFirebaseConfigured } from './config';
import { updateRoot } from './rootUpdate';
import { deleteCurrentAuthUser, ensureSignedIn } from './auth';
import { RATE_LIMITED_REASON, isThrottled, rateLimitPath, type RateLimitKind } from './rateLimits';
import { captureError } from '../telemetry';
import { maskedPublicName, publicNameIssue } from '../../moderation/contentFilter';

export type FirebaseFriendResult<T extends object = object> =
  | ({ ok: true; reason?: string } & T)
  /**
   * `nameTaken` marks the one failure the caller must not paper over: the
   * player asked for a name somebody else holds, so they keep the one they
   * have rather than being handed a generated replacement.
   */
  | { ok: false; reason: string; nameTaken?: boolean };

export type DirectoryUser = {
  handle: string;
  displayName: string;
  updatedAt: number;
  /**
   * The owner's Pal, serialised.
   *
   * Stored as a string for the same reason room settings are: validating
   * nineteen individual avatar fields in database rules would be long and
   * brittle, while a length-capped string is trivial to bound and
   * `normalizePal` already merges unknown or missing fields over defaults.
   *
   * Optional, because friendships made before this existed have no Pal on
   * record and should keep rendering their old seeded avatar rather than
   * turning blank.
   */
  palJson?: string;
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

/** True for a write the database rules refused. */
const isPermissionDenied = (error: unknown): boolean =>
  /permission[_ ]denied/i.test(error instanceof Error ? error.message : String(error));

const reportFirebaseError = (operation: string, error: unknown): void => {
  captureError(error, { tags: { area: 'firebase-friends', operation } });
};

/** Firebase's estimate of server minus device time, or 0 if unknown. */
const readServerTimeOffset = (db: Database): Promise<number> => new Promise((resolve) => {
  const off = onValue(ref(db, '.info/serverTimeOffset'), (snapshot) => {
    off();
    const value = snapshot.val();
    resolve(typeof value === 'number' && Number.isFinite(value) ? value : 0);
  }, () => resolve(0));
});

/**
 * Whether a refused write was the per-user throttle rather than anything else.
 *
 * Asked only after a refusal, because the rules are the enforcement and the
 * common path should not pay two extra reads. Any failure here answers "no",
 * which falls back to the message the caller would have shown anyway.
 */
const wasThrottled = async (db: Database, uid: string, kind: RateLimitKind): Promise<boolean> => {
  try {
    const [stamp, offset] = await Promise.all([
      get(ref(db, rateLimitPath(uid, kind))),
      readServerTimeOffset(db),
    ]);
    return isThrottled(stamp.val(), Date.now() + offset, kind);
  } catch {
    return false;
  }
};

/** Generous for the current Pal, tight enough to bound the directory. */
export const MAX_PAL_JSON = 600;

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
  palJson?: string,
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
  const held = normalizeHandle(existingUser?.handle ?? '');
  // Renaming used to be impossible: this read `existingUser?.handle ?? input`,
  // so once a directory entry existed the name was frozen for good. The app
  // then wrote the returned (old) name back over the new one, so a rename
  // silently reverted and friends searching the new name found nobody.
  const wanted = normalizeHandle(handleInput) ?? held;
  if (!wanted) {
    return { ok: false, reason: 'Choose a name using 3 to 20 letters, numbers, or underscores.' };
  }

  const displayName = cleanDisplayName(displayNameInput) || `Player ${wanted}`;
  const displayNameIssue = publicNameIssue(displayName, 'name');
  if (displayNameIssue) {
    return { ok: false, reason: displayNameIssue };
  }

  const takenResult = (): FirebaseFriendResult<{ uid: string; handle: string }> => ({
    ok: false,
    reason: `@${wanted} is already taken.`,
    // Lets the caller keep the name the player already has rather than
    // falling back to a generated one, which would be a surprise rename.
    nameTaken: Boolean(held),
  });

  try {
    const claim = await get(ref(db, handlesPath(wanted)));
    if (claim.exists() && claim.val() !== uid) {
      return takenResult();
    }

    const record: DirectoryUser = {
      handle: wanted,
      displayName,
      updatedAt: Date.now(),
    };
    // Only include it when there is one, since the rules reject an empty or
    // oversized value and an absent Pal is a legitimate state.
    if (palJson && palJson.length <= MAX_PAL_JSON) record.palJson = palJson;

    /*
     * Claim, profile and release in one atomic write.
     *
     * This used to be three writes: a transaction on the new name, then the
     * profile, then releasing the old name. The rules now hold each account
     * to one name, which they can only check when the claim and the profile
     * arrive together: a claim is accepted only for the handle the same
     * write points the profile at, and a profile may only move off a handle
     * that the same write releases. Atomic also means a failure can no
     * longer strand the account between two names.
     *
     * Claiming a name you already hold is left out of the write, because the
     * rules treat a claim as create-or-release and refuse owner-to-owner.
     */
    const updates: Record<string, unknown> = { [usersPath(uid)]: record };
    if (!claim.exists()) {
      updates[handlesPath(wanted)] = uid;
    }
    if (held && held !== wanted) {
      const previous = await get(ref(db, handlesPath(held)));
      if (previous.exists() && previous.val() === uid) {
        updates[handlesPath(held)] = null;
      }
    }

    try {
      await updateRoot(db, updates);
    } catch (error) {
      // Somebody else can claim the name between the read above and this
      // write. The rules then refuse the claim, and that is "taken", not a
      // failure worth an error report.
      if (isPermissionDenied(error)) {
        const recheck = await get(ref(db, handlesPath(wanted)));
        if (recheck.exists() && recheck.val() !== uid) {
          return takenResult();
        }
      }
      throw error;
    }

    return { ok: true, uid, handle: wanted };
  } catch (error) {
    reportFirebaseError('publish-user-directory', error);
    console.warn('Unable to publish Firebase user directory entry.', error);
    return { ok: false, reason: getErrorMessage(error) };
  }
};

export type DirectoryMatch = { uid: string; handle: string; displayName: string };

/** The most names the autocomplete will ever ask for or show. */
export const HANDLE_SEARCH_LIMIT = 8;

/** Below this a prefix matches most of the directory, so it is not a search. */
export const HANDLE_SEARCH_MIN_PREFIX = 2;

/**
 * Names starting with `prefix`, for the add-friend autocomplete.
 *
 * Exact-name-only meant you had to already know how somebody spelled
 * themselves, and a near miss just reported that nobody exists. This issues
 * the bounded key query the rules allow: ordered by key, limited, and fenced
 * by a start and an end, so the directory still cannot be pulled down whole.
 *
 * `\uf8ff` is the last character Firebase will sort, so the range
 * `[prefix, prefix + \uf8ff]` is exactly the keys starting with the prefix.
 */
export const searchHandles = async (
  prefixInput: string,
): Promise<FirebaseFriendResult<{ matches: DirectoryMatch[] }>> => {
  const db = getConfiguredDb();
  if (!db) {
    return { ok: false, reason: NOT_CONFIGURED_REASON };
  }

  const uid = await ensureSignedIn();
  if (!uid) {
    return notSignedInResult();
  }

  // Not `normalizeHandle`: that enforces the full three character minimum, and
  // a search should narrow the list before the name is finished.
  const prefix = prefixInput.trim().toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_]/g, '');
  if (prefix.length < HANDLE_SEARCH_MIN_PREFIX) {
    return { ok: true, matches: [] };
  }

  try {
    const snapshot = await get(query(
      ref(db, 'localpoker/handles'),
      orderByKey(),
      startAt(prefix),
      endAt(`${prefix}\uf8ff`),
      limitToFirst(HANDLE_SEARCH_LIMIT),
    ));
    if (!snapshot.exists()) {
      return { ok: true, matches: [] };
    }

    const owners: { handle: string; uid: string }[] = [];
    snapshot.forEach((child) => {
      const ownerUid = child.val() as string;
      // Never offer to friend yourself.
      if (child.key && typeof ownerUid === 'string' && ownerUid !== uid) {
        owners.push({ handle: child.key, uid: ownerUid });
      }
    });

    // The display name lives on the profile, so each hit needs its own read.
    // The query limit above bounds this to a handful.
    const matches = await Promise.all(owners.map(async ({ handle, uid: ownerUid }) => {
      let displayName = `@${handle}`;
      try {
        const userSnapshot = await get(ref(db, usersPath(ownerUid)));
        const user = userSnapshot.exists() ? (userSnapshot.val() as Partial<DirectoryUser>) : null;
        displayName = cleanDisplayName(user?.displayName ?? '') || `@${handle}`;
      } catch {
        // A profile that cannot be read still has a usable name: the handle.
      }
      return { uid: ownerUid, handle, displayName: maskedPublicName(displayName) };
    }));

    return { ok: true, matches };
  } catch (error) {
    reportFirebaseError('search-handles', error);
    console.warn('Unable to search the Firebase directory.', error);
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
      return { ok: false, reason: 'No player with that name.' };
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
    return { ok: false, reason: target.reason || 'No player with that name.' };
  }
  if (target.uid === fromUid) {
    return { ok: false, reason: "That's you!" };
  }

  try {
    const existingFriend = await get(ref(db, friendPath(fromUid, target.uid)));
    if (existingFriend.exists()) {
      return { ok: false, reason: `${target.displayName} is already in your crew.` };
    }

    // There used to be a `get` on `blocks/<target>/<me>` here to check whether
    // the target had blocked the sender. Only the owner of a block list can
    // read it, so that read was rejected and the whole request failed with
    // "permission denied" for everybody, blocked or not. The rules already
    // refuse the write itself when a block exists, so the check was both
    // unauthorised and redundant; the rejection is translated below instead.

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

    await updateRoot(db, {
      [requestPath(target.uid, fromUid)]: {
        fromUid,
        fromHandle: ownHandle,
        fromName,
        createdAt: serverTimestamp() as unknown as number,
        status: 'pending',
      } satisfies FriendRequestRecord,
      // The rules accept a request only with this bump in the same write, and
      // the bump only ten seconds after the last, so deleting and resending a
      // request cannot be used to flood somebody's inbox.
      [rateLimitPath(fromUid, 'friendRequest')]: serverTimestamp(),
    });

    /*
     * No push from here any more.
     *
     * Sending one meant reading the recipient's push token, and the rules
     * granted that to anyone with a pending request. Anyone can send a
     * request, so anyone could take the token and put whatever they liked on
     * that person's lock screen. The token is now readable by accepted
     * friends only, and the recipient learns of the request from their own
     * listener in subscribeSocialGraph. The cost: a request no longer
     * notifies a phone whose app is closed. Bringing that back needs a
     * trusted sender (a Cloud Function), not a wider read.
     */

    return { ok: true, toUid: target.uid, handle: target.handle, displayName: target.displayName };
  } catch (error) {
    // The rules refuse a request for two reasons that get this far: sending
    // again inside the throttle gap, or the target having blocked the sender.
    // The throttle is checked first because it is ours to explain. Saying
    // "permission denied" for a block would be both unhelpful and a hint that
    // the block exists, so that reads as the target not accepting requests.
    if (isPermissionDenied(error)) {
      if (await wasThrottled(db, fromUid, 'friendRequest')) {
        return { ok: false, reason: RATE_LIMITED_REASON };
      }
      reportFirebaseError('send-friend-request', error);
      return { ok: false, reason: 'That player is not accepting friend requests from you.' };
    }
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
    await updateRoot(db, {
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
    await updateRoot(db, {
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
    await updateRoot(db, {
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
    await updateRoot(db, {
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
    await updateRoot(db, {
      [`${reportsPath()}/${reportRef.key}`]: {
        reporterUid: uid,
        reportedUid,
        reportedName: maskedPublicName(cleanDisplayName(reportedNameInput) || 'Reported player'),
        context,
        category: 'offensive_content',
        createdAt: serverTimestamp() as unknown as number,
        ...(roomCode ? { roomCode: roomCode.slice(0, 12) } : {}),
      } satisfies ReportRecord,
      /*
       * Reporting someone also cuts the line between you.
       *
       * Filing the report alone left them able to notify you, because a push
       * token is readable by a friend, and reporting did not end the
       * friendship. Somebody you have just reported for
       * offensive content should not still be able to put a message on your
       * lock screen.
       *
       * Done by removing the edges rather than by a client-side filter,
       * because a push arrives from Expo without passing through the app, so
       * the only thing that can actually stop it is losing the ability to
       * read the token. The security rules then enforce it rather than this
       * code promising it.
       */
      [friendPath(uid, reportedUid)]: null,
      [friendPath(reportedUid, uid)]: null,
      [requestPath(uid, reportedUid)]: null,
      [requestPath(reportedUid, uid)]: null,
      // Reports are append-only with fresh keys, so nothing else bounds how
      // many one account can file. The rules require this bump alongside
      // every report and allow one per thirty seconds.
      [rateLimitPath(uid, 'report')]: serverTimestamp(),
    });
    return { ok: true };
  } catch (error) {
    if (isPermissionDenied(error) && await wasThrottled(db, uid, 'report')) {
      return { ok: false, reason: RATE_LIMITED_REASON };
    }
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
          await updateRoot(db, cleanup);
        }
        await updateRoot(db, { [roomPath(code)]: null });
      } else if (room?.players?.[uid]) {
        await updateRoot(db, {
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

    await updateRoot(db, updates);
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
