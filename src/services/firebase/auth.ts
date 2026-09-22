import { getFirebaseApp, getDb, isFirebaseConfigured } from './config';
import { captureError } from '../telemetry';

/**
 * Best-effort anonymous authentication. Gives the app a real `auth.uid` to build
 * secure rules and a real identity graph on top of — while still working in Expo
 * Go. No-ops gracefully when Firebase isn't configured or the Anonymous provider
 * isn't enabled in the console, so nothing breaks before that setup is done.
 */

let cachedUid: string | null = null;
let inFlight: Promise<string | null> | null = null;

export function getAuthUid(): string | null {
  return cachedUid;
}

export async function ensureSignedIn(): Promise<string | null> {
  if (!isFirebaseConfigured()) return null;
  if (cachedUid) return cachedUid;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Dynamically import so bundling never fails when auth isn't used.
      const authMod = await import('firebase/auth');
      const app = getFirebaseApp();
      if (!app) return null;
      const auth = authMod.getAuth(app);

      const existing = auth.currentUser;
      if (existing) {
        cachedUid = existing.uid;
        return cachedUid;
      }

      const cred = await authMod.signInAnonymously(auth);
      cachedUid = cred.user.uid;

      authMod.onAuthStateChanged(auth, (u) => {
        cachedUid = u?.uid ?? null;
      });

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

/** Touch the DB reference so callers can confirm connectivity. */
export function authReady(): boolean {
  return isFirebaseConfigured() && !!getDb();
}
