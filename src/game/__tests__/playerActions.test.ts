import { describe, expect, it } from 'vitest';
import { playerTapActions } from '../playerActions';

describe('playerTapActions', () => {
  const opponent = { self: false, bot: false };

  it('offers stats for yourself and for a bot', () => {
    expect(playerTapActions({ self: true, bot: false, showLiveStats: true })).toEqual(['stats']);
    expect(playerTapActions({ self: false, bot: true, showLiveStats: true })).toEqual(['stats']);
  });

  it('offers nothing for yourself or a bot once stats are switched off', () => {
    // The bug: the overlay button in the corner respected the setting and the
    // seats did not, so tapping one still opened the panel.
    expect(playerTapActions({ self: true, bot: false, showLiveStats: false })).toEqual([]);
    expect(playerTapActions({ self: false, bot: true, showLiveStats: false })).toEqual([]);
  });

  /*
   * The rule that must not regress. Reporting and blocking are how someone
   * deals with a person behaving badly; a display preference is not a reason
   * to take them away, and the whole point of pulling this out of the screen
   * was to be able to say so in a test.
   */
  it('keeps report and block for a real opponent whatever stats are set to', () => {
    for (const showLiveStats of [true, false]) {
      const actions = playerTapActions({ ...opponent, showLiveStats });
      expect(actions, `showLiveStats=${showLiveStats}`).toContain('report');
      expect(actions, `showLiveStats=${showLiveStats}`).toContain('block');
    }
  });

  it('adds stats to an opponent only when the overlay is on', () => {
    expect(playerTapActions({ ...opponent, showLiveStats: true })).toEqual(['stats', 'report', 'block']);
    expect(playerTapActions({ ...opponent, showLiveStats: false })).toEqual(['report', 'block']);
  });

  it('never offers report or block against yourself or a bot', () => {
    for (const seat of [{ self: true, bot: false }, { self: false, bot: true }]) {
      for (const showLiveStats of [true, false]) {
        const actions = playerTapActions({ ...seat, showLiveStats });
        expect(actions).not.toContain('report');
        expect(actions).not.toContain('block');
      }
    }
  });
});
