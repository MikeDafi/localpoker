import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { captureError } from './telemetry';
import { publishPushToken, clearPushToken } from './firebase/push';
import { routeForNotification } from './pushRoute';

/**
 * Asking for, and holding, permission to notify.
 *
 * Kept away from the send path on purpose. Publishing a token is what creates
 * the capability for other people to notify you, so it happens only after
 * permission has actually been granted, never speculatively on launch.
 */

/** Show a banner even when the app is open, so an invite is not missed. */
export const configureNotificationHandler = (): void => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

/**
 * True when this build can actually receive a push.
 *
 * A simulator cannot, and neither can Expo Go on a project without its own
 * credentials, so asking there would prompt for something that can never work.
 */
export const canReceivePush = (): boolean => Device.isDevice;

const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  ?? (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

export type PushSetupResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'failed' };

/**
 * Ask once, and publish the token if allowed.
 *
 * iOS only shows the system prompt the first time, so a declined permission
 * stays declined until the user changes it in Settings. That is why this
 * reports `denied` rather than retrying: prompting in a loop is how apps get
 * their notifications muted permanently.
 */
export const enablePushNotifications = async (): Promise<PushSetupResult> => {
  if (!canReceivePush()) return { ok: false, reason: 'unsupported' };

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted' && existing.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Friends and invites',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const id = projectId();
    const token = (await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : undefined)).data;
    const published = await publishPushToken(token);
    return published ? { ok: true, token } : { ok: false, reason: 'failed' };
  } catch (error) {
    captureError(error, { tags: { area: 'push', operation: 'enable' } });
    return { ok: false, reason: 'failed' };
  }
};

/** Revoke on sign-out, so a shared device stops notifying the last user. */
export const disablePushNotifications = async (): Promise<void> => {
  await clearPushToken();
};

type Navigator = {
  isReady: () => boolean;
  navigate: (...args: [screen: string, params?: object]) => void;
};

/**
 * A cold launch from a notification is a once-per-process event, so it is
 * tracked outside the hook: re-running the effect must not replay it.
 */
let launchTapHandled = false;

/**
 * Route taps while `enabled`, including the tap that launched the app.
 *
 * A cold launch from a notification delivers the response before any listener
 * can exist, so `getLastNotificationResponseAsync` is checked once as well.
 * `handled` stops that same launch tap being replayed if the effect re-runs.
 */
export const useNotificationTaps = (navigator: Navigator, enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) return;
    let active = true;

    const go = (response: Notifications.NotificationResponse | null): void => {
      if (!active || !response || !navigator.isReady()) return;
      const route = routeForNotification(response.notification.request.content.data);
      if (!route) return;
      navigator.navigate(route.screen, route.params);
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (launchTapHandled) return;
        launchTapHandled = true;
        go(response);
      })
      .catch((error) => {
        captureError(error, { tags: { area: 'push', operation: 'launch-tap' } });
      });

    const subscription = Notifications.addNotificationResponseReceivedListener(go);
    return () => {
      active = false;
      subscription.remove();
    };
  }, [enabled, navigator]);
};

