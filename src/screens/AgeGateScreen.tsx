import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { FadeIn, FadeInDown, Easing } from 'react-native-reanimated';
import { AnimatedPal } from '../components/AnimatedPal';
import { ScreenBackground } from '../components/ScreenBackground';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { colors, fonts, radii, spacing, easings } from '../theme/theme';
import { useApp } from '../state/AppContext';

type LegalKind = 'terms' | 'privacy';

const LEGAL_COPY: Record<LegalKind, { title: string; body: string }> = {
  terms: {
    title: 'Terms of Use',
    body:
      'LocalPoker is a free, play-money poker game for adults 18 and older. The game does not offer real-money gambling, cash prizes, withdrawals, or anything with real-world value.\n\n' +
      'By playing, you agree to use LocalPoker for entertainment only and to follow fair-play rules. We may update features, ads, virtual coins, or these terms as the app evolves.\n\n' +
      'Virtual coins are play-money only and cannot be sold, transferred for value, or redeemed. If you have questions about these terms, contact us at maskndafi@gmail.com.',
  },
  privacy: {
    title: 'Privacy Policy',
    body:
      'Your profile, coins, stats, settings and saved game stay on your device. We do not ask for your real name, and creating an account is not required to play.\n\n' +
      'If you play online with friends, we sign you in anonymously and send what online play needs to our Firebase server: an anonymous ID, your chosen name, and the state of the table you are at.\n\n' +
      'Using the friends features also stores the social data they depend on: friend requests you send or receive, your friends list, anyone you block, and any report you submit (which includes who you reported and why, so we can act on it). Names are public to other signed-in players, which is how someone can find you. Reaction GIFs load from Giphy\u2019s public CDN, which receives the usual network request details such as your IP address.\n\n' +
      'If crash reporting is enabled in this build, error and device diagnostics are sent to our crash-reporting provider so we can fix bugs. LocalPoker does not currently include an ads or analytics SDK; if that changes we will update this notice and ask for any consent the law requires first.\n\n' +
      'LocalPoker never handles real-money gambling. For privacy questions or deletion requests, contact maskndafi@gmail.com.',
  },
};

/**
 * Blocking age gate shown before login. Neutral birth-year entry (not a yes/no),
 * per app-store simulated-gambling requirements, plus Terms/Privacy links.
 */
export function AgeGateScreen() {
  const { verifyAge, profile } = useApp();
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [legal, setLegal] = useState<LegalKind | null>(null);
  const legalContent = legal ? LEGAL_COPY[legal] : null;

  const submit = () => {
    const res = verifyAge(parseInt(year, 10));
    if (!res.ok) setError(res.reason || 'Please enter a valid birth year.');
  };

  return (
    <ScreenBackground variant="menu" edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center' }}>
          <View style={styles.mascot}>
            <AnimatedPal config={profile.pal} size={96} alive ring />
          </View>
          <Text style={styles.wordmark}>Local<Text style={{ color: colors.blue }}>Poker</Text></Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(420).easing(Easing.bezier(...easings.out))}>
          <WiiPanel padding={20} style={{ marginTop: spacing.xl }}>
            <Text style={styles.title}>Confirm your age</Text>
            <Text style={styles.body}>
              LocalPoker is a free, play-money card game. There is no real-money gambling and no cash
              prizes. You must be 18 or older to play.
            </Text>
            <Text style={styles.label}>Year of birth</Text>
            <TextInput
              value={year}
              onChangeText={(t) => { setYear(t.replace(/[^0-9]/g, '').slice(0, 4)); if (error) setError(null); }}
              keyboardType="number-pad"
              placeholder="e.g. 1998"
              placeholderTextColor={colors.inkMuted}
              maxLength={4}
              style={[styles.input, error ? styles.inputError : null]}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={{ height: spacing.md }} />
            <WiiButton label="Enter" variant="green" size="lg" fullWidth onPress={submit} />
            <Text style={styles.legal}>
              By continuing you agree to our{' '}
              <Text style={styles.link} onPress={() => setLegal('terms')}>Terms</Text> and{' '}
              <Text style={styles.link} onPress={() => setLegal('privacy')}>Privacy Policy</Text>.
            </Text>
          </WiiPanel>
        </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal
        visible={legal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLegal(null)}
      >
        <View style={styles.modalBackdrop}>
          {legalContent ? (
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{legalContent.title}</Text>
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                <Text style={styles.modalText}>{legalContent.body}</Text>
              </ScrollView>
              <WiiButton label="Close" variant="blue" size="md" fullWidth onPress={() => setLegal(null)} />
            </View>
          ) : null}
        </View>
      </Modal>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  mascot: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  wordmark: { fontFamily: fonts.bold, fontSize: 34, color: colors.ink, marginTop: 4 },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink, marginBottom: spacing.sm },
  body: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft, lineHeight: 20, marginBottom: spacing.lg },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft, marginBottom: 6 },
  input: { height: 52, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelAlt, paddingHorizontal: 16, fontFamily: fonts.bold, fontSize: 20, color: colors.ink, textAlign: 'center', letterSpacing: 2 },
  inputError: { borderColor: colors.red },
  error: { fontFamily: fonts.medium, fontSize: 12, color: colors.red, marginTop: 6 },
  legal: { fontFamily: fonts.regular, fontSize: 11, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.md, lineHeight: 16 },
  link: { fontFamily: fonts.semibold, color: colors.blue },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,28,38,0.45)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { maxHeight: '78%', borderRadius: radii.lg, backgroundColor: colors.panel, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink, marginBottom: spacing.sm, textAlign: 'center' },
  modalScroll: { marginBottom: spacing.md },
  modalScrollContent: { paddingBottom: spacing.sm },
  modalText: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft, lineHeight: 21 },
});
