import { describe, expect, it } from 'vitest';
import { GUEST_ACCOUNT, accountBundleKey, isAccountBundleKey, restoreAccountBundle } from '../accountBundle';

/**
 * Guards the bug where signing out of one Google account and into another
 * carried the first account's name, Pal, coins, stats and friends across, then
 * let the second account's name overwrite the first one's.
 *
 * The fix is that an account only ever sees its own bundle, and an account
 * with nothing stored starts fresh rather than inheriting whatever the last
 * one left behind in the shared keys.
 */

type TestProfile = { id: string; name: string; pal: { seed: number }; coins: number; xp: number };

let nextId = 0;
const defaults = {
  makeProfile: (): TestProfile => {
    nextId += 1;
    return { id: `fresh-${nextId}`, name: `starter_${nextId}`, pal: { seed: 0 }, coins: 5000, xp: 0 };
  },
  mergeStats: (raw: unknown) => ({ handsPlayed: 0, ...(raw as object) }) as never,
  normalizePal: (pal: unknown) => (pal ?? { seed: 0 }) as never,
  defaultStats: { handsPlayed: 0 } as never,
};

const restore = (stored: string | null) =>
  restoreAccountBundle<TestProfile, unknown, unknown, unknown>(stored, defaults);

const bundleOf = (overrides: Partial<TestProfile>) =>
  JSON.stringify({
    profile: { id: 'stored', name: 'stored_name', pal: { seed: 7 }, coins: 123, xp: 9, ...overrides },
    stats: { handsPlayed: 42 },
    friends: [{ id: 'f1' }],
    blockedUsers: [{ uid: 'b1' }],
    savedGame: { roomCode: 'ABC' },
  });

describe('account bundle keys', () => {
  it('namespaces per account and recognises its own keys', () => {
    expect(accountBundleKey('uid-123')).toBe('@pokerpals/account/uid-123');
    expect(accountBundleKey(GUEST_ACCOUNT)).toBe('@pokerpals/account/guest');
    expect(isAccountBundleKey(accountBundleKey('uid-123'))).toBe(true);
    expect(isAccountBundleKey('@pokerpals/profile')).toBe(false);
    expect(isAccountBundleKey('@pokerpals/settings')).toBe(false);
  });

  it('gives different accounts different keys', () => {
    expect(accountBundleKey('uid-a')).not.toBe(accountBundleKey('uid-b'));
  });
});

describe('restoreAccountBundle', () => {
  it('starts an unknown account fresh rather than inheriting the last one', () => {
    const restored = restore(null);
    expect(restored.profile.name).toMatch(/^starter_/);
    expect(restored.profile.coins).toBe(5000);
    expect(restored.friends).toEqual([]);
    expect(restored.blockedUsers).toEqual([]);
    expect(restored.savedGame).toBeNull();
  });

  it('hands an account back exactly what it stored', () => {
    const restored = restore(bundleOf({}));
    expect(restored.profile.name).toBe('stored_name');
    expect(restored.profile.coins).toBe(123);
    expect(restored.friends).toHaveLength(1);
    expect(restored.blockedUsers).toHaveLength(1);
    expect(restored.savedGame).toEqual({ roomCode: 'ABC' });
  });

  it('keeps two accounts from seeing each other', () => {
    const a = restore(bundleOf({ name: 'account_a' }));
    const b = restore(null);
    expect(a.profile.name).toBe('account_a');
    expect(b.profile.name).not.toBe('account_a');
    expect(b.profile.coins).toBe(5000);
  });

  it('falls back to a fresh account when the stored copy is corrupt', () => {
    for (const broken of ['not json', '[]', 'null', '"a string"']) {
      const restored = restore(broken);
      expect(restored.profile.name).toMatch(/^starter_/);
      expect(restored.friends).toEqual([]);
    }
  });

  it('fills gaps in a partial bundle instead of throwing', () => {
    const restored = restore(JSON.stringify({ profile: { name: 'half_saved' } }));
    expect(restored.profile.name).toBe('half_saved');
    expect(restored.profile.coins).toBe(5000);
    expect(restored.profile.pal).toEqual({ seed: 0 });
    expect(restored.friends).toEqual([]);
    expect(restored.savedGame).toBeNull();
  });

  it('ignores non-array friend and block lists', () => {
    const restored = restore(JSON.stringify({ friends: { nope: true }, blockedUsers: 'nope' }));
    expect(restored.friends).toEqual([]);
    expect(restored.blockedUsers).toEqual([]);
  });
});
