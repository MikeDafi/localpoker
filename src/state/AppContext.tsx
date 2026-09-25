import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PalConfig, randomPal, normalizePal, palFromSeed } from '../avatar/palConfig';
import { GameSettings, DEFAULT_GAME_SETTINGS, normalizeSettings } from '../game/settings';
import {
  Stats, HandResult, DEFAULT_STATS, applyHandResult, derivedStats as computeDerived, mergeStats,
} from '../game/stats';
import { sound } from '../services/sound';
import { installTextScaling, setLargeText } from '../theme/textScale';
import { setAppReduceMotion } from '../theme/motionPreference';
import { captureError } from '../services/telemetry';
import {
  acceptFriendRequest as acceptFirebaseFriendRequest,
  blockUser as blockFirebaseUser,
  deleteOnlineAccount,
  declineFriendRequest as declineFirebaseFriendRequest,
  isFirebaseConfigured,
  normalizeHandle,
  publishUserDirectory,
  removeFriendship,
  reportUser as reportFirebaseUser,
  sendFriendRequest,
  signOutFirebase,
  subscribeSocialGraph,
  type BlockRecord,
  type FriendEdgeRecord,
  type FriendRequestRecord,
  type ReportContext,
  type SocialSnapshot,
} from '../services/firebase';
import { publicNameIssue } from '../moderation/contentFilter';
import {
  GUEST_ACCOUNT,
  accountBundleKey,
  isAccountBundleKey,
  restoreAccountBundle,
  type AccountBundle,
} from './accountBundle';

export interface Profile {
  id: string;
  name: string;
  pal: PalConfig;
  coins: number;
  xp: number;
}

const profileHandleFallback = (profile: Profile): string => friendCodeFor(profile.id).toLowerCase();

const handleForDirectory = (auth: AuthState, profile: Profile): string =>
  normalizeHandle(auth.handle ?? '') ?? normalizeHandle(profile.name) ?? profileHandleFallback(profile);

const friendFromEdge = (edge: FriendEdgeRecord): Friend => ({
  id: edge.uid,
  uid: edge.uid,
  handle: edge.handle,
  name: edge.displayName,
  palSeed: edge.handle || edge.uid,
  online: false,
  status: 'Friends',
  friendshipStatus: 'accepted',
});

const friendFromRequest = (request: FriendRequestRecord): Friend => ({
  id: request.fromUid,
  uid: request.fromUid,
  handle: request.fromHandle,
  name: request.fromName,
  palSeed: request.fromHandle || request.fromUid,
  online: false,
  status: 'Friend request received',
  friendshipStatus: 'incoming',
});

const mergeSocialFriends = (current: Friend[], snapshot: SocialSnapshot): Friend[] => {
  const blockedUids = new Set(snapshot.blocked.map((blocked) => blocked.uid));
  const accepted = snapshot.accepted
    .filter((friend) => !blockedUids.has(friend.uid))
    .map(friendFromEdge);
  const incoming = snapshot.incoming
    .filter((request) => !blockedUids.has(request.fromUid))
    .filter((request) => !accepted.some((friend) => friend.uid === request.fromUid))
    .map(friendFromRequest);
  const remoteUids = new Set([
    ...accepted.map((friend) => friend.uid ?? friend.id),
    ...incoming.map((friend) => friend.uid ?? friend.id),
  ]);
  const pending = current.filter((friend) => {
    if (friend.friendshipStatus !== 'pending_outgoing') {
      return false;
    }
    return !remoteUids.has(friend.uid ?? friend.id);
  });

  return [...incoming, ...accepted, ...pending];
};

export interface AuthState {
  loggedIn: boolean;
  provider: 'guest' | 'apple' | 'google' | 'email' | null;
  handle: string | null;
}

export interface Friend {
  id: string;
  uid?: string;
  handle?: string;
  name: string;
  palSeed: string;
  online: boolean;
  status?: string;
  friendshipStatus?: 'accepted' | 'pending_outgoing' | 'incoming' | 'local';
}

export interface BlockedUser {
  uid: string;
  handle?: string;
  name: string;
  blockedAt: number;
}

export type { Stats, HandResult } from '../game/stats';

const PROFILE_KEY = '@pokerpals/profile';
const STATS_KEY = '@pokerpals/stats';
const AUTH_KEY = '@pokerpals/auth';
const FRIENDS_KEY = '@pokerpals/friends';
const SETTINGS_KEY = '@pokerpals/settings';
const SAVED_GAME_KEY = '@pokerpals/savedgame';
const AGE_KEY = '@pokerpals/ageVerified';
const BLOCKS_KEY = '@pokerpals/blocks';

/**
 * Which account the keys above currently hold. See `accountBundle.ts` for why
 * account data is keyed rather than stored once per device.
 *
 * Settings and age verification are deliberately excluded: those are device
 * preferences, not account data, and should survive a switch.
 */
const ACTIVE_ACCOUNT_KEY = '@pokerpals/activeAccount';

type Bundle = AccountBundle<Profile, Friend, BlockedUser, SavedGame>;

type ActionResult = { ok: boolean; reason?: string };

const blockedFromRecord = (record: BlockRecord): BlockedUser => ({
  uid: record.uid,
  handle: record.handle,
  name: record.displayName,
  blockedAt: record.createdAt,
});

const reportStorageError = (operation: string, key: string, error: unknown): void => {
  captureError(error, { tags: { area: 'async-storage', operation, key } });
};

const ADJ = ['mighty', 'lucky', 'sneaky', 'royal', 'turbo', 'cosmic', 'wild', 'golden'];
const NOUN = ['ace', 'shark', 'bluff', 'chip', 'river', 'joker', 'king', 'bandit'];
/**
 * The one name is also the handle other players add you by, so the generated
 * starter has to be handle-shaped: lowercase, no spaces, and unique enough that
 * two fresh installs rarely collide on the claim.
 */
function randomName(): string {
  const adj = ADJ[Math.floor(Math.random() * ADJ.length)];
  const noun = NOUN[Math.floor(Math.random() * NOUN.length)];
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `${adj}_${noun}${suffix}`;
}
function makeDefaultProfile(): Profile {
  const id = 'me-' + Math.random().toString(36).slice(2, 10);
  return { id, name: randomName(), pal: randomPal(), coins: 5000, xp: 0 };
}

/** A short, shareable friend code derived from a stable user id. */
export function friendCodeFor(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) { out += chars[h % chars.length]; h = Math.floor(h / chars.length) + (i + 1) * 2654435761; h = h >>> 0; }
  return out;
}

export interface SavedGame {
  stateJson: string;
  settings: GameSettings;
  seed: number;
  roomCode?: string;
  handNumber: number;
  savedAt: number;
  /** Wall-clock time the current turn's countdown began, so resume can carry over remaining time. */
  turnStartedAt?: number;
}

interface AppContextValue {
  ready: boolean;
  auth: AuthState;
  ageVerified: boolean;
  verifyAge: (birthYear: number) => { ok: boolean; reason?: string };
  profile: Profile;
  stats: Stats;
  friends: Friend[];
  settings: GameSettings;
  savedGame: SavedGame | null;
  blockedUsers: BlockedUser[];
  /**
   * Bumped when the Large Text scale changes. Nothing reads the value: it is
   * here so the context identity changes and every screen re-renders at the
   * new size.
   */
  textScaleTick: number;
  login: (
    provider: AuthState['provider'],
    options?: { accountKey?: string; name?: string },
  ) => Promise<ActionResult>;
  logout: () => void;
  updateProfile: (patch: Partial<Profile>) => ActionResult;
  setPal: (pal: PalConfig) => void;
  addCoins: (n: number) => void;
  recordHand: (r: HandResult) => number;
  addFriend: (name: string) => Promise<ActionResult>;
  acceptFriendRequest: (id: string) => Promise<ActionResult>;
  declineFriendRequest: (id: string) => Promise<ActionResult>;
  removeFriend: (id: string) => void;
  blockUser: (uid: string, name: string, handle?: string) => Promise<ActionResult>;
  reportUser: (uid: string, name: string, context: ReportContext, roomCode?: string) => Promise<ActionResult>;
  deleteAccount: () => Promise<ActionResult>;
  isBlocked: (uid: string) => boolean;
  updateSettings: (patch: Partial<GameSettings>) => void;
  resetStats: () => void;
  saveGame: (g: SavedGame) => void;
  clearSavedGame: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<AuthState>({ loggedIn: false, provider: null, handle: null });
  const [ageVerified, setAgeVerified] = useState(false);
  const [profile, setProfile] = useState<Profile>(makeDefaultProfile);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [savedGame, setSavedGame] = useState<SavedGame | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const activeAccount = useRef<string>(GUEST_ACCOUNT);

  useEffect(() => {
    (async () => {
      try {
        const [p, s, a, f, st, g, av, b, acct] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY), AsyncStorage.getItem(STATS_KEY),
          AsyncStorage.getItem(AUTH_KEY), AsyncStorage.getItem(FRIENDS_KEY),
          AsyncStorage.getItem(SETTINGS_KEY), AsyncStorage.getItem(SAVED_GAME_KEY),
          AsyncStorage.getItem(AGE_KEY), AsyncStorage.getItem(BLOCKS_KEY),
          AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY),
        ]);
        activeAccount.current = acct || GUEST_ACCOUNT;
        if (p) { const parsed = JSON.parse(p); setProfile({ ...makeDefaultProfile(), ...parsed, pal: normalizePal(parsed.pal) }); }
        else {
          // First launch on this device: commit the generated identity so
          // "Play as Guest" resolves to the same user on every future launch
          // (the merge above keeps this id stable once it's persisted).
          setProfile((prev) => {
            AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(prev)).catch((error) => {
              reportStorageError('first-launch-profile-persist', PROFILE_KEY, error);
            });
            return prev;
          });
        }
        if (s) setStats(mergeStats(JSON.parse(s)));
        if (a) setAuth(JSON.parse(a));
        if (f) setFriends(JSON.parse(f));
        if (st) setSettings(normalizeSettings(JSON.parse(st)));
        if (g) setSavedGame(JSON.parse(g));
        if (av === 'true') setAgeVerified(true);
        if (b) setBlockedUsers(JSON.parse(b));
      } catch (error) {
        captureError(error, { tags: { area: 'async-storage', operation: 'hydrate-app-state' } });
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    sound.configure({ enabled: settings.soundEnabled, volume: settings.soundVolume / 100 });
  }, [settings.soundEnabled, settings.soundVolume]);

  /**
   * Large Text is a global scale rather than a prop, so nothing re-renders on
   * its own when it changes. Bumping a counter that rides along in the context
   * value is what pushes the new size out to every screen reading `useApp`.
   */
  const [textScaleTick, setTextScaleTick] = useState(0);
  useEffect(() => {
    installTextScaling();
    if (setLargeText(settings.largeText)) setTextScaleTick((n) => n + 1);
  }, [settings.largeText]);

  // Reduce Motion has to reach presentational components that never see the
  // settings object, so it is published rather than passed.
  useEffect(() => {
    setAppReduceMotion(settings.reduceMotion || settings.animationSpeed === 'off');
  }, [settings.reduceMotion, settings.animationSpeed]);

  const persist = useCallback((key: string, value: unknown) => {
    AsyncStorage.setItem(key, JSON.stringify(value)).catch((error) => {
      reportStorageError('persist', key, error);
    });
  }, []);

  const persistProfile = useCallback((next: Profile) => { setProfile(next); persist(PROFILE_KEY, next); }, [persist]);
  const persistStats = useCallback((next: Stats) => { setStats(next); persist(STATS_KEY, next); }, [persist]);
  const persistAuth = useCallback((next: AuthState) => { setAuth(next); persist(AUTH_KEY, next); }, [persist]);
  const persistFriends = useCallback((next: Friend[]) => { setFriends(next); persist(FRIENDS_KEY, next); }, [persist]);
  const persistBlocked = useCallback((next: BlockedUser[]) => { setBlockedUsers(next); persist(BLOCKS_KEY, next); }, [persist]);

  const publishDirectory = useCallback(async (nextAuth: AuthState, nextProfile: Profile): Promise<string | null> => {
    if (!nextAuth.loggedIn || !isFirebaseConfigured()) {
      return null;
    }

    const desiredHandle = handleForDirectory(nextAuth, nextProfile);
    let result = await publishUserDirectory(desiredHandle, desiredHandle);
    if (!result.ok && desiredHandle !== profileHandleFallback(nextProfile)) {
      const fallback = profileHandleFallback(nextProfile);
      result = await publishUserDirectory(fallback, fallback);
    }
    // The server is the authority on which name you actually hold, so the
    // confirmed one is written back to both places the app reads it from.
    // There is only one name now; `auth.handle` is its claim record.
    if (result.ok && result.handle) {
      if (nextAuth.handle !== result.handle) {
        persistAuth({ ...nextAuth, handle: result.handle });
      }
      if (nextProfile.name !== result.handle) {
        persistProfile({ ...nextProfile, name: result.handle });
      }
    }
    return result.ok ? result.handle : null;
  }, [persistAuth, persistProfile]);

  /**
   * Park the outgoing account's local data and restore the incoming account's.
   *
   * Without this, signing out of one Google account and into another left the
   * first account's name, Pal, coins, stats and friends in place, so the second
   * account inherited them and then overwrote the name.
   */
  const switchAccount = useCallback(async (nextAccount: string): Promise<Bundle | null> => {
    const current = activeAccount.current;
    if (current === nextAccount) return null;

    try {
      const outgoing: Bundle = { profile, stats, friends, blockedUsers, savedGame };
      await AsyncStorage.setItem(accountBundleKey(current), JSON.stringify(outgoing));

      const stored = await AsyncStorage.getItem(accountBundleKey(nextAccount));
      const incoming = restoreAccountBundle<Profile, Friend, BlockedUser, SavedGame>(stored, {
        makeProfile: makeDefaultProfile,
        mergeStats,
        normalizePal,
        defaultStats: DEFAULT_STATS,
      });

      activeAccount.current = nextAccount;
      setProfile(incoming.profile);
      setStats(incoming.stats);
      setFriends(incoming.friends);
      setBlockedUsers(incoming.blockedUsers);
      setSavedGame(incoming.savedGame);

      await AsyncStorage.multiSet([
        [ACTIVE_ACCOUNT_KEY, nextAccount],
        [PROFILE_KEY, JSON.stringify(incoming.profile)],
        [STATS_KEY, JSON.stringify(incoming.stats)],
        [FRIENDS_KEY, JSON.stringify(incoming.friends)],
        [BLOCKS_KEY, JSON.stringify(incoming.blockedUsers)],
        [SAVED_GAME_KEY, JSON.stringify(incoming.savedGame)],
      ]);
      return incoming;
    } catch (error) {
      captureError(error, { tags: { area: 'async-storage', operation: 'switch-account' } });
      return null;
    }
  }, [blockedUsers, friends, profile, savedGame, stats]);

  const login = useCallback(async (
    provider: AuthState['provider'],
    options: { accountKey?: string; name?: string } = {},
  ): Promise<ActionResult> => {
    const requested = options.name?.trim();
    if (requested && !normalizeHandle(requested)) {
      return { ok: false, reason: 'Choose a name using 3 to 20 letters, numbers, or underscores.' };
    }

    // Swap in this account's own data first, so the name resolved below is
    // written against the right account rather than the previous one's.
    const switched = await switchAccount(options.accountKey || GUEST_ACCOUNT);
    const baseProfile = switched?.profile ?? profile;

    const name = normalizeHandle(requested ?? '')
      ?? normalizeHandle(baseProfile.name)
      ?? profileHandleFallback(baseProfile);

    const nextProfile = { ...baseProfile, name };
    const nextAuth = { loggedIn: true, provider, handle: name };
    persistAuth(nextAuth);
    persistProfile(nextProfile);
    publishDirectory(nextAuth, nextProfile).catch((error) => {
      captureError(error, { tags: { area: 'firebase-friends', operation: 'login-publish-directory' } });
    });
    return { ok: true };
  }, [persistAuth, persistProfile, profile, publishDirectory, switchAccount]);

  useEffect(() => {
    if (!ready || !auth.loggedIn) {
      return;
    }

    publishDirectory(auth, profile).catch((error) => {
      captureError(error, { tags: { area: 'firebase-friends', operation: 'profile-publish-directory' } });
    });
  }, [auth, profile, publishDirectory, ready]);

  useEffect(() => {
    if (!ready || !auth.loggedIn || !isFirebaseConfigured()) {
      return undefined;
    }

    return subscribeSocialGraph((snapshot) => {
      const nextBlocked = snapshot.blocked.map(blockedFromRecord);
      persist(BLOCKS_KEY, nextBlocked);
      setBlockedUsers(nextBlocked);
      setFriends((prev) => {
        const next = mergeSocialFriends(prev, snapshot);
        persist(FRIENDS_KEY, next);
        return next;
      });
    });
  }, [auth.loggedIn, persist, ready]);

  const verifyAge = useCallback((birthYear: number): { ok: boolean; reason?: string } => {
    const year = Number(birthYear);
    const now = new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1900 || year > now) {
      return { ok: false, reason: 'Enter a valid birth year.' };
    }
    if (now - year < 18) {
      return { ok: false, reason: 'You must be 18 or older to play.' };
    }
    setAgeVerified(true);
    AsyncStorage.setItem(AGE_KEY, 'true').catch((error) => {
      reportStorageError('persist-age-verification', AGE_KEY, error);
    });
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    // Drop the Firebase session too. Leaving it signed in would keep the next
    // "Play as Guest" writing to the account that just signed out.
    signOutFirebase().catch((error) => {
      captureError(error, { tags: { area: 'firebase-auth', operation: 'logout-sign-out' } });
    });
    // Park this account's data under its own key and bring the guest's back,
    // so the next account to sign in does not inherit this one's name, Pal,
    // coins, stats or friends.
    switchAccount(GUEST_ACCOUNT).catch((error) => {
      captureError(error, { tags: { area: 'async-storage', operation: 'logout-switch-account' } });
    });
    persistAuth({ loggedIn: false, provider: null, handle: null });
  }, [persistAuth, switchAccount]);

  const updateProfile = useCallback((patch: Partial<Profile>): ActionResult => {
    if (typeof patch.name === 'string') {
      const raw = patch.name.trim();
      const issue = publicNameIssue(raw, 'name');
      if (issue) {
        return { ok: false, reason: issue };
      }
      // One name, and it doubles as the handle other players add you by, so it
      // has to satisfy the same rules the handle claim does.
      const name = normalizeHandle(raw);
      if (!name) {
        return { ok: false, reason: 'Choose a name using 3 to 20 letters, numbers, or underscores.' };
      }
      persistProfile({ ...profile, ...patch, name });
      return { ok: true };
    }
    persistProfile({ ...profile, ...patch });
    return { ok: true };
  }, [profile, persistProfile]);
  const setPal = useCallback((pal: PalConfig) => persistProfile({ ...profile, pal: normalizePal(pal) }), [profile, persistProfile]);
  const addCoins = useCallback((n: number) => persistProfile({ ...profile, coins: Math.max(0, profile.coins + n) }), [profile, persistProfile]);

  const recordHand = useCallback((r: HandResult): number => {
    const { stats: nextStats, coinsEarned } = applyHandResult(stats, r);
    persistStats(nextStats);
    persistProfile({
      ...profile,
      coins: Math.max(0, profile.coins + coinsEarned),
      xp: profile.xp + Math.max(0, coinsEarned),
    });
    return coinsEarned;
  }, [stats, profile, persistStats, persistProfile]);

  const addFriend = useCallback(async (name: string): Promise<{ ok: boolean; reason?: string }> => {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2) {
      return { ok: false, reason: "Enter your friend's handle." };
    }
    if (trimmed.length > 24) {
      return { ok: false, reason: 'That handle is too long.' };
    }
    if (trimmed.toLowerCase() === profile.name.trim().toLowerCase()) {
      return { ok: false, reason: "That's you!" };
    }
    const handle = normalizeHandle(trimmed);
    if (!handle) {
      return { ok: false, reason: 'Handles use 3 to 20 letters, numbers, or underscores.' };
    }
    if (handle === handleForDirectory(auth, profile)) {
      return { ok: false, reason: "That's you!" };
    }
    if (friends.some((f) => f.name.trim().toLowerCase() === trimmed.toLowerCase() || f.handle === handle)) {
      return { ok: false, reason: `${trimmed} is already in your crew.` };
    }
    if (!auth.loggedIn) {
      return { ok: false, reason: 'Sign in or play as guest before adding online friends.' };
    }
    if (!isFirebaseConfigured()) {
      return {
        ok: false,
        reason: 'Online friend requests need Firebase setup. Share room codes manually for now.',
      };
    }

    const ownHandle = await publishDirectory(auth, profile);
    if (!ownHandle) {
      return { ok: false, reason: 'Could not publish your handle. Try again in a moment.' };
    }
    const result = await sendFriendRequest(handle, profile.name, ownHandle);
    if (!result.ok || !result.toUid || !result.handle || !result.displayName) {
      return { ok: false, reason: result.reason || 'Could not send that friend request.' };
    }

    const friend: Friend = {
      id: result.toUid,
      uid: result.toUid,
      handle: result.handle,
      name: result.displayName,
      palSeed: result.handle,
      online: false,
      status: 'Request sent · pending',
      friendshipStatus: 'pending_outgoing',
    };
    persistFriends([friend, ...friends]);
    return { ok: true };
  }, [auth, friends, persistFriends, profile, publishDirectory]);

  const acceptFriendRequest = useCallback(async (id: string): Promise<{ ok: boolean; reason?: string }> => {
    const result = await acceptFirebaseFriendRequest(id);
    if (!result.ok) {
      return { ok: false, reason: result.reason || 'Could not accept that friend request.' };
    }
    return { ok: true };
  }, []);

  const declineFriendRequest = useCallback(async (id: string): Promise<{ ok: boolean; reason?: string }> => {
    const result = await declineFirebaseFriendRequest(id);
    if (!result.ok) {
      return { ok: false, reason: result.reason || 'Could not decline that friend request.' };
    }
    persistFriends(friends.filter((friend) => friend.id !== id));
    return { ok: true };
  }, [friends, persistFriends]);

  const removeFriend = useCallback((id: string) => {
    const friend = friends.find((candidate) => candidate.id === id);
    persistFriends(friends.filter((f) => f.id !== id));
    if (friend?.friendshipStatus === 'accepted' && friend.uid) {
      removeFriendship(friend.uid).catch((error) => {
        captureError(error, { tags: { area: 'firebase-friends', operation: 'remove-friendship' } });
      });
    }
  }, [friends, persistFriends]);

  const isBlocked = useCallback((uid: string): boolean =>
    blockedUsers.some((blocked) => blocked.uid === uid), [blockedUsers]);

  const blockUser = useCallback(async (uid: string, name: string, handle?: string): Promise<ActionResult> => {
    if (!uid || uid === profile.id) {
      return { ok: false, reason: "You can't block yourself." };
    }

    if (auth.loggedIn && isFirebaseConfigured()) {
      const remote = await blockFirebaseUser(uid, name, handle);
      if (!remote.ok) {
        return { ok: false, reason: remote.reason || 'Could not block that player.' };
      }
    }

    const nextBlocked: BlockedUser = {
      uid,
      handle,
      name: name.trim() || 'Blocked player',
      blockedAt: Date.now(),
    };
    persistBlocked([nextBlocked, ...blockedUsers.filter((blocked) => blocked.uid !== uid)]);
    persistFriends(friends.filter((friend) => (friend.uid ?? friend.id) !== uid));
    return {
      ok: true,
      reason: auth.loggedIn && isFirebaseConfigured() ? undefined : 'Blocked locally. Online blocking needs Firebase setup.',
    };
  }, [auth.loggedIn, blockedUsers, friends, persistBlocked, persistFriends, profile.id]);

  const reportUser = useCallback(async (
    uid: string,
    name: string,
    context: ReportContext,
    roomCode?: string,
  ): Promise<ActionResult> => {
    if (!uid || uid === profile.id) {
      return { ok: false, reason: "You can't report yourself." };
    }
    if (!auth.loggedIn || !isFirebaseConfigured()) {
      return { ok: false, reason: 'Online reports need Firebase setup.' };
    }
    const remote = await reportFirebaseUser(uid, name, context, roomCode);
    return remote.ok ? { ok: true } : { ok: false, reason: remote.reason || 'Could not send that report.' };
  }, [auth.loggedIn, profile.id]);

  const clearLocalAccountData = useCallback(async (): Promise<void> => {
    const nextProfile = makeDefaultProfile();
    setAuth({ loggedIn: false, provider: null, handle: null });
    setProfile(nextProfile);
    setStats(DEFAULT_STATS);
    setFriends([]);
    setBlockedUsers([]);
    setSavedGame(null);
    // Deleting an account has to take the parked per-account copies with it,
    // or the data would come back the moment that account signed in again.
    const parked = (await AsyncStorage.getAllKeys()).filter(isAccountBundleKey);
    activeAccount.current = GUEST_ACCOUNT;
    await AsyncStorage.multiRemove([
      PROFILE_KEY,
      STATS_KEY,
      AUTH_KEY,
      FRIENDS_KEY,
      SAVED_GAME_KEY,
      BLOCKS_KEY,
      ACTIVE_ACCOUNT_KEY,
      ...parked,
    ]);
  }, []);

  const deleteAccount = useCallback(async (): Promise<ActionResult> => {
    let remoteReason: string | undefined;
    if (auth.loggedIn && isFirebaseConfigured()) {
      const remote = await deleteOnlineAccount({
        knownFriendUids: friends
          .map((friend) => friend.uid ?? friend.id)
          .filter(Boolean),
        knownOutgoingRequestUids: friends
          .filter((friend) => friend.friendshipStatus === 'pending_outgoing')
          .map((friend) => friend.uid ?? friend.id)
          .filter(Boolean),
        knownRoomCodes: savedGame?.roomCode ? [savedGame.roomCode] : [],
      });
      if (!remote.ok) {
        return { ok: false, reason: remote.reason || 'Could not delete online account data.' };
      }
      remoteReason = remote.reason;
    } else if (!isFirebaseConfigured()) {
      remoteReason = 'Firebase is not configured, so only local account data was deleted.';
    }

    await clearLocalAccountData();
    return { ok: true, reason: remoteReason };
  }, [auth.loggedIn, clearLocalAccountData, friends, savedGame?.roomCode]);

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    const next = normalizeSettings({ ...settings, ...patch });
    setSettings(next);
    persist(SETTINGS_KEY, next);
  }, [settings, persist]);

  const resetStats = useCallback(() => persistStats(DEFAULT_STATS), [persistStats]);

  const saveGame = useCallback((g: SavedGame) => {
    setSavedGame(g);
    persist(SAVED_GAME_KEY, g);
  }, [persist]);

  const clearSavedGame = useCallback(() => {
    setSavedGame(null);
    AsyncStorage.removeItem(SAVED_GAME_KEY).catch((error) => {
      reportStorageError('clear-saved-game', SAVED_GAME_KEY, error);
    });
  }, []);

  const value = useMemo(() => ({
    ready, auth, ageVerified, verifyAge, profile, stats, friends, settings, savedGame, blockedUsers, textScaleTick,
    login, logout, updateProfile, setPal, addCoins, recordHand, addFriend, acceptFriendRequest, declineFriendRequest, removeFriend, blockUser, reportUser, deleteAccount, isBlocked, updateSettings, resetStats, saveGame, clearSavedGame,
  }), [ready, auth, ageVerified, verifyAge, profile, stats, friends, settings, savedGame, blockedUsers, textScaleTick, login, logout, updateProfile, setPal, addCoins, recordHand, addFriend, acceptFriendRequest, declineFriendRequest, removeFriend, blockUser, reportUser, deleteAccount, isBlocked, updateSettings, resetStats, saveGame, clearSavedGame]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function derivedStats(stats: Stats) {
  return computeDerived(stats);
}

export { palFromSeed };
