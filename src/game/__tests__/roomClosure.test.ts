import { describe, expect, it } from 'vitest';
import { DISCONNECT_GRACE_MS } from '../connectionGrace';
import {
  HOST_DISCONNECTED_REASON,
  HOST_LEFT_REASON,
  evaluateRoomClosure,
  type RoomClosurePlayer,
} from '../roomClosure';

const T = 1_000_000;
const host = (extras: Partial<RoomClosurePlayer> = {}): RoomClosurePlayer => ({
  id: 'host',
  isHost: true,
  connected: true,
  ...extras,
});
const guest = (): RoomClosurePlayer => ({ id: 'guest', connected: true });

describe('evaluateRoomClosure', () => {
  it('uses the ended room reason when the host deliberately closes the table', () => {
    const result = evaluateRoomClosure({
      status: 'ended',
      endedReason: 'Host closed this table.',
      endedAt: T,
      hostId: 'host',
      players: { host: host(), guest: guest() },
      now: T,
    });

    expect(result).toEqual({
      closed: true,
      source: 'ended',
      reason: 'Host closed this table.',
      endedAt: T,
    });
  });

  it('falls back to a plain host-left reason for older ended rooms', () => {
    expect(evaluateRoomClosure({ status: 'ended', now: T })).toMatchObject({
      closed: true,
      source: 'ended',
      reason: HOST_LEFT_REASON,
    });
  });

  it('does not close the table while the host is inside the grace window', () => {
    const result = evaluateRoomClosure({
      status: 'playing',
      hostId: 'host',
      players: { host: host({ connected: false }), guest: guest() },
      hostAwayAt: T,
      now: T + DISCONNECT_GRACE_MS - 1,
    });

    expect(result).toEqual({
      closed: false,
      hostDisconnectedSince: T,
      checkAgainAt: T + DISCONNECT_GRACE_MS,
    });
  });

  it('closes the table when the host is gone past the grace window', () => {
    const result = evaluateRoomClosure({
      status: 'playing',
      hostId: 'host',
      players: { host: host({ connected: false }), guest: guest() },
      hostAwayAt: T,
      now: T + DISCONNECT_GRACE_MS,
    });

    expect(result).toEqual({
      closed: true,
      source: 'hostDisconnected',
      reason: HOST_DISCONNECTED_REASON,
      hostDisconnectedSince: T,
    });
  });

  it('uses the connected flag on the host player when hostAwayAt is missing', () => {
    const first = evaluateRoomClosure({
      status: 'playing',
      hostId: 'host',
      players: { host: host({ connected: false }), guest: guest() },
      now: T,
    });
    expect(first).toMatchObject({ closed: false, hostDisconnectedSince: T });

    const later = evaluateRoomClosure({
      status: 'playing',
      hostId: 'host',
      players: { host: host({ connected: false }), guest: guest() },
      hostDisconnectedSince: T,
      now: T + DISCONNECT_GRACE_MS,
    });
    expect(later).toMatchObject({ closed: true, source: 'hostDisconnected' });
  });

  it('lets a reconnected host clear an old away marker', () => {
    const result = evaluateRoomClosure({
      status: 'playing',
      hostId: 'host',
      players: { host: host({ connected: true }), guest: guest() },
      hostAwayAt: T - DISCONNECT_GRACE_MS,
      now: T,
    });

    expect(result).toEqual({ closed: false });
  });

  it('does not apply host disappearance to a lobby room', () => {
    const result = evaluateRoomClosure({
      status: 'lobby',
      hostId: 'host',
      players: { host: host({ connected: false }) },
      hostAwayAt: T - DISCONNECT_GRACE_MS,
      now: T,
    });

    expect(result).toEqual({ closed: false });
  });
});
