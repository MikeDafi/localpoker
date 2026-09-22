import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { captureError } from '../telemetry';

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const readEnv = (key: string): string | undefined => {
  const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const firebaseConfig: FirebaseOptions = {
  apiKey: readEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: readEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  databaseURL: readEnv('EXPO_PUBLIC_FIREBASE_DATABASE_URL'),
  projectId: readEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
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
