import { describe, it, expect } from 'vitest';

import {
  DEFAULT_GAME_SETTINGS,
  normalizeSettings,
  roomSettingsJson,
} from '../settings';

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
});
