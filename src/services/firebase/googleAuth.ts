import { isFirebaseConfigured } from './config';
import { getAuthInstance, noteSignedInUid } from './auth';
import { captureError } from '../telemetry';

/**
 * Google sign-in, the only durable identity the app offers.
 *
 * An anonymous uid dies with the install: it owns the claimed handle, the
 * friend edges and any hosted room, and handles are create-only in the rules,
 * so a reinstall used to orphan all of that permanently. Signing in with Google
 * pins the uid to the Google account instead, so the same person gets the same
 * identity on a new device.
 *
 * The client IDs below are public OAuth identifiers that ship inside the app
 * binary. They are read from the environment only to match how the rest of the
 * Firebase config is wired, not because they are secret.
 */

export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
export const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export type GoogleIdentity = {
  uid: string;
  email: string | null;
  displayName: string | null;
  /**
   * True when the anonymous session was upgraded in place, so this uid is the
   * one the guest was already playing as. The caller uses this to keep the
   * guest's local coins, stats and Pal instead of starting the account fresh.
   */
  linked: boolean;
};

export type GoogleSignInResult =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; reason: string };

/**
 * True when this platform has the client ID its OAuth request needs.
 *
 * Checked per platform on purpose. `useAuthRequest` picks `iosClientId` on iOS
 * and `androidClientId` on Android, falling back to the generic `clientId`; on
 * Android that fallback is the *web* client, which Google rejects for an
 * installed app. Without this the button would render on Android and fail at
 * the consent screen.
 */
export function isGoogleSignInConfigured(platform: string): boolean {
  if (!isFirebaseConfigured()) return false;
  if (platform === 'ios') return Boolean(GOOGLE_IOS_CLIENT_ID);
  if (platform === 'android') return Boolean(GOOGLE_ANDROID_CLIENT_ID);
  return Boolean(GOOGLE_WEB_CLIENT_ID);
}

/**
 * Errors that mean "this Google account already has its own Firebase user", so
 * the anonymous account cannot absorb it and we sign into the existing one.
 */
const ALREADY_CLAIMED = new Set([
  'auth/credential-already-in-use',
  'auth/email-already-in-use',
  'auth/account-exists-with-different-credential',
  'auth/provider-already-linked',
]);

const errorCode = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

const SIGN_IN_FAILED = 'Google sign-in did not complete. Check your connection and try again.';

/**
 * Turn a Google id token into a Firebase session.
 *
 * When the current session is anonymous the credential is *linked* rather than
 * swapped in, which keeps the uid and therefore the handle, friends and stats
 * that uid already owns. If that Google account is already a Firebase user, the
 * link is rejected and we sign into the existing account instead, since that is
 * the identity with the real history.
 */
export async function signInWithGoogleIdToken(idToken: string): Promise<GoogleSignInResult> {
  if (!isFirebaseConfigured()) {
    return { ok: false, reason: 'Online play is not configured in this build.' };
  }

  try {
    const authMod = await import('firebase/auth');
    const auth = await getAuthInstance();
    if (!auth) {
      return { ok: false, reason: SIGN_IN_FAILED };
    }

    const credential = authMod.GoogleAuthProvider.credential(idToken);
    const anonymous = auth.currentUser?.isAnonymous ? auth.currentUser : null;

    let user: import('firebase/auth').User;
    let linked = false;
    if (anonymous) {
      try {
        user = (await authMod.linkWithCredential(anonymous, credential)).user;
        // Linking keeps the anonymous uid, so the guest who was playing a
        // moment ago and this Google account are the same person.
        linked = true;
      } catch (error) {
        if (!ALREADY_CLAIMED.has(errorCode(error))) throw error;
        user = (await authMod.signInWithCredential(auth, credential)).user;
      }
    } else {
      user = (await authMod.signInWithCredential(auth, credential)).user;
    }

    noteSignedInUid(user.uid);
    return {
      ok: true,
      identity: { uid: user.uid, email: user.email, displayName: user.displayName, linked },
    };
  } catch (error) {
    captureError(error, { tags: { area: 'firebase-auth', operation: 'google-sign-in' } });
    return { ok: false, reason: SIGN_IN_FAILED };
  }
}

/**
 * The name to seed a brand new account with, taken from the Google address.
 * It is only a suggestion: `login` normalises it and the directory falls back
 * to a friend code when it is taken or unusable. An account that already has a
 * name keeps it, so signing in never renames you.
 */
export function googleSignUpField(identity: GoogleIdentity): { name?: string } {
  const name = identity.email?.split('@')[0]?.trim();
  return { name: name || undefined };
}
