import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ScreenBackground } from '../components/ScreenBackground';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { AnimatedPal } from '../components/AnimatedPal';
import { colors, fonts, spacing, radii, shadows } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  void navigation;

  const { login, profile } = useApp();
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const revealEmail = () => {
    setShowEmail(true);
    setEmailError(null);
  };

  const submitEmail = () => {
    const handle = email.trim();
    const displayName = name.trim();

    if (!handle) {
      setEmailError('Enter an email or username to keep your chips.');
      return;
    }

    login('email', handle, displayName || undefined);
  };

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

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.shell}>
              <Animated.View entering={FadeIn.duration(500)} style={styles.statusPill}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Free table lobby • ads keep it friendly</Text>
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
                    Save your Pal, chips, and friendly table history with email, or jump in as a guest.
                  </Text>

                  <View style={styles.buttonStack}>
                    {showEmail ? (
                      <Animated.View entering={FadeInDown.duration(380)} style={styles.emailForm}>
                        <Text style={styles.inputLabel}>Email or username</Text>
                        <TextInput
                          value={email}
                          onChangeText={(value) => {
                            setEmail(value);
                            if (emailError) setEmailError(null);
                          }}
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="email-address"
                          placeholder="you@example.com"
                          placeholderTextColor={colors.inkMuted}
                          selectionColor={colors.blue}
                          style={[styles.input, emailError ? styles.inputError : null]}
                        />

                        <Text style={styles.inputLabel}>Display name (optional)</Text>
                        <TextInput
                          value={name}
                          onChangeText={setName}
                          autoCapitalize="words"
                          maxLength={24}
                          onSubmitEditing={submitEmail}
                          placeholder="Lucky Ace"
                          placeholderTextColor={colors.inkMuted}
                          returnKeyType="go"
                          selectionColor={colors.blue}
                          style={styles.input}
                        />

                        {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

                        <WiiButton
                          label="Continue"
                          variant="green"
                          size="md"
                          fullWidth
                          icon={<AuthGlyph label="@" tone="blue" />}
                          onPress={submitEmail}
                        />
                      </Animated.View>
                    ) : (
                      <WiiButton
                        label="Sign in with Email"
                        variant="gold"
                        size="md"
                        fullWidth
                        icon={<AuthGlyph label="@" tone="gold" />}
                        onPress={revealEmail}
                      />
                    )}

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
                      icon={<AuthGlyph label="♠" tone="light" />}
                      onPress={() => login('guest')}
                    />
                  </View>
                </WiiPanel>
              </Animated.View>

              <Animated.Text entering={FadeInDown.delay(280).duration(420)} style={styles.legal}>
                Play-money only. 18+. No real gambling.
              </Animated.Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ScreenBackground>
  );
}

function AuthGlyph({ label, tone }: { label: string; tone: 'blue' | 'gold' | 'light' }) {
  return (
    <View
      style={[
        styles.authGlyph,
        tone === 'blue' && styles.authGlyphBlue,
        tone === 'gold' && styles.authGlyphGold,
        tone === 'light' && styles.authGlyphLight,
      ]}
    >
      <Text
        style={[
          styles.authGlyphText,
          tone === 'blue' && styles.authGlyphTextLight,
          tone === 'light' && styles.authGlyphTextBlue,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  emailForm: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.inkSoft,
    marginLeft: spacing.xs,
  },
  input: {
    height: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: {
    borderColor: colors.red,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.redDeep,
    marginLeft: spacing.xs,
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
  authGlyphBlue: {
    backgroundColor: colors.blue,
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
  authGlyphTextLight: {
    color: colors.panel,
  },
  authGlyphTextBlue: {
    color: colors.onBlue,
  },
});
