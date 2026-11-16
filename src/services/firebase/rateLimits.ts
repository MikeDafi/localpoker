/**
 * Per-user write throttles, mirrored from `rateLimits` in database.rules.json.
 *
 * The rules are what enforce these: a friend request or a report is only
 * accepted alongside a bump of the sender's own stamp to server time, and the
 * bump only when the previous stamp is old enough. This module exists so the
 * app can tell a throttle apart from any other refusal and say "slow down"
 * instead of something alarming. Change a gap here and in the rules together.
 *
 * Pure on purpose, so it is testable without Firebase.
 */

export type RateLimitKind = 'friendRequest' | 'report';

export const RATE_LIMIT_GAP_MS: Record<RateLimitKind, number> = {
  friendRequest: 10_000,
  report: 30_000,
};

export const RATE_LIMITED_REASON = 'Slow down, try again in a moment.';

export const rateLimitPath = (uid: string, kind: RateLimitKind): string =>
  `localpoker/rateLimits/${uid}/${kind}`;

/**
 * Whether a refused write is explained by the throttle.
 *
 * `serverNow` is the device clock corrected by Firebase's server offset, since
 * the stamp is server time and a phone's clock can be minutes off. A missing
 * or malformed stamp means the throttle cannot be what refused it.
 */
export const isThrottled = (
  lastStamp: unknown,
  serverNow: number,
  kind: RateLimitKind,
): boolean => (
  typeof lastStamp === 'number'
  && Number.isFinite(lastStamp)
  && serverNow - lastStamp < RATE_LIMIT_GAP_MS[kind]
);
