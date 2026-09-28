import { get, ref, remove, serverTimestamp, set } from 'firebase/database';
import { getDb, isFirebaseConfigured } from './config';
import { ensureSignedIn, getAuthUid } from './auth';
import { captureError } from '../telemetry';

/**
 * Push notifications, sent device to device.
 *
 * Spark has no Cloud Functions, so there is no trusted server to hold tokens
 * and fan out sends. The same constraint already forces the host to deal, and
 * the answer here is the same shape: the device that causes the event sends the
 * push itself, straight to Expo's push service, which accepts an ordinary HTTPS
 * POST and needs no server secret.
 *
 * That makes **read scope the entire security question**. A push token is a
 * capability: anyone who can read yours can notify you, repeatedly, from
 * anywhere. So tokens are readable only where a legitimate send exists, which
 * for the two events we support means the reader is already an accepted friend.
 * Writing is restricted to the owner. The rules enforce both; this module must
 * not be the only thing standing between a token and a stranger.
 *
 * Deliberately not covered: turn alerts. They would fire on every action, which
 * is the fastest way to make an app feel like spam and get notifications turned
 * off wholesale, taking the useful ones with them.
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

const tokenPath = (uid: string): string => `localpoker/pushTokens/${uid}`;

export type PushKind = 'friend-request' | 'room-invite';

/**
 * What a recipient is told, per event.
 *
 * Kept here rather than at the call sites so the wording, and the decision
 * about what is worth interrupting someone for, lives in one place.
 */
const MESSAGES: Record<PushKind, (from: string, extra?: string) => { title: string; body: string }> = {
  'friend-request': (from) => ({
    title: 'New friend request',
    body: `@${from} wants to play poker with you.`,
  }),
  'room-invite': (from, code) => ({
    title: `@${from} opened a table`,
    body: code ? `Join with code ${code}.` : 'Tap to join the table.',
  }),
};

/** Expo issues tokens in this shape; anything else is not worth posting. */
const isExpoPushToken = (value: unknown): value is string =>
  typeof value === 'string' && /^ExponentPushToken\[[^\]]+\]$/.test(value);

/**
 * Store this device's push token so friends can reach us.
 *
 * Called after permission is granted. Storing it is what makes the capability
 * exist, so it is never stored without permission having been asked for.
 */
export const publishPushToken = async (token: string): Promise<boolean> => {
  if (!isFirebaseConfigured() || !isExpoPushToken(token)) return false;
  const db = getDb();
  if (!db) return false;

  const uid = await ensureSignedIn();
  if (!uid) return false;

  try {
    await set(ref(db, tokenPath(uid)), { token, updatedAt: serverTimestamp() });
    return true;
  } catch (error) {
    captureError(error, { tags: { area: 'push', operation: 'publish-token' } });
    return false;
  }
};

/**
 * Drop the token.
 *
 * Signing out has to revoke the capability, or a shared device keeps notifying
 * whoever used it last about somebody else's friend requests.
 */
export const clearPushToken = async (): Promise<void> => {
  if (!isFirebaseConfigured()) return;
  const db = getDb();
  const uid = getAuthUid();
  if (!db || !uid) return;
  try {
    await remove(ref(db, tokenPath(uid)));
  } catch (error) {
    captureError(error, { tags: { area: 'push', operation: 'clear-token' } });
  }
};

/**
 * Most recent send per recipient, to stop a legitimately readable token being
 * used to hammer someone. In memory on purpose: it bounds a single misbehaving
 * client, and anything stronger needs the server we do not have.
 */
const lastSentAt = new Map<string, number>();
const MIN_GAP_MS = 60_000;

const rateLimited = (toUid: string, kind: PushKind): boolean => {
  const key = `${toUid}:${kind}`;
  const now = Date.now();
  const previous = lastSentAt.get(key) ?? 0;
  if (now - previous < MIN_GAP_MS) return true;
  lastSentAt.set(key, now);
  return false;
};

/**
 * Notify one person about one thing.
 *
 * Never throws and never blocks the caller's real work: a friend request that
 * succeeded must not look like it failed because a push did. Returns whether
 * the push went out, which is useful in tests and uninteresting in the app.
 */
export const sendPush = async (
  toUid: string,
  kind: PushKind,
  fromName: string,
  extra?: string,
): Promise<boolean> => {
  if (!isFirebaseConfigured() || !toUid || !fromName) return false;
  const db = getDb();
  if (!db) return false;
  if (rateLimited(toUid, kind)) return false;

  try {
    const snapshot = await get(ref(db, tokenPath(toUid)));
    if (!snapshot.exists()) return false;
    const token = (snapshot.val() as { token?: unknown } | null)?.token;
    if (!isExpoPushToken(token)) return false;

    const { title, body } = MESSAGES[kind](fromName, extra);
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        // Lets a tap open the right screen instead of just the app.
        data: { kind, code: extra ?? null },
      }),
    });
    return response.ok;
  } catch (error) {
    // A push that cannot be read or sent is not an error the user should ever
    // see, because the thing they actually did already worked.
    captureError(error, { tags: { area: 'push', operation: `send-${kind}` } });
    return false;
  }
};
