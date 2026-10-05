import { describe, it, expect } from 'vitest';

import {
  DEFAULT_GAME_SETTINGS,
  normalizeSettings,
  roomSettingsJson,
  withOwnDevicePreferences,
} from '../settings';
import { pickDeviceOnly } from '../hostControls';

/**
 * `GameSettings` is both the settings screen's model and the payload a room
 * publishes, and the room record is readable by everyone at the table. So
 * anything device-local has to be stripped on the way out.
 */
describe('roomSettingsJson', () => {
  it('omits the notification preference, which is about a device not a game', () => {
    const json = roomSettingsJson({ ...DEFAULT_GAME_SETTINGS, pushNotifications: true });
    expect(JSON.parse(json)).not.toHaveProperty('pushNotifications');
    expect(json).not.toContain('pushNotifications');
  });

  it('keeps every rule that actually decides how a hand plays', () => {
    const settings = { ...DEFAULT_GAME_SETTINGS, gameMode: 'turbo' as const, smallBlind: 5, bigBlind: 10, numOpponents: 4 };
    const shared = JSON.parse(roomSettingsJson(settings));
    expect(shared.gameMode).toBe('turbo');
    expect(shared.smallBlind).toBe(5);
    expect(shared.bigBlind).toBe(10);
    expect(shared.numOpponents).toBe(4);
  });

  it('round-trips through normalizeSettings the way a joining guest reads it', () => {
    const host = { ...DEFAULT_GAME_SETTINGS, pushNotifications: true, smallBlind: 25, bigBlind: 50 };
    const guest = normalizeSettings(JSON.parse(roomSettingsJson(host)));
    expect(guest.smallBlind).toBe(25);
    expect(guest.bigBlind).toBe(50);
    // The guest falls back to the default rather than inheriting the host's
    // choice, which is the point: a host cannot switch on someone else's
    // notifications by inviting them to a table.
    expect(guest.pushNotifications).toBe(false);
  });

  it('strips the preference even when the host has it switched off', () => {
    const json = roomSettingsJson({ ...DEFAULT_GAME_SETTINGS, pushNotifications: false });
    expect(JSON.parse(json)).not.toHaveProperty('pushNotifications');
  });

  it('defaults old saved settings to cash mode', () => {
    expect(normalizeSettings({}).gameMode).toBe('cash');
    expect(normalizeSettings({ gameMode: 'made-up' } as never).gameMode).toBe('cash');
  });

  /*
   * A host playing muted used to mute everybody, because the whole settings
   * object travelled and a joining guest adopted it wholesale. Sound, haptics,
   * animation speed and text size describe a phone, not a game.
   */
  it('does not send how the host likes to be played at', () => {
    const shared = JSON.parse(roomSettingsJson({
      ...DEFAULT_GAME_SETTINGS,
      soundEnabled: false,
      hapticsEnabled: false,
      animationSpeed: 'off',
      largeText: true,
      autoMuck: false,
      showLiveStats: true,
    }));
    for (const key of ['soundEnabled', 'hapticsEnabled', 'animationSpeed', 'largeText', 'autoMuck', 'showLiveStats']) {
      expect(shared, `${key} describes a device, not the table`).not.toHaveProperty(key);
    }
  });

  it('gives a guest the table terms and their own preferences', () => {
    const host = {
      ...DEFAULT_GAME_SETTINGS,
      smallBlind: 25, bigBlind: 50, gameMode: 'turbo' as const,
      soundEnabled: false, animationSpeed: 'off' as const, largeText: true,
    };
    const mine = {
      ...DEFAULT_GAME_SETTINGS,
      soundEnabled: true, animationSpeed: 'fast' as const, largeText: false,
    };
    const atTable = withOwnDevicePreferences(normalizeSettings(JSON.parse(roomSettingsJson(host))), mine);

    expect(atTable.smallBlind).toBe(25);
    expect(atTable.bigBlind).toBe(50);
    expect(atTable.gameMode).toBe('turbo');
    expect(atTable.soundEnabled).toBe(true);
    expect(atTable.animationSpeed).toBe('fast');
    expect(atTable.largeText).toBe(false);
  });
});

/**
 * The table menu offers these to everyone at the table, not just the host, so
 * the filter is what stops a row in that sheet from reaching the room.
 */
describe('pickDeviceOnly', () => {
  it('passes a preference that stays on this phone', () => {
    expect(pickDeviceOnly({ soundEnabled: false, animationSpeed: 'off' }))
      .toEqual({ soundEnabled: false, animationSpeed: 'off' });
  });

  it('refuses every term the table agreed to', () => {
    expect(pickDeviceOnly({
      smallBlind: 1, bigBlind: 2, startingStack: 10, gameMode: 'turbo',
      turnTimerSec: 60, numOpponents: 1, difficulty: 'easy',
    } as never)).toEqual({});
  });

  it('refuses the cosmetics only the host may change', () => {
    expect(pickDeviceOnly({ feltStyle: 'table-lunar', cardBack: 'holo', roomVisibility: 'public' })).toEqual({});
  });
});
