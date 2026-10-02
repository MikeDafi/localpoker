import React, { useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { colors, spacing, radii, shadows, type } from '../theme/theme';
import { WiiButton } from './WiiButton';
import {
  AppAlertRequest,
  buttonVariant,
  dismissAlert,
  primaryButtonIndex,
  subscribeAlerts,
} from './alertBus';

/**
 * LocalPoker's own alert, drawn once at the root of the app.
 *
 * Deliberately dark rather than following the screen underneath. Alerts here
 * are overwhelmingly table events, busting, being evicted, leaving, blocking,
 * and a white card over the felt is exactly the jarring thing this replaces.
 * The same surface tokens the on-felt panels use keep it part of the table,
 * and it still reads as a dialog on the light menu screens because the scrim
 * does that work rather than the card's own colour.
 *
 * The buttons stack rather than sitting side by side the way iOS pairs two of
 * them. The app already asks four things in one alert (the player options
 * sheet), and a stack is the only arrangement that does not change shape
 * between two choices and four.
 */
export function AppAlertHost() {
  const [request, setRequest] = useState<AppAlertRequest | null>(null);

  useEffect(() => subscribeAlerts(setRequest), []);

  if (!request) return null;

  const primary = primaryButtonIndex(request.buttons);
  const choose = (index: number) => {
    const button = request.buttons[index];
    dismissAlert(request.id);
    // After dismissal, so a handler that raises its own alert (block, then
    // "could not block") queues behind this one instead of being closed by it.
    button?.onPress?.();
  };
  const cancelIndex = request.buttons.findIndex((b) => b.style === 'cancel');

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      /* Android's back gesture has to do something; it does what tapping the
         cancel button would, and nothing at all when there is no way out that
         the alert itself offers. */
      onRequestClose={() => { if (cancelIndex >= 0) choose(cancelIndex); }}
    >
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={styles.scrim}>
        <Animated.View entering={ZoomIn.duration(170)} style={[styles.card, shadows.raised]}>
          <Text style={styles.title} accessibilityRole="header">{request.title}</Text>
          {!!request.message && <Text style={styles.message}>{request.message}</Text>}
          <View style={styles.buttons}>
            {request.buttons.map((button, i) => (
              <WiiButton
                key={`${button.text}-${i}`}
                label={button.text}
                variant={buttonVariant(button, i, primary)}
                size="md"
                fullWidth
                onPress={() => choose(i)}
              />
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/**
 * The scrim is inert on purpose: it covers the felt but does not dismiss.
 * Several of these alerts are decisions with consequences (leave the table,
 * block a player, free your seat), and a stray tap outside is not an answer to
 * any of them.
 */
const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
    padding: spacing.lg,
  },
  title: { ...type.heading, color: colors.onDark, textAlign: 'center' },
  message: {
    ...type.body,
    color: colors.onDarkSoft,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  buttons: { marginTop: spacing.lg, gap: spacing.sm },
});
