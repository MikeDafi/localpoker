import { describe, expect, it } from 'vitest';

import {
  ENDED_ROOM_RECLAIM_MS,
  isEndedRoomReclaimable,
  planHostedRoomOpen,
  shouldLeaveRoomOnLobbyUnmount,
} from '../lobbyRoom';

describe('planHostedRoomOpen', () => {
  it('attaches to a lobby that already belongs to this host', () => {
    expect(planHostedRoomOpen({ hostId: 'host-1', status: 'lobby' }, 'host-1')).toEqual({
      type: 'attach',
      reopenEnded: false,
    });
  });

  it('reopens this host room when a prior lobby navigation ended it', () => {
    expect(planHostedRoomOpen({ hostId: 'host-1', status: 'ended', endedAt: 100 }, 'host-1', 200)).toEqual({
      type: 'attach',
      reopenEnded: true,
    });
  });

  it('keeps another live room from being taken over', () => {
    expect(planHostedRoomOpen({ hostId: 'host-2', status: 'lobby' }, 'host-1')).toEqual({
      type: 'reject',
      reason: 'Room already exists.',
    });
  });

  it('lets an old ended room code be reused', () => {
    const endedAt = 1_000;
    expect(planHostedRoomOpen(
      { hostId: 'host-2', status: 'ended', endedAt },
      'host-1',
      endedAt + ENDED_ROOM_RECLAIM_MS,
    )).toEqual({ type: 'replace' });
  });

  it('does not attach to a room that has already started', () => {
    expect(planHostedRoomOpen({ hostId: 'host-1', status: 'playing' }, 'host-1')).toEqual({
      type: 'reject',
      reason: 'Room already exists.',
    });
  });
});

describe('isEndedRoomReclaimable', () => {
  it('requires the ended room to be old enough', () => {
    const endedAt = 1_000;
    expect(isEndedRoomReclaimable(
      { hostId: 'host-1', status: 'ended', endedAt },
      endedAt + ENDED_ROOM_RECLAIM_MS - 1,
    )).toBe(false);
    expect(isEndedRoomReclaimable(
      { hostId: 'host-1', status: 'ended', endedAt },
      endedAt + ENDED_ROOM_RECLAIM_MS,
    )).toBe(true);
  });
});

describe('shouldLeaveRoomOnLobbyUnmount', () => {
  it('keeps the room alive while the host edits its settings', () => {
    expect(shouldLeaveRoomOnLobbyUnmount({ online: true, preservingRoom: true })).toBe(false);
  });

  it('runs cleanup when an online lobby is actually abandoned', () => {
    expect(shouldLeaveRoomOnLobbyUnmount({ online: true, preservingRoom: false })).toBe(true);
  });
});
