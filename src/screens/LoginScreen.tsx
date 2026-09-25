import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ScreenBackground } from '../components/ScreenBackground';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { AnimatedPal } from '../components/AnimatedPal';
import { colors, fonts, spacing, radii, shadows } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { captureError } from '../services/telemetry';
import { RootStackParamList } from '../navigation/types';
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
  googleSignUpFields,
  isGoogleSignInConfigured,
  signInWithGoogleIdToken,
} from '../services/firebase';

// Lets a completed OAuth redirect dismiss the web view it came back from.
WebBrowser.maybeCompleteAuthSession();

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  void navigation;

  const { login, profile } = useApp();
  const [error, setError] = useState<string | null>(null);

  return (
    <ScreenBackground variant="menu">
      <View style={styles.root}>
        <View pointerEvents="none" style={styles.decorLayer}>
          <View style={[styles.orb, styles.orbBlue]} />
          <View style={[styles.orb, styles.orbPink]} />
          <View style={[styles.floatChip, styles.floatChipOne]}>
            <Text style={styles.floatChipText}>A♠</Text>
          </View>
          <View style={[styles.floatChip, styles.floatChipTwo]}>
            <Text style={styles.floatChipText}>♥</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.shell}>
            <Animated.View entering={FadeIn.duration(500)} style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Free table lobby • play-money only</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(80).duration(460)}>
              <WiiPanel padding={0} style={styles.heroPanel}>
                <View style={styles.heroInner}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>PLAY-MONEY POKER</Text>
                  </View>

                  <View style={styles.palStage}>
                    <View style={styles.palGlow} />
                    <AnimatedPal config={profile.pal} size={130} alive ring />
                  </View>

                  <Text style={styles.wordmark}>
                    Local<Text style={styles.wordmarkBlue}>Poker</Text>
                  </Text>
                  <Text style={styles.tagline}>Poker with Friends</Text>

                  <View style={styles.menuLights}>
                    <View style={[styles.menuLight, styles.menuLightBlue]} />
                    <View style={[styles.menuLight, styles.menuLightGold]} />
                    <View style={[styles.menuLight, styles.menuLightPink]} />
                  </View>
                </View>
              </WiiPanel>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(180).duration(460)}>
              <WiiPanel padding={spacing.lg} style={styles.authPanel}>
                <Text style={styles.authTitle}>Choose your seat</Text>
                <Text style={styles.authCopy}>
                  Sign in with Google to keep your Pal, chips, and friends on every device, or jump
                  in as a guest on this one.
                </Text>

                <View style={styles.buttonStack}>
                  {isGoogleSignInConfigured() ? (
                    <SignInBoundary>
                      <GoogleSignInButton onError={setError} />
                    </SignInBoundary>
                  ) : null}

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}

                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or jump right in</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <WiiButton
                    label="Play as Guest"
                    variant="blue"
                    size="lg"
                    fullWidth
                    icon={<AuthGlyph label="♠" />}
                    onPress={() => {
                      const result = login('guest');
                      if (!result.ok) setError(result.reason || 'Could not continue.');
                    }}
                  />
                </View>
              </WiiPanel>
            </Animated.View>

            <Animated.Text entering={FadeInDown.delay(280).duration(420)} style={styles.legal}>
              Play-money only. 18+. No real gambling.
            </Animated.Text>
          </View>
        </ScrollView>
      </View>
    </ScreenBackground>
  );
}

/**
 * Building the OAuth request reaches into native config (the bundle identifier
 * behind the redirect URI, among others), so a bad build could throw while
 * rendering. This is the login screen, the only way into the app, so swallow
 * that rather than let it take the whole screen and the Guest button with it.
 */
class SignInBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    captureError(error, { tags: { area: 'auth-ui', operation: 'google-button-render' } });
  }

  render() {
    if (this.state.failed) {
      return <Text style={styles.errorText}>Google sign-in is unavailable in this build.</Text>;
    }
    return this.props.children;
  }
}

/**
 * Kept in its own component because `useIdTokenAuthRequest` throws while
 * loading when no client ID exists for the platform, so the parent renders it
 * only once `isGoogleSignInConfigured()` says the IDs are there.
 *
 * The redirect is bound to this app's bundle identifier, so the flow only
 * completes in a dev build or a TestFlight/App Store build: in Expo Go the
 * redirect would land in Expo Go itself.
 */
function GoogleSignInButton({ onError }: { onError: (message: string | null) => void }) {
  const { login } = useApp();
  const [busy, setBusy] = useState(false);
  const handled = useRef<string | null>(null);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    // Always show the chooser: a shared device should not silently reuse the
    // last account, and there is no other way back out of a wrong one here.
    selectAccount: true,
  });

  useEffect(() => {
    if (!response) return;

    if (response.type === 'dismiss' || response.type === 'cancel') {
      setBusy(false);
      return;
    }

    if (response.type !== 'success') {
      setBusy(false);
      onError('Google sign-in did not complete. Try again, or play as a guest.');
      return;
    }

    const idToken = response.params?.id_token;
    if (!idToken) {
      // The code exchange runs a tick after the redirect, so a success without
      // a token yet is normal: the effect reruns when it lands.
      return;
    }
    if (handled.current === idToken) return;
    handled.current = idToken;

    let active = true;
    setBusy(true);
    (async () => {
      const result = await signInWithGoogleIdToken(idToken);
      if (!active) return;
      setBusy(false);
      if (!result.ok) {
        onError(result.reason);
        return;
      }
      const { handle, name } = googleSignUpFields(result.identity);
      const loggedIn = login('google', handle, name);
      if (!loggedIn.ok) {
        // A rejected handle or name is not worth blocking the sign-in over:
        // retry bare and let the directory fall back to a friend code.
        const bare = login('google');
        if (!bare.ok) onError(bare.reason || 'Could not finish signing in.');
      }
    })();

    return () => {
      active = false;
    };
  }, [login, onError, response]);

  return (
    <WiiButton
      label={busy ? 'Signing in...' : 'Sign in with Google'}
      variant="gold"
      size="md"
      fullWidth
      disabled={!request || busy}
      icon={busy ? <ActivityIndicator color={colors.blueDeep} size="small" /> : <GoogleGlyph />}
      onPress={() => {
        onError(null);
        setBusy(true);
        promptAsync().catch(() => {
          setBusy(false);
          onError('Could not open Google sign-in. Check your connection and try again.');
        });
      }}
    />
  );
}

function GoogleGlyph() {
  return (
    <View style={[styles.authGlyph, styles.authGlyphGold]}>
      <Text style={styles.googleGlyphText}>G</Text>
    </View>
  );
}

function AuthGlyph({ label }: { label: string }) {
  return (
    <View style={[styles.authGlyph, styles.authGlyphLight]}>
      <Text style={[styles.authGlyphText, styles.authGlyphTextBlue]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  decorLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.28,
  },
  orbBlue: {
    top: -56,
    right: -58,
    backgroundColor: colors.blueLight,
  },
  orbPink: {
    bottom: 64,
    left: -78,
    backgroundColor: colors.accentPink,
  },
  floatChip: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.soft,
  },
  floatChipOne: {
    top: 96,
    left: 18,
    transform: [{ rotate: '-12deg' }],
  },
  floatChipTwo: {
    right: 28,
    bottom: 124,
    transform: [{ rotate: '10deg' }],
  },
  floatChipText: {
    fontFamily: fonts.bold,
    fontSize: 19,
    color: colors.blueDeep,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  shell: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: spacing.md,
  },
  statusPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.soft,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
    backgroundColor: colors.online,
  },
  statusText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.inkSoft,
    letterSpacing: 0.2,
  },
  heroPanel: {
    borderRadius: radii.xl,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  heroInner: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.blueDeep,
    letterSpacing: 1.2,
  },
  palStage: {
    width: 164,
    height: 146,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  palGlow: {
    position: 'absolute',
    width: 158,
    height: 158,
    borderRadius: 79,
    backgroundColor: 'rgba(34,171,228,0.15)',
    borderWidth: 14,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  wordmark: {
    fontFamily: fonts.bold,
    fontSize: 48,
    lineHeight: 54,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -1.2,
  },
  wordmarkBlue: {
    color: colors.blue,
  },
  tagline: {
    marginTop: spacing.xs,
    fontFamily: fonts.medium,
    fontSize: 17,
    lineHeight: 23,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  menuLights: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  menuLight: {
    width: 42,
    height: 5,
    borderRadius: radii.pill,
  },
  menuLightBlue: {
    backgroundColor: colors.blue,
  },
  menuLightGold: {
    backgroundColor: colors.gold,
  },
  menuLightPink: {
    backgroundColor: colors.accentPink,
  },
  authPanel: {
    borderRadius: radii.xl,
  },
  authTitle: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.ink,
    textAlign: 'center',
  },
  authCopy: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  buttonStack: {
    gap: spacing.md,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.redDeep,
    marginLeft: spacing.xs,
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkMuted,
  },
  legal: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  authGlyph: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  authGlyphGold: {
    backgroundColor: colors.panel,
    borderColor: 'rgba(90,71,0,0.18)',
  },
  authGlyphLight: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  authGlyphText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  authGlyphTextBlue: {
    color: colors.onBlue,
  },
  googleGlyphText: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: '#4285F4',
  },
});
