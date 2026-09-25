import type { PalConfig } from '../avatar/palConfig';
import type { Stats } from '../game/stats';

/**
 * Per-account local storage.
 *
 * Everything account-shaped used to live at one fixed set of AsyncStorage
 * keys, so signing out of one Google account and into another left the first
 * account's name, Pal, coins, stats and friends in place. The second account
 * inherited all of it and then overwrote the name, which is what made switching
 * accounts look like it was corrupting the profile.
 *
 * Accounts are now keyed: the Firebase uid when signed in, and a single shared
 * bucket for guest play. Switching parks the outgoing account's copy and
 * restores the incoming one, or starts it fresh.
 *
 * Settings and age verification are deliberately *not* part of a bundle. Those
 * are device preferences and should survive a switch.
 */

export const GUEST_ACCOUNT = 'guest';

export const ACCOUNT_BUNDLE_PREFIX = '@pokerpals/account/';

export const accountBundleKey = (account: string): string => `${ACCOUNT_BUNDLE_PREFIX}${account}`;

export const isAccountBundleKey = (key: string): boolean => key.startsWith(ACCOUNT_BUNDLE_PREFIX);

export interface AccountBundle<TProfile, TFriend, TBlocked, TSavedGame> {
  profile: TProfile;
  stats: Stats;
  friends: TFriend[];
  blockedUsers: TBlocked[];
  savedGame: TSavedGame | null;
}

export interface BundleDefaults<TProfile> {
  makeProfile: () => TProfile;
  mergeStats: (raw?: Partial<Stats> | null) => Stats;
  normalizePal: (pal?: Partial<PalConfig> | null) => PalConfig;
  defaultStats: Stats;
}

/**
 * What an account should be handed when it becomes active.
 *
 * An account with nothing stored gets defaults rather than whatever the
 * previous account happened to leave behind, which is the whole point. Stored
 * data that is partial or corrupt is merged over defaults instead of throwing,
 * because failing here would strand the player on a broken profile.
 */
export function restoreAccountBundle<TProfile extends object, TFriend, TBlocked, TSavedGame>(
  stored: string | null,
  defaults: BundleDefaults<TProfile>,
): AccountBundle<TProfile, TFriend, TBlocked, TSavedGame> {
  const fresh = (): AccountBundle<TProfile, TFriend, TBlocked, TSavedGame> => ({
    profile: defaults.makeProfile(),
    stats: defaults.defaultStats,
    friends: [],
    blockedUsers: [],
    savedGame: null,
  });

  if (!stored) return fresh();

  let parsed: Partial<AccountBundle<TProfile, TFriend, TBlocked, TSavedGame>>;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return fresh();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fresh();

  const storedProfile = (parsed.profile ?? {}) as Partial<TProfile> & { pal?: Partial<PalConfig> };
  return {
    profile: {
      ...defaults.makeProfile(),
      ...storedProfile,
      pal: defaults.normalizePal(storedProfile.pal),
    } as TProfile,
    stats: defaults.mergeStats(parsed.stats ?? defaults.defaultStats),
    friends: Array.isArray(parsed.friends) ? parsed.friends : [],
    blockedUsers: Array.isArray(parsed.blockedUsers) ? parsed.blockedUsers : [],
    savedGame: parsed.savedGame ?? null,
  };
}
