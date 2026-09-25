import { getFirebaseApp, getDb, isFirebaseConfigured } from './config';
import { captureError } from '../telemetry';

/**
 * Firebase authentication for the app: an anonymous session by default, with an
 * optional upgrade to Google (see `googleAuth.ts`). Gives the app a real
 * `auth.uid` to build secure rules and a real identity graph on top of, while
 * still working in Expo Go. No-ops gracefully when Firebase isn't configured or
 * the Anonymous provider isn't enabled in the console, so nothing breaks before
 * that setup is done.
 */

let cachedUid: string | null = null;
let inFlight: Promise<string | null> | null = null;
let authInstance: import('firebase/auth').Auth | null = null;
let authInstanceInFlight: Promise<import('firebase/auth').Auth | null> | null = null;

export function getAuthUid(): string | null {
  return cachedUid;
}

/**
 * Record the uid of a sign-in performed elsewhere (Google, for example) so the
 * synchronous `getAuthUid` readers see it immediately rather than one auth
 * state tick later.
 */
export function noteSignedInUid(uid: string | null): void {
  cachedUid = uid;
}

/**
 * Resolve the Auth instance, with persistence wired to AsyncStorage.
 *
 * `getAuth()` on React Native defaults to **memory** persistence, so the
 * anonymous uid was regenerated on every app launch. That is far worse than it
 * sounds here: the uid is the identity that owns the claimed handle, the friend
 * edges and any hosted room, and handles are create-only in the rules. A fresh
 * uid each launch therefore orphaned the previous handle permanently, with no
 * way to reclaim it.
 *
 * `initializeAuth` may only be called once per app instance and throws if it
 * has already run, so a second call falls back to reading the existing one.
 */
async function resolveAuth(authMod: typeof import('firebase/auth'), app: ReturnType<typeof getFirebaseApp>) {
  if (!app) return null;
  try {
    const storageMod = await import('@react-native-async-storage/async-storage');
    const storage = storageMod.default;
    const withPersistence = authMod as unknown as {
      getReactNativePersistence?: (s: unknown) => unknown;
    };
    if (typeof withPersistence.getReactNativePersistence === 'function') {
      return authMod.initializeAuth(app, {
        persistence: withPersistence.getReactNativePersistence(storage) as never,
      });
    }
  } catch (error) {
    // Already initialized, or the persistence helper is unavailable in this
    // build. Either way a plain getAuth still returns a working instance.
    captureError(error, { tags: { area: 'firebase-auth', operation: 'init-persistence' } });
  }
  return authMod.getAuth(app);
}

/**
 * The one Auth instance the whole app shares. Anonymous sign-in and Google
 * sign-in must run against the same instance, or linking an anonymous account
 * to Google would silently operate on a different session.
 */
export async function getAuthInstance(): Promise<import('firebase/auth').Auth | null> {
  if (!isFirebaseConfigured()) return null;
  if (authInstance) return authInstance;
  if (authInstanceInFlight) return authInstanceInFlight;

  authInstanceInFlight = (async () => {
    try {
      const authMod = await import('firebase/auth');
      const app = getFirebaseApp();
      if (!app) return null;
      const instance = await resolveAuth(authMod, app);
      if (!instance) return null;
      authInstance = instance;
      // One listener for the life of the app keeps `cachedUid` honest no matter
      // which sign-in path ran, including a sign-out from the settings screen.
      authMod.onAuthStateChanged(instance, (user) => {
        cachedUid = user?.uid ?? null;
      });
      return instance;
    } finally {
      authInstanceInFlight = null;
    }
  })();

  return authInstanceInFlight;
}

export async function ensureSignedIn(): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  if (cachedUid) return cachedUid;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Dynamically import so bundling never fails when auth isn't used.
      const authMod = await import('firebase/auth');
      const auth = await getAuthInstance();
      if (!auth) return null;

      // Persisted sessions restore asynchronously, so currentUser can still be
      // null immediately after init. Wait one auth state tick before deciding
      // to sign in again, or every launch would mint a new anonymous user.
      const restored = await new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 2500);
        const unsub = authMod.onAuthStateChanged(auth, (u) => {
          clearTimeout(timer);
          unsub();
          resolve(u?.uid ?? null);
        });
      });
      if (restored) {
        cachedUid = restored;
        return cachedUid;
      }

      const cred = await authMod.signInAnonymously(auth);
      cachedUid = cred.user.uid;
      return cachedUid;
    } catch (error) {
      // Anonymous provider not enabled, offline, etc. Keep the app usable.
      captureError(error, { tags: { area: 'firebase-auth', operation: 'anonymous-sign-in' } });
      console.warn('Anonymous sign-in unavailable; using local identity.', error);
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Drop the Firebase session on logout. Without this, signing out of a Google
 * account and then tapping "Play as Guest" would keep writing to the Google
 * user's directory entry, friends and rooms.
 */
export async function signOutFirebase(): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const authMod = await import('firebase/auth');
    const auth = await getAuthInstance();
    if (!auth) return;
    await authMod.signOut(auth);
  } catch (error) {
    captureError(error, { tags: { area: 'firebase-auth', operation: 'sign-out' } });
  } finally {
    cachedUid = null;
  }
}

export async function deleteCurrentAuthUser(): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;

  try {
    const authMod = await import('firebase/auth');
    const auth = await getAuthInstance();
    if (!auth) return false;
    if (!auth.currentUser) {
      cachedUid = null;
      return true;
    }

    await authMod.deleteUser(auth.currentUser);
    cachedUid = null;
    return true;
  } catch (error) {
    captureError(error, { tags: { area: 'firebase-auth', operation: 'delete-current-user' } });
    console.warn('Unable to delete the Firebase user.', error);
    return false;
  }
}

/** Touch the DB reference so callers can confirm connectivity. */
export function authReady(): boolean {
  return isFirebaseConfigured() && !!getDb();
}
