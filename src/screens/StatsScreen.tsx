import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { LineChart } from '../components/LineChart';
import { AdBanner, ADS_ENABLED } from '../components/AdBanner';
import { colors, fonts, spacing, easings } from '../theme/theme';
import { useApp, derivedStats } from '../state/AppContext';
import { InfoDot, InfoNote } from '../components/InfoDot';
import { PROFILE_STAT_KEYS, STAT_HELP, statHelpText, type StatKey } from '../game/statHelp';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Stats'>;

export function StatsScreen({ navigation }: Props) {
  const { stats, resetStats } = useApp();
  const d = derivedStats(stats);
  const { width } = useWindowDimensions();
  const [openHelp, setOpenHelp] = useState<StatKey | null>(null);
  const chartW = width - spacing.lg * 2 - 32;

  // Built from the shared stat keys so a metric cannot appear here without the
  // explanation behind its ⓘ coming with it.
  const VALUES: Record<StatKey, { value: string; color: string }> = {
    winRate: { value: `${d.winRate}%`, color: colors.green },
    vpip: { value: `${d.vpip}%`, color: colors.blue },
    pfr: { value: `${d.pfr}%`, color: colors.blueDeep },
    showdownWin: { value: `${d.showdownWinRate}%`, color: colors.gold },
    af: { value: `${d.aggression}`, color: colors.red },
    handsLifetime: { value: `${stats.handsPlayed}`, color: colors.inkSoft },
    handsWon: { value: `${stats.handsWon}`, color: colors.green },
    coinsEarned: { value: `${stats.coinsEarned.toLocaleString()}`, color: colors.goldDeep },
    biggestPot: { value: `${stats.biggestPotWon.toLocaleString()}`, color: colors.accent },
    handsSession: { value: '—', color: colors.inkSoft },
    netChips: { value: `${stats.netChips >= 0 ? '+' : ''}${stats.netChips.toLocaleString()}`, color: colors.inkSoft },
    winChance: { value: '—', color: colors.inkSoft },
  };

  const onReset = () =>
    Alert.alert('Reset stats?', 'This clears all your lifetime stats. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetStats },
    ]);

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="My Stats" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <Animated.View entering={FadeInDown.delay(0).duration(400).easing(Easing.bezier(...easings.out))}>
          <WiiPanel>
            <Text style={styles.section}>Key metrics</Text>
            <View style={styles.grid}>
              {PROFILE_STAT_KEYS.map((key) => (
                <View key={key} style={styles.cell}>
                  <Text style={[styles.value, { color: VALUES[key].color }]}>{VALUES[key].value}</Text>
                  <View style={styles.metricRow}>
                    <Text style={styles.metric}>{STAT_HELP[key].label}</Text>
                    <InfoDot
                      tone="light"
                      label={STAT_HELP[key].label}
                      open={openHelp === key}
                      onPress={() => setOpenHelp((cur) => (cur === key ? null : key))}
                    />
                  </View>
                </View>
              ))}
            </View>
            {openHelp ? <InfoNote tone="light">{statHelpText(openHelp)}</InfoNote> : null}
          </WiiPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(70).duration(400).easing(Easing.bezier(...easings.out))}>
          <WiiPanel>
            <Text style={styles.section}>Stack history</Text>
            {stats.chipHistory.length >= 2 ? (
              <LineChart data={stats.chipHistory} width={chartW} height={140} />
            ) : (
              <Text style={styles.empty}>Play a few hands to see your stack trend.</Text>
            )}
          </WiiPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).duration(400).easing(Easing.bezier(...easings.out))}>
          <WiiPanel>
            <Text style={styles.section}>What the numbers mean</Text>
            {PROFILE_STAT_KEYS.map((key) => (
              <View key={key} style={styles.helpRow}>
                <Text style={styles.helpKey}>{STAT_HELP[key].label}</Text>
                <Text style={styles.helpText}>{statHelpText(key)}</Text>
              </View>
            ))}
          </WiiPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(210).duration(400).easing(Easing.bezier(...easings.out))}>
          <WiiButton label="Reset stats" variant="red" size="md" fullWidth onPress={onReset} />
        </Animated.View>
        {ADS_ENABLED ? (
          <Animated.View entering={FadeInDown.delay(280).duration(400).easing(Easing.bezier(...easings.out))}>
            <AdBanner />
          </Animated.View>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', paddingVertical: spacing.sm, alignItems: 'center' },
  value: { fontFamily: fonts.bold, fontSize: 22 },
  metric: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  empty: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkMuted, paddingVertical: spacing.lg, textAlign: 'center' },
  helpRow: { flexDirection: 'row', marginBottom: spacing.sm },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  helpKey: { fontFamily: fonts.bold, fontSize: 13, color: colors.blueDeep, width: 96 },
  helpText: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkSoft, flex: 1, lineHeight: 18 },
});
