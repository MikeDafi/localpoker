import { describe, expect, it } from 'vitest';
import { DISCONNECT_GRACE_MS, readConnection } from '../connectionGrace';

const T = 1_000_000;

describe('readConnection', () => {
  it('reports a connected player as connected', () => {
    expect(readConnection({ raw: true, since: undefined, now: T })).toEqual({ connected: true, since: undefined });
  });

  /*
   * The bug that cost people hands. The roster was read with
   * `?.connected === true`, so a missing field became a confident false and
   * the whole table was folded. Unknown must stay unknown.
   */
  it('never turns a missing flag into a disconnection', () => {
    for (const raw of [undefined, null, '', 0, 'true', {}]) {
      expect(readConnection({ raw, since: undefined, now: T }).connected, String(raw)).toBeUndefined();
    }
  });

  it('does not act on a disconnection the instant it appears', () => {
    // A phone blinking between cells must not cost somebody the hand.
    const r = readConnection({ raw: false, since: undefined, now: T });
    expect(r.connected).toBeUndefined();
    expect(r.since).toBe(T);
  });

  it('still says nothing just before the grace window closes', () => {
    const r = readConnection({ raw: false, since: T, now: T + DISCONNECT_GRACE_MS - 1 });
    expect(r.connected).toBeUndefined();
  });

  it('believes it once the window has passed', () => {
    const r = readConnection({ raw: false, since: T, now: T + DISCONNECT_GRACE_MS });
    expect(r.connected).toBe(false);
    expect(r.since).toBe(T);
  });

  it('keeps the original moment rather than restarting the clock', () => {
    // Restarting on every poll would mean the window never closed and a
    // genuinely absent player was never folded.
    let since: number | undefined;
    for (let i = 0; i < 5; i += 1) {
      since = readConnection({ raw: false, since, now: T + i * 1000 }).since;
    }
    expect(since).toBe(T);
    expect(readConnection({ raw: false, since, now: T + DISCONNECT_GRACE_MS }).connected).toBe(false);
  });

  it('forgets the countdown the moment they come back', () => {
    const back = readConnection({ raw: true, since: T, now: T + 5000 });
    expect(back.since).toBeUndefined();
    // And a later blip starts a fresh window rather than inheriting the old one.
    expect(readConnection({ raw: false, since: back.since, now: T + 6000 }).connected).toBeUndefined();
  });

  it('forgets the countdown when the roster becomes unreadable', () => {
    expect(readConnection({ raw: undefined, since: T, now: T + 99_999 }).since).toBeUndefined();
  });

  it('closes the window shorter than a default turn clock', () => {
    // Otherwise a player who really has gone holds the table up, because the
    // clock would fold them before this ever fired.
    expect(DISCONNECT_GRACE_MS).toBeLessThan(20_000);
  });
});
