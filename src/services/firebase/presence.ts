import { onValue, onDisconnect, ref, serverTimestamp, set } from 'firebase/database';
import { getDb, isFirebaseConfigured } from './config';
import { ensureSignedIn, getAuthUid } from './auth';
import { captureError } from '../telemetry';

/**
 * Who is online, for the friends list.
 *
 * Friends were previously hardcoded offline: `friendFromEdge` set
 * `online: false` and nothing ever changed it, so every friend showed a gray
 * dot and a still avatar no matter what. The only presence that existed was
 * `players/$uid/connected` *inside* a room, which says nothing about whether
 * someone is reachable to invite.
 *
 * The mechanism is deliberately the same one room presence already uses and
 * that has proven reliable: write on connect, and register an `onDisconnect`
 * so the server marks you offline even when the app dies without cleaning up.
 *
 * `.info/connected` is the local client's view of its own socket, so this also
 * re-arms after a reconnect, which a one-shot write on launch would not.
 */

const presencePath = (uid: string): string => `localpoker/presence/${uid}`;

export type PresenceRecord = {
  online: boolean;
  lastSeen: number;
};

/**
 * Publish this device's presence until the returned function is called.
 *
 * Safe to call when Firebase is unconfigured or sign-in fails; it simply does
 * nothing, because presence is a nicety and must never block the app.
 */
export const startPresence = (): (() => void) => {
  if (!isFirebaseConfigured()) return () => {};
  const db = getDb();
  if (!db) return () => {};

  let stopped = false;
  let offConnected: (() => void) | null = null;

  ensureSignedIn()
    .then((uid) => {
      if (stopped || !uid) return;
      const mine = ref(db, presencePath(uid));

      offConnected = onValue(ref(db, '.info/connected'), (snapshot) => {
        if (stopped || snapshot.val() !== true) return;
        // Register the disconnect handler *before* claiming to be online, so a
        // socket that drops between the two still gets cleaned up.
        onDisconnect(mine)
          .set({ online: false, lastSeen: serverTimestamp() })
          .then(() => set(mine, { online: true, lastSeen: serverTimestamp() }))
          .catch((error) => {
            captureError(error, { tags: { area: 'firebase-presence', operation: 'claim-online' } });
          });
      });
    })
    .catch((error) => {
      captureError(error, { tags: { area: 'firebase-presence', operation: 'start' } });
    });

  return () => {
    stopped = true;
    if (offConnected) offConnected();
    const uid = getAuthUid();
    if (!uid) return;
    // Best effort on the way out. The onDisconnect above is the guarantee.
    set(ref(db, presencePath(uid)), { online: false, lastSeen: serverTimestamp() }).catch(() => {});
  };
};

/** What a friend's own records say about them right now. */
export type FriendLive = {
  online: boolean;
  /** Their current Pal, serialised. Absent until they republish. */
  palJson?: string;
  /** Their current name, which can change after the edge was written. */
  displayName?: string;
};

/**
 * Watch a set of uids and report what is currently true of them.
 *
 * Covers both presence and the directory entry, because the friend *edge*
 * stored on our side is a snapshot from when the friendship was made. A friend
 * who later renames themselves or redesigns their Pal cannot reach into our
 * edge to update it, so the live values have to be read from their own records.
 *
 * Two listeners per uid, which is why the caller passes a bounded set: the
 * friends list. Re-subscribing on every friend-object change would thrash, so
 * the caller keys this on the uid set rather than the objects.
 */
export const subscribeFriendLive = (
  uids: readonly string[],
  cb: (live: Record<string, FriendLive>) => void,
): (() => void) => {
  if (!isFirebaseConfigured() || uids.length === 0) {
    cb({});
    return () => {};
  }
  const db = getDb();
  if (!db) {
    cb({});
    return () => {};
  }

  const state: Record<string, FriendLive> = {};
  const offs: (() => void)[] = [];
  const entry = (uid: string): FriendLive => (state[uid] ??= { online: false });

  for (const uid of uids) {
    entry(uid);

    offs.push(onValue(
      ref(db, presencePath(uid)),
      (snapshot) => {
        const value = snapshot.val() as Partial<PresenceRecord> | null;
        entry(uid).online = value?.online === true;
        cb({ ...state });
      },
      (error) => {
        // A failed read should leave the friend gray, not break the list.
        captureError(error, { tags: { area: 'firebase-presence', operation: 'subscribe-presence' } });
        entry(uid).online = false;
        cb({ ...state });
      },
    ));

    offs.push(onValue(
      ref(db, `localpoker/users/${uid}`),
      (snapshot) => {
        const value = snapshot.val() as { palJson?: string; displayName?: string } | null;
        const it = entry(uid);
        it.palJson = typeof value?.palJson === 'string' ? value.palJson : undefined;
        it.displayName = typeof value?.displayName === 'string' ? value.displayName : undefined;
        cb({ ...state });
      },
      (error) => {
        captureError(error, { tags: { area: 'firebase-presence', operation: 'subscribe-profile' } });
        cb({ ...state });
      },
    ));
  }

  return () => {
    for (const off of offs) off();
  };
};
