import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PalConfig, randomPal, normalizePal, palFromSeed } from '../avatar/palConfig';
import { GameSettings, DEFAULT_GAME_SETTINGS, normalizeSettings } from '../game/settings';
import {
  Stats, HandResult, DEFAULT_STATS, applyHandResult, derivedStats as computeDerived, mergeStats,
} from '../game/stats';
import { sound } from '../services/sound';
import { captureError } from '../services/telemetry';

export interface Profile {
  id: string;
  name: string;
  pal: PalConfig;
  coins: number;
  xp: number;
}

export interface AuthState {
  loggedIn: boolean;
  provider: 'guest' | 'apple' | 'google' | 'email' | null;
  handle: string | null;
}

export interface Friend {
  id: string;
  name: string;
  palSeed: string;
  online: boolean;
  status?: string;
}

export type { Stats, HandResult } from '../game/stats';

const PROFILE_KEY = '@pokerpals/profile';
const STATS_KEY = '@pokerpals/stats';
const AUTH_KEY = '@pokerpals/auth';
const FRIENDS_KEY = '@pokerpals/friends';
const SETTINGS_KEY = '@pokerpals/settings';
const SAVED_GAME_KEY = '@pokerpals/savedgame';
const AGE_KEY = '@pokerpals/ageVerified';

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
  login: (provider: AuthState['provider'], handle?: string, name?: string) => void;
  logout: () => void;
  updateProfile: (patch: Partial<Profile>) => void;
  setPal: (pal: PalConfig) => void;
  addCoins: (n: number) => void;
  recordHand: (r: HandResult) => number;
  addFriend: (name: string) => { ok: boolean; reason?: string };
  removeFriend: (id: string) => void;
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

  useEffect(() => {
    (async () => {
      try {
        const [p, s, a, f, st, g, av] = await Promise.all([
          AsyncStorage.getItem(PROFILE_KEY), AsyncStorage.getItem(STATS_KEY),
          AsyncStorage.getItem(AUTH_KEY), AsyncStorage.getItem(FRIENDS_KEY),
          AsyncStorage.getItem(SETTINGS_KEY), AsyncStorage.getItem(SAVED_GAME_KEY),
          AsyncStorage.getItem(AGE_KEY),
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
      } catch (error) {
        captureError(error, { tags: { area: 'async-storage', operation: 'hydrate-app-state' } });
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    sound.configure({ enabled: settings.soundEnabled, volume: settings.soundVolume / 100 });
  }, [settings.soundEnabled, settings.soundVolume]);

  const persist = useCallback((key: string, value: unknown) => {
    AsyncStorage.setItem(key, JSON.stringify(value)).catch((error) => {
      reportStorageError('persist', key, error);
    });
  }, []);

  const persistProfile = useCallback((next: Profile) => { setProfile(next); persist(PROFILE_KEY, next); }, [persist]);
  const persistStats = useCallback((next: Stats) => { setStats(next); persist(STATS_KEY, next); }, [persist]);
  const persistAuth = useCallback((next: AuthState) => { setAuth(next); persist(AUTH_KEY, next); }, [persist]);
  const persistFriends = useCallback((next: Friend[]) => { setFriends(next); persist(FRIENDS_KEY, next); }, [persist]);

  const login = useCallback((provider: AuthState['provider'], handle?: string, name?: string) => {
    persistAuth({ loggedIn: true, provider, handle: handle ?? null });
    // Commit the current device identity (id, pal, coins) so signing in — including
    // "Play as Guest" with no name — always resolves to the same persisted user.
    persistProfile(name && name.trim() ? { ...profile, name: name.trim() } : profile);
  }, [persistAuth, persistProfile, profile]);

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

  const logout = useCallback(() => persistAuth({ loggedIn: false, provider: null, handle: null }), [persistAuth]);

  const updateProfile = useCallback((patch: Partial<Profile>) => persistProfile({ ...profile, ...patch }), [profile, persistProfile]);
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

  const addFriend = useCallback((name: string): { ok: boolean; reason?: string } => {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2) {
      return { ok: false, reason: "Enter your friend's display name." };
    }
    if (trimmed.length > 24) {
      return { ok: false, reason: 'That name is too long.' };
    }
    if (trimmed.toLowerCase() === profile.name.trim().toLowerCase()) {
      return { ok: false, reason: "That's you!" };
    }
    if (friends.some((f) => f.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: `${trimmed} is already in your crew.` };
    }
    const friend: Friend = {
      id: `friend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      palSeed: trimmed.toLowerCase(),
      online: false,
      status: 'Invite sent · pending',
    };
    persistFriends([friend, ...friends]);
    return { ok: true };
  }, [friends, persistFriends, profile.name]);

  const removeFriend = useCallback((id: string) => persistFriends(friends.filter((f) => f.id !== id)), [friends, persistFriends]);

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
    ready, auth, ageVerified, verifyAge, profile, stats, friends, settings, savedGame,
    login, logout, updateProfile, setPal, addCoins, recordHand, addFriend, removeFriend, updateSettings, resetStats, saveGame, clearSavedGame,
  }), [ready, auth, ageVerified, verifyAge, profile, stats, friends, settings, savedGame, login, logout, updateProfile, setPal, addCoins, recordHand, addFriend, removeFriend, updateSettings, resetStats, saveGame, clearSavedGame]);

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
