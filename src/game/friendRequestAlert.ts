import type { FriendRequestRecord, SocialSnapshot } from '../services/firebase';

export const friendRequestAlertKey = (request: Pick<FriendRequestRecord, 'fromUid' | 'createdAt'>): string =>
  `${request.fromUid}:${request.createdAt}`;

const alertableIncomingRequests = (
  snapshot: Pick<SocialSnapshot, 'accepted' | 'blocked' | 'incoming'>,
): FriendRequestRecord[] => {
  const blocked = new Set(snapshot.blocked.map((record) => record.uid));
  const accepted = new Set(snapshot.accepted.map((record) => record.uid));
  return snapshot.incoming.filter((request) =>
    request.status === 'pending'
    && !blocked.has(request.fromUid)
    && !accepted.has(request.fromUid));
};

export const friendRequestAlertKeys = (
  snapshot: Pick<SocialSnapshot, 'accepted' | 'blocked' | 'incoming'>,
): Set<string> =>
  new Set(alertableIncomingRequests(snapshot).map(friendRequestAlertKey));

export const freshFriendRequestForAlert = (
  snapshot: Pick<SocialSnapshot, 'accepted' | 'blocked' | 'incoming'>,
  seenKeys: ReadonlySet<string>,
): FriendRequestRecord | null => {
  const fresh = alertableIncomingRequests(snapshot)
    .filter((request) => !seenKeys.has(friendRequestAlertKey(request)))
    .sort((a, b) => b.createdAt - a.createdAt);
  return fresh[0] ?? null;
};
