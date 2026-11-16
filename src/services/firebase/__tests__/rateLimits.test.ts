import { describe, expect, it } from 'vitest';

import { RATE_LIMIT_GAP_MS, isThrottled, rateLimitPath } from '../rateLimits';

describe('rate limits', () => {
  it('keeps the gaps the rules enforce', () => {
    // database.rules.json hard-codes these; a change here alone would make the
    // app explain refusals with the wrong cause.
    expect(RATE_LIMIT_GAP_MS.friendRequest).toBe(10_000);
    expect(RATE_LIMIT_GAP_MS.report).toBe(30_000);
  });

  it('reads a recent stamp as throttled', () => {
    expect(isThrottled(1_000, 5_000, 'friendRequest')).toBe(true);
    expect(isThrottled(1_000, 20_000, 'report')).toBe(true);
  });

  it('reads an old enough stamp as not throttled', () => {
    expect(isThrottled(1_000, 11_000, 'friendRequest')).toBe(false);
    expect(isThrottled(1_000, 31_000, 'report')).toBe(false);
  });

  it('never blames the throttle when there is no stamp', () => {
    expect(isThrottled(null, 5_000, 'friendRequest')).toBe(false);
    expect(isThrottled(undefined, 5_000, 'report')).toBe(false);
    expect(isThrottled('soon', 5_000, 'report')).toBe(false);
  });

  it('builds the path the rules guard', () => {
    expect(rateLimitPath('u1', 'report')).toBe('localpoker/rateLimits/u1/report');
  });
});
