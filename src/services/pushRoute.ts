import { normalizeRoomCode, isRoomCodeShaped } from '../game/roomCode';
import type { RootStackParamList } from '../navigation/types';

/**
 * Where a tapped notification should land.
 *
 * Deliberately kept in its own module with no React or Expo imports, so the
 * decision that turns an untrusted payload into a navigation can be tested
 * directly. `pushSetup.ts` pulls in `expo-notifications` and `react-native`
 * and is not importable from a plain test environment.
 */
export type NotificationRoute = {
  screen: keyof RootStackParamList;
  params?: object;
};

export const routeForNotification = (data: unknown): NotificationRoute | null => {
  if (!data || typeof data !== 'object') return null;
  const { kind, code } = data as { kind?: unknown; code?: unknown };

  if (kind === 'friend-request') return { screen: 'Friends' };

  if (kind === 'room-invite') {
    // The payload arrives from another device, so it is treated as input
    // rather than trusted. `normalizeRoomCode` only tidies case and spacing,
    // so the shape has to be checked separately or any string at all would
    // navigate to a room that cannot exist. A bad code still has somewhere
    // sensible to go: the friends list is where the invite came from.
    if (typeof code !== 'string' || !isRoomCodeShaped(code)) return { screen: 'Friends' };
    return { screen: 'Lobby', params: { roomCode: normalizeRoomCode(code), host: false } };
  }

  return null;
};
