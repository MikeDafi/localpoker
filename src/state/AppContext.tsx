import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
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

const ADJ = ['Mighty', 'Lucky', 'Sneaky', 'Royal', 'Turbo', 'Cosmic', 'Wild', 'Golden'];
const NOUN = ['Ace', 'Shark', 'Bluff', 'Chip', 'River', 'Joker', 'King', 'Bandit'];
function randomName(): string {
  return `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;
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
  login: (provider: AuthState['provider'], handle?: string, name?: string) => ActionResult;
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

  useEffect(() => {
    (async () => {
      try {
        const [p, s, a, f, st, g, av, b] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY), AsyncStorage.getItem(STATS_KEY),
          AsyncStorage.getItem(AUTH_KEY), AsyncStorage.getItem(FRIENDS_KEY),
          AsyncStorage.getItem(SETTINGS_KEY), AsyncStorage.getItem(SAVED_GAME_KEY),
          AsyncStorage.getItem(AGE_KEY), AsyncStorage.getItem(BLOCKS_KEY),
        ]);
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
    let result = await publishUserDirectory(desiredHandle, nextProfile.name);
    if (!result.ok && desiredHandle !== profileHandleFallback(nextProfile)) {
      result = await publishUserDirectory(profileHandleFallback(nextProfile), nextProfile.name);
    }
    if (result.ok && result.handle && nextAuth.handle !== result.handle) {
      persistAuth({ ...nextAuth, handle: result.handle });
    }
    return result.ok ? result.handle : null;
  }, [persistAuth]);

  const login = useCallback((provider: AuthState['provider'], handle?: string, name?: string): ActionResult => {
    const requestedHandle = handle?.trim();
    if (requestedHandle && !normalizeHandle(requestedHandle)) {
      return { ok: false, reason: 'Choose a handle using 3 to 20 letters, numbers, or underscores.' };
    }

    const displayName = name?.trim();
    if (displayName) {
      const issue = publicNameIssue(displayName, 'display name');
      if (issue) {
        return { ok: false, reason: issue };
      }
    }

    const nextProfile = displayName ? { ...profile, name: displayName } : profile;
    const nextAuth = {
      loggedIn: true,
      provider,
      handle: normalizeHandle(handle ?? '') ?? normalizeHandle(nextProfile.name) ?? profileHandleFallback(nextProfile),
    };
    persistAuth(nextAuth);
    // Commit the current device identity (id, pal, coins) so signing in, including
    // "Play as Guest" with no name, always resolves to the same persisted user.
    persistProfile(nextProfile);
    publishDirectory(nextAuth, nextProfile).catch((error) => {
      captureError(error, { tags: { area: 'firebase-friends', operation: 'login-publish-directory' } });
    });
    return { ok: true };
  }, [persistAuth, persistProfile, profile, publishDirectory]);

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
    persistAuth({ loggedIn: false, provider: null, handle: null });
  }, [persistAuth]);

  const updateProfile = useCallback((patch: Partial<Profile>): ActionResult => {
    if (typeof patch.name === 'string') {
      const name = patch.name.trim();
      const issue = publicNameIssue(name, 'display name');
      if (issue) {
        return { ok: false, reason: issue };
      }
      persistProfile({ ...profile, ...patch, name: name || profile.name });
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
    await AsyncStorage.multiRemove([
      PROFILE_KEY,
      STATS_KEY,
      AUTH_KEY,
      FRIENDS_KEY,
      SAVED_GAME_KEY,
      BLOCKS_KEY,
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
