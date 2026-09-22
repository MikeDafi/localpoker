import { describe, expect, it } from 'vitest';
import { isResumable, resumedTurnStartedAt, STALE_FRIENDS_RESUME_MS } from '../savedGame';
import type { SavedGame } from '../../state/AppContext';

const base = (over: Partial<SavedGame> = {}): SavedGame => ({
  stateJson: '{}',
  settings: {} as SavedGame['settings'],
  seed: 1,
  handNumber: 1,
  savedAt: 1_000_000,
  ...over,
});

describe('isResumable', () => {
  it('always resumes a local game', () => {
    expect(isResumable(base(), 9_999_999)).toBe(true);
  });

  it('refuses a stale friends room', () => {
    const saved = base({ roomCode: 'ABCD' });
    expect(isResumable(saved, saved.savedAt + STALE_FRIENDS_RESUME_MS - 1)).toBe(true);
    expect(isResumable(saved, saved.savedAt + STALE_FRIENDS_RESUME_MS + 1)).toBe(false);
  });

  it('refuses nothing saved', () => {
    expect(isResumable(null)).toBe(false);
  });
});

describe('resumedTurnStartedAt', () => {
  it('carries over the time already spent on the turn', () => {
    // Turn began 8s before the game was saved.
    const saved = base({ turnStartedAt: 1_000_000, savedAt: 1_008_000 });
    const now = 5_000_000;
    // Resuming should look like the turn started 8s ago, not right now.
    expect(resumedTurnStartedAt(saved, now)).toBe(now - 8_000);
  });

  it('does not count time spent away from the table', () => {
    const saved = base({ turnStartedAt: 1_000_000, savedAt: 1_003_000 });
    const soon = 1_004_000;
    const muchLater = 9_000_000;
    // Both resume with the same 3s already elapsed.
    expect(soon - resumedTurnStartedAt(saved, soon)).toBe(3_000);
    expect(muchLater - resumedTurnStartedAt(saved, muchLater)).toBe(3_000);
  });

  it('is the regression guard for the debounced-save bug', () => {
    // The autosave used to stamp savedAt ~600ms into the turn and never again,
    // so a player who sat for 20s resumed with a nearly full timer.
    const stale = base({ turnStartedAt: 1_000_000, savedAt: 1_000_600 });
    const flushed = base({ turnStartedAt: 1_000_000, savedAt: 1_020_000 });
    const now = 2_000_000;
    expect(now - resumedTurnStartedAt(stale, now)).toBe(600);
    expect(now - resumedTurnStartedAt(flushed, now)).toBe(20_000);
  });

  it('starts a fresh turn when nothing was recorded', () => {
    expect(resumedTurnStartedAt(base(), 4_242)).toBe(4_242);
    expect(resumedTurnStartedAt(null, 4_242)).toBe(4_242);
  });

  it('never returns a future start time', () => {
    // Clock skew: saved "before" the turn began.
    const saved = base({ turnStartedAt: 1_005_000, savedAt: 1_000_000 });
    const now = 2_000_000;
    expect(resumedTurnStartedAt(saved, now)).toBeLessThanOrEqual(now);
  });
});
