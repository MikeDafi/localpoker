import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Google sign-in exists to stop the Firebase uid from being device-bound: that
 * uid owns the claimed handle, the friend edges and any hosted room, and
 * handles are create-only in the rules, so losing it orphans the account.
 *
 * These tests pin the two behaviours that protect that identity: an anonymous
 * session is *linked* rather than replaced (same uid, same handle), and a
 * Google account that already has a Firebase user wins over the throwaway
 * anonymous one.
 */

const configured = { value: true };
const noteSignedInUid = vi.fn<(uid: string | null) => void>();

const authState: {
  currentUser: { uid: string; isAnonymous: boolean } | null;
} = { currentUser: null };

const linkWithCredential = vi.fn();
const signInWithCredential = vi.fn();

vi.mock('../config', () => ({
  isFirebaseConfigured: () => configured.value,
  getFirebaseApp: () => ({}),
  getDb: () => ({}),
}));

vi.mock('../auth', () => ({
  getAuthInstance: async () => authState,
  noteSignedInUid: (uid: string | null) => noteSignedInUid(uid),
}));

vi.mock('../../telemetry', () => ({
  captureError: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: (idToken: string) => ({ idToken }) },
  linkWithCredential: (...args: unknown[]) => linkWithCredential(...args),
  signInWithCredential: (...args: unknown[]) => signInWithCredential(...args),
}));

const withCode = (code: string): Error => Object.assign(new Error(code), { code });

const googleUser = (uid: string) => ({
  user: { uid, email: 'ada@example.com', displayName: 'Ada Lovelace' },
});

describe('googleSignUpField', () => {
  it('seeds the name from the email local part', async () => {
    const { googleSignUpField } = await import('../googleAuth');
    expect(
      googleSignUpField({ uid: 'u1', email: 'ada.lovelace@example.com', displayName: 'Ada', linked: false }),
    ).toEqual({ name: 'ada.lovelace' });
  });

  it('leaves the name undefined when Google gives us nothing, so login falls back', async () => {
    const { googleSignUpField } = await import('../googleAuth');
    expect(googleSignUpField({ uid: 'u1', email: null, displayName: null, linked: false })).toEqual({
      name: undefined,
    });
    expect(googleSignUpField({ uid: 'u1', email: '', displayName: '   ', linked: false })).toEqual({
      name: undefined,
    });
  });
});

describe('isGoogleSignInConfigured', () => {
  beforeEach(() => {
    configured.value = true;
  });

  it('is false on a platform with no client ID of its own', async () => {
    const { isGoogleSignInConfigured } = await import('../googleAuth');
    // No Android client ID is set, and falling back to the web one would be
    // rejected by Google for an installed app, so the button must stay hidden.
    expect(isGoogleSignInConfigured('android')).toBe(false);
  });

  it('is false everywhere when Firebase itself is unconfigured', async () => {
    configured.value = false;
    const { isGoogleSignInConfigured } = await import('../googleAuth');
    expect(isGoogleSignInConfigured('ios')).toBe(false);
    expect(isGoogleSignInConfigured('web')).toBe(false);
  });
});

describe('signInWithGoogleIdToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured.value = true;
    authState.currentUser = null;
  });

  it('links the anonymous session so the uid, and its handle, survive', async () => {
    authState.currentUser = { uid: 'anon-uid', isAnonymous: true };
    linkWithCredential.mockResolvedValue(googleUser('anon-uid'));

    const { signInWithGoogleIdToken } = await import('../googleAuth');
    const result = await signInWithGoogleIdToken('id-token');

    expect(linkWithCredential).toHaveBeenCalledTimes(1);
    expect(signInWithCredential).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      identity: { uid: 'anon-uid', email: 'ada@example.com', displayName: 'Ada Lovelace', linked: true },
    });
    expect(noteSignedInUid).toHaveBeenCalledWith('anon-uid');
  });

  it('signs into the existing Google account when the credential is already claimed', async () => {
    authState.currentUser = { uid: 'anon-uid', isAnonymous: true };
    linkWithCredential.mockRejectedValue(withCode('auth/credential-already-in-use'));
    signInWithCredential.mockResolvedValue(googleUser('google-uid'));

    const { signInWithGoogleIdToken } = await import('../googleAuth');
    const result = await signInWithGoogleIdToken('id-token');

    expect(result.ok).toBe(true);
    expect(result.ok && result.identity.uid).toBe('google-uid');
    expect(noteSignedInUid).toHaveBeenCalledWith('google-uid');
  });

  it('signs in directly when there is no anonymous session to keep', async () => {
    signInWithCredential.mockResolvedValue(googleUser('google-uid'));

    const { signInWithGoogleIdToken } = await import('../googleAuth');
    const result = await signInWithGoogleIdToken('id-token');

    expect(linkWithCredential).not.toHaveBeenCalled();
    expect(result.ok && result.identity.uid).toBe('google-uid');
  });

  it('reports a failure instead of throwing when linking breaks for another reason', async () => {
    authState.currentUser = { uid: 'anon-uid', isAnonymous: true };
    linkWithCredential.mockRejectedValue(withCode('auth/network-request-failed'));

    const { signInWithGoogleIdToken } = await import('../googleAuth');
    const result = await signInWithGoogleIdToken('id-token');

    expect(result.ok).toBe(false);
    expect(signInWithCredential).not.toHaveBeenCalled();
    expect(noteSignedInUid).not.toHaveBeenCalled();
  });

  it('reports the link so the guest keeps the coins and stats they just earned', async () => {
    authState.currentUser = { uid: 'anon-uid', isAnonymous: true };
    linkWithCredential.mockResolvedValue(googleUser('anon-uid'));

    const { signInWithGoogleIdToken } = await import('../googleAuth');
    const result = await signInWithGoogleIdToken('id-token');

    // `linked` is what tells the caller to adopt the guest's local data rather
    // than park it and hand the account a fresh profile.
    expect(result.ok && result.identity.linked).toBe(true);
  });

  it('does not report a link when signing into a separate existing account', async () => {
    authState.currentUser = { uid: 'anon-uid', isAnonymous: true };
    linkWithCredential.mockRejectedValue(withCode('auth/credential-already-in-use'));
    signInWithCredential.mockResolvedValue(googleUser('google-uid'));

    const { signInWithGoogleIdToken } = await import('../googleAuth');
    const result = await signInWithGoogleIdToken('id-token');

    expect(result.ok && result.identity.linked).toBe(false);
  });

  it('refuses up front when the build has no Firebase config', async () => {
    configured.value = false;

    const { signInWithGoogleIdToken, isGoogleSignInConfigured } = await import('../googleAuth');
    expect(isGoogleSignInConfigured('ios')).toBe(false);
    expect(await signInWithGoogleIdToken('id-token')).toEqual({
      ok: false,
      reason: 'Online play is not configured in this build.',
    });
  });
});
