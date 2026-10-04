import { describe, expect, it } from 'vitest';

import {
  freshFriendRequestForAlert,
  friendRequestAlertKey,
  friendRequestAlertKeys,
} from '../friendRequestAlert';
import type { SocialSnapshot } from '../../services/firebase';

const request = (fromUid: string, createdAt: number, status: 'pending' | 'accepted' | 'declined' = 'pending') => ({
  fromUid,
  fromHandle: fromUid,
  fromName: fromUid,
  createdAt,
  status,
});

const snapshot = (overrides: Partial<SocialSnapshot> = {}): SocialSnapshot => ({
  accepted: [],
  incoming: [],
  blocked: [],
  ...overrides,
});

describe('friend request alert selection', () => {
  it('alerts only for a pending request that was not already seen', () => {
    const old = request('alice', 10);
    const fresh = request('bob', 20);
    const seen = new Set([friendRequestAlertKey(old)]);

    expect(freshFriendRequestForAlert(snapshot({ incoming: [old, fresh] }), seen)).toBe(fresh);
  });

  it('does not alert for blocked or already accepted players', () => {
    const blocked = request('alice', 10);
    const accepted = request('bob', 20);
    const declined = request('cora', 30, 'declined');

    expect(freshFriendRequestForAlert(snapshot({
      incoming: [blocked, accepted, declined],
      blocked: [{ uid: 'alice', displayName: 'Alice', createdAt: 1 }],
      accepted: [{ uid: 'bob', handle: 'bob', displayName: 'Bob', status: 'accepted', updatedAt: 2 }],
    }), new Set())).toBeNull();
  });

  it('keys by sender and creation time so a later request can notify again', () => {
    const first = request('alice', 10);
    const second = request('alice', 40);

    expect(friendRequestAlertKeys(snapshot({ incoming: [first] })).has(friendRequestAlertKey(first))).toBe(true);
    expect(freshFriendRequestForAlert(snapshot({ incoming: [second] }), new Set([friendRequestAlertKey(first)]))).toBe(second);
  });
});
