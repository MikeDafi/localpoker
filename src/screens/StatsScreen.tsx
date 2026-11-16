import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { showAlert } from '../components/alertBus';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { LineChart } from '../components/LineChart';
import {
  ChipHighlightCards,
  HandSwingChart,
  PlayingStyleChart,
  RateGuideBars,
  WinBreakdownChart,
} from '../components/charts/StatsCharts';
import { AdBanner, ADS_ENABLED } from '../components/AdBanner';
import { colors, fonts, radii, spacing, easings } from '../theme/theme';
import { useApp, derivedStats } from '../state/AppContext';
import { InfoDot, InfoNote } from '../components/InfoDot';
import { PROFILE_STAT_KEYS, STAT_HELP, statHelpText, type StatKey } from '../game/statHelp';
import { buildStatsViz } from '../game/statsViz';
import { gameAsStats, shortWhen, stackHistoryEnds } from '../game/stats';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Stats'>;

export function StatsScreen({ navigation }: Props) {
  const { stats: allStats, resetStats } = useApp();
  /*
   * All time by default, or one of the last 25 games. Every panel below reads
   * `stats`, so picking a game re-draws the whole page for that game alone
   * rather than adding a second, smaller copy of it.
   */
  const [gameId, setGameId] = useState<string | null>(null);
  const games = [...(allStats.games ?? [])].reverse();
  const picked = gameId ? games.find((g) => g.id === gameId) ?? null : null;
  const stats = picked ? gameAsStats(picked) : allStats;
  const d = derivedStats(stats);
  const viz = buildStatsViz(stats);
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
    handsSession: { value: '-', color: colors.inkSoft },
    netChips: { value: `${stats.netChips >= 0 ? '+' : ''}${stats.netChips.toLocaleString()}`, color: colors.inkSoft },
    winChance: { value: '-', color: colors.inkSoft },
  };

  const onReset = () =>
    showAlert('Reset stats?', 'This clears all your lifetime stats. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetStats },
    ]);

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="My Stats" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {games.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gameChips}>
            {[null, ...games].map((g) => {
              const active = (g?.id ?? null) === (picked?.id ?? null);
              const label = g
                ? `${shortWhen(g.startedAt, Date.now())} · ${g.netChips >= 0 ? '+' : ''}${g.netChips.toLocaleString()}`
                : 'All time';
              return (
                <Pressable
                  key={g?.id ?? 'all'}
                  onPress={() => setGameId(g?.id ?? null)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.gameChip, active && styles.gameChipActive]}
                >
                  <Text style={[styles.gameChipText, active && styles.gameChipTextActive]}>{label}</Text>
                  {g ? (
                    <Text style={[styles.gameChipMeta, active && styles.gameChipTextActive]}>
                      {`${g.kind === 'friends' ? 'Friends' : 'Bots'} · ${g.handsPlayed} hands`}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
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
              <LineChart
                data={stats.chipHistory}
                width={chartW}
                height={160}
                yTitle="Chips after each hand"
                xEnds={stackHistoryEnds(stats, Date.now())}
              />
            ) : (
              <Text style={styles.empty}>Play a few hands to see your stack trend.</Text>
            )}
          </WiiPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).duration(400).easing(Easing.bezier(...easings.out))}>
          <WiiPanel>
            <Text style={styles.section}>Win breakdown</Text>
            <WinBreakdownChart breakdown={viz.winBreakdown} width={chartW} />
            {viz.chipHighlights.hasData ? <ChipHighlightCards highlights={viz.chipHighlights} width={chartW} /> : null}
          </WiiPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(210).duration(400).easing(Easing.bezier(...easings.out))}>
          <WiiPanel>
            <Text style={styles.section}>Playing style</Text>
            <PlayingStyleChart map={viz.playingStyle} width={chartW} />
            <View style={styles.chartSpacer}>
              <RateGuideBars bars={viz.rateBars} width={chartW} />
            </View>
          </WiiPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(280).duration(400).easing(Easing.bezier(...easings.out))}>
          <WiiPanel>
            <Text style={styles.section}>Recent swings</Text>
            <HandSwingChart swings={viz.handSwings} width={chartW} />
          </WiiPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(350).duration(400).easing(Easing.bezier(...easings.out))}>
          <WiiButton label="Reset stats" variant="gold" size="md" fullWidth onPress={onReset} />
        </Animated.View>
        {ADS_ENABLED ? (
          <Animated.View entering={FadeInDown.delay(420).duration(400).easing(Easing.bezier(...easings.out))}>
            <AdBanner />
          </Animated.View>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  gameChips: { gap: spacing.sm, paddingRight: spacing.sm },
  gameChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.md, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  gameChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  gameChipText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  gameChipMeta: { fontFamily: fonts.medium, fontSize: 11, color: colors.inkMuted, marginTop: 1 },
  gameChipTextActive: { color: colors.onBlue },
  section: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', paddingVertical: spacing.sm, alignItems: 'center' },
  value: { fontFamily: fonts.bold, fontSize: 22 },
  metric: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  empty: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkMuted, paddingVertical: spacing.lg, textAlign: 'center' },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  chartSpacer: { marginTop: spacing.lg },
});
