import { describe, it, expect } from 'vitest';

import { routeForNotification } from '../pushRoute';

/**
 * A notification payload is written by another player's device, so it is
 * untrusted input. These cover the routing decision alone, which is the part
 * that can send someone somewhere they should not be.
 */
describe('routeForNotification', () => {
  it('sends a friend request to the friends list', () => {
    expect(routeForNotification({ kind: 'friend-request', code: null }))
      .toEqual({ screen: 'Friends' });
  });

  it('sends a room invite to that room lobby as a guest', () => {
    expect(routeForNotification({ kind: 'room-invite', code: 'AB7K' }))
      .toEqual({ screen: 'Lobby', params: { roomCode: 'AB7K', host: false } });
  });

  it('tidies a code that arrives lowercase or padded', () => {
    expect(routeForNotification({ kind: 'room-invite', code: ' ab7k ' }))
      .toEqual({ screen: 'Lobby', params: { roomCode: 'AB7K', host: false } });
  });

  it('refuses a code of the wrong length rather than opening a dead room', () => {
    expect(routeForNotification({ kind: 'room-invite', code: 'AB7KXY' }))
      .toEqual({ screen: 'Friends' });
  });

  it('refuses a code with characters the alphabet excludes', () => {
    expect(routeForNotification({ kind: 'room-invite', code: 'A!7K' }))
      .toEqual({ screen: 'Friends' });
  });

  it('falls back to friends when an invite carries no code at all', () => {
    expect(routeForNotification({ kind: 'room-invite' })).toEqual({ screen: 'Friends' });
    expect(routeForNotification({ kind: 'room-invite', code: null })).toEqual({ screen: 'Friends' });
    expect(routeForNotification({ kind: 'room-invite', code: 42 })).toEqual({ screen: 'Friends' });
  });

  it('ignores a kind it does not know, so a future payload cannot misroute', () => {
    expect(routeForNotification({ kind: 'turn-alert', code: 'AB7K' })).toBeNull();
    expect(routeForNotification({ kind: '__proto__' })).toBeNull();
  });

  it('ignores payloads that are not objects', () => {
    expect(routeForNotification(null)).toBeNull();
    expect(routeForNotification(undefined)).toBeNull();
    expect(routeForNotification('room-invite')).toBeNull();
    expect(routeForNotification(7)).toBeNull();
  });
});
