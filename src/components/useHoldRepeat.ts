import { useCallback, useEffect, useRef } from 'react';

/**
 * Press and hold to repeat, getting faster and coarser as you go.
 *
 * Tapping a stepper once per big blind is fine for a raise to 80 and absurd
 * for a stack of 50,000, so holding has to cover ground. Two things ramp
 * together: the repeat gets quicker, and the amount each repeat moves grows.
 * Only speeding up the repeats still leaves a long hold to cross a large
 * range, and only growing the step makes small adjustments impossible.
 */

/** First repeat waits longer, so a deliberate single tap never repeats. */
export const HOLD_DELAY_MS = 420;
/** Fastest the repeat is allowed to get. Below this it reads as a blur. */
export const HOLD_MIN_INTERVAL_MS = 55;
const HOLD_START_INTERVAL_MS = 220;

/**
 * How fast repeats come, given how long the button has been held.
 *
 * Eases from `HOLD_START_INTERVAL_MS` down to the floor over about a second,
 * so a short hold is still controllable.
 */
export function holdInterval(heldMs: number): number {
  const t = Math.min(1, Math.max(0, heldMs / 1000));
  const eased = HOLD_START_INTERVAL_MS - (HOLD_START_INTERVAL_MS - HOLD_MIN_INTERVAL_MS) * t;
  return Math.round(eased);
}

/**
 * How much one repeat moves, given how long the button has been held.
 *
 * Doubles roughly every 700ms and caps at 64x, which takes a 20 chip step up
 * to 1,280 after a few seconds: enough to cross a deep stack without the
 * multiplier running away to something unusable.
 */
export function holdMultiplier(heldMs: number): number {
  if (heldMs < HOLD_DELAY_MS) return 1;
  const doublings = Math.floor((heldMs - HOLD_DELAY_MS) / 700);
  return Math.min(64, 2 ** doublings);
}

/**
 * Wire a stepper button up to the ramp above.
 *
 * `onStep` receives the multiplier rather than a final value, so the caller
 * keeps control of clamping and of what a single step means.
 */
export function useHoldRepeat(onStep: (multiplier: number) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const tick = useCallback(() => {
    const held = Date.now() - startedAt.current;
    onStepRef.current(holdMultiplier(held));
    timer.current = setTimeout(tick, holdInterval(held));
  }, []);

  const start = useCallback(() => {
    stop();
    startedAt.current = Date.now();
    // The first move happens on press, so a tap feels immediate and a hold
    // simply continues from it.
    onStepRef.current(1);
    timer.current = setTimeout(tick, HOLD_DELAY_MS);
  }, [stop, tick]);

  // A button unmounted mid-hold, which happens when the action bar swaps as
  // the hand moves on, must not keep firing into a dead component.
  useEffect(() => stop, [stop]);

  return { onPressIn: start, onPressOut: stop };
}
