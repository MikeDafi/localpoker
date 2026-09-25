import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { captureError } from '../telemetry';

declare const process: { env: Record<string, string | undefined> };

/**
 * Every one of these must be a *literal* `process.env.EXPO_PUBLIC_...` member
 * expression.
 *
 * `babel-preset-expo` inlines `EXPO_PUBLIC_` variables by rewriting exactly
 * that syntax at build time. There is no `process.env` object left at runtime
 * in a release bundle, so the obvious-looking `readEnv('EXPO_PUBLIC_...')`
 * helper silently returned `undefined` in every production build: online play
 * was dead in TestFlight while working fine in development, where Metro still
 * provides the object.
 *
 * The `?? undefined` and trimming below keep the previous behaviour of treating
 * a blank value as "not configured".
 */
const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const firebaseConfig: FirebaseOptions = {
  apiKey: clean(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: clean(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  databaseURL: clean(process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL),
  projectId: clean(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: clean(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: clean(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: clean(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
};

let cachedDb: Database | null = null;
let initFailed = false;

/** Returns true when the Firebase env vars required for online play are present. */
export const isFirebaseConfigured = (): boolean =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId);

/** Lazily initializes Firebase Realtime Database, or returns null in offline/no-op mode. */
export const getDb = (): Database | null => {
  if (!isFirebaseConfigured() || initFailed) {
    return null;
  }

  if (cachedDb) {
    return cachedDb;
  }

  try {
    const app = getFirebaseApp();
    if (!app) return null;
    cachedDb = getDatabase(app);
    return cachedDb;
  } catch (error) {
    initFailed = true;
    captureError(error, { tags: { area: 'firebase', operation: 'initialize-database' } });
    console.warn('Firebase initialization failed; online play is disabled.', error);
    return null;
  }
};

/**
 * Returns the shared Firebase app initialized with the FULL config. All Firebase
 * services (db, auth) must use this so the app is never initialized with an empty
 * config (which breaks `getDatabase` with "Can't determine Firebase Database URL").
 */
export const getFirebaseApp = () => {
  if (!isFirebaseConfigured()) return null;
  return getApps()[0] ?? initializeApp(firebaseConfig);
};
