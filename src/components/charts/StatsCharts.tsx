import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { colors, fonts, numeric, radii, spacing } from '../../theme/theme';
import type {
  ChipHighlights,
  HandSwingSummary,
  PlayingStyleMap,
  RateBars,
  RateMetricKey,
  WinBreakdown,
  WinSegmentId,
} from '../../game/statsViz';

const WIN_COLORS: Record<WinSegmentId, string> = {
  showdown: colors.green,
  withoutShowdown: colors.blue,
  lost: colors.red,
};

const RATE_COLORS: Record<RateMetricKey, string> = {
  vpip: colors.blue,
  pfr: colors.blueDeep,
  winRate: colors.green,
  showdownWinRate: colors.gold,
};

const formatSigned = (value: number) => `${value >= 0 ? '+' : ''}${value.toLocaleString()}`;
const chartWidth = (width: number) => Math.max(1, width);
const pctX = (value: number, width: number) => chartWidth(width) * Math.max(0, Math.min(value, 100)) / 100;

export function WinBreakdownChart({ breakdown, width }: { breakdown: WinBreakdown; width: number }) {
  if (!breakdown.hasData) {
    return <Text style={styles.empty}>Play a hand to see how your wins and losses split.</Text>;
  }

  const barWidth = chartWidth(width);
  const segments = breakdown.segments.map((segment, index) => {
    const x = barWidth * breakdown.segments.slice(0, index).reduce((sum, item) => sum + item.share, 0);
    const segmentWidth = segment.id === 'lost' ? barWidth - x : barWidth * segment.share;
    return { ...segment, x, segmentWidth };
  });

  return (
    <View style={styles.block}>
      <Svg width={barWidth} height={24}>
        <Rect x={0} y={3} width={barWidth} height={18} rx={9} fill={colors.panelAlt} />
        {segments.map((segment) => {
          return segment.segmentWidth > 0 ? (
            <Rect key={segment.id} x={segment.x} y={3} width={segment.segmentWidth} height={18} rx={9} fill={WIN_COLORS[segment.id]} />
          ) : null;
        })}
      </Svg>
      <View style={styles.legendGrid}>
        {breakdown.segments.map((segment) => (
          <View key={segment.id} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: WIN_COLORS[segment.id] }]} />
            <Text style={styles.legendLabel}>{segment.label}</Text>
            <Text style={styles.legendValue}>{segment.value.toLocaleString()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PlayingStyleChart({ map, width }: { map: PlayingStyleMap; width: number }) {
  if (!map.hasData) {
    return <Text style={styles.empty}>Play a few hands to map your VPIP and PFR style.</Text>;
  }

  const size = Math.max(180, Math.min(chartWidth(width), 280));
  const pad = 30;
  const plot = size - pad * 2;
  const splitX = pad + (map.thresholds.looseVpip / 100) * plot;
  const splitY = pad + plot - (map.thresholds.aggressivePfr / 100) * plot;
  const dotX = pad + (map.vpip / 100) * plot;
  const dotY = pad + plot - (map.pfr / 100) * plot;
  const targetX = pad + (map.target.vpip.min / 100) * plot;
  const targetY = pad + plot - (map.target.pfr.max / 100) * plot;
  const targetW = ((map.target.vpip.max - map.target.vpip.min) / 100) * plot;
  const targetH = ((map.target.pfr.max - map.target.pfr.min) / 100) * plot;

  return (
    <View style={styles.centerBlock}>
      <Svg width={size} height={size}>
        <Rect x={pad} y={pad} width={plot} height={plot} rx={16} fill={colors.panelAlt} />
        <Rect x={pad} y={pad} width={splitX - pad} height={splitY - pad} fill="rgba(46,184,119,0.10)" />
        <Rect x={splitX} y={pad} width={pad + plot - splitX} height={splitY - pad} fill="rgba(238,81,64,0.08)" />
        <Rect x={pad} y={splitY} width={splitX - pad} height={pad + plot - splitY} fill="rgba(21,159,227,0.08)" />
        <Rect x={splitX} y={splitY} width={pad + plot - splitX} height={pad + plot - splitY} fill="rgba(240,180,42,0.10)" />
        <Rect x={targetX} y={targetY} width={targetW} height={targetH} rx={8} fill="rgba(46,184,119,0.22)" stroke={colors.green} strokeWidth={1.5} />
        <Line x1={splitX} y1={pad} x2={splitX} y2={pad + plot} stroke={colors.borderStrong} strokeWidth={1} strokeDasharray="4 5" />
        <Line x1={pad} y1={splitY} x2={pad + plot} y2={splitY} stroke={colors.borderStrong} strokeWidth={1} strokeDasharray="4 5" />
        <Line x1={pad} y1={pad + plot} x2={pad + plot} y2={pad + plot} stroke={colors.inkMuted} strokeWidth={1.5} />
        <Line x1={pad} y1={pad} x2={pad} y2={pad + plot} stroke={colors.inkMuted} strokeWidth={1.5} />
        <SvgText x={pad + plot * 0.25} y={pad + 18} fill={colors.inkMuted} fontSize={10} fontFamily={fonts.medium} textAnchor="middle">
          Tight aggressive
        </SvgText>
        <SvgText x={pad + plot * 0.75} y={pad + 18} fill={colors.inkMuted} fontSize={10} fontFamily={fonts.medium} textAnchor="middle">
          Loose aggressive
        </SvgText>
        <SvgText x={pad + plot * 0.25} y={pad + plot - 8} fill={colors.inkMuted} fontSize={10} fontFamily={fonts.medium} textAnchor="middle">
          Tight passive
        </SvgText>
        <SvgText x={pad + plot * 0.75} y={pad + plot - 8} fill={colors.inkMuted} fontSize={10} fontFamily={fonts.medium} textAnchor="middle">
          Loose passive
        </SvgText>
        <Circle cx={dotX} cy={dotY} r={7} fill={colors.blueDeep} stroke="#fff" strokeWidth={3} />
      </Svg>
      <Text style={styles.callout}>{map.label}</Text>
      <Text style={styles.note}>VPIP rises to the right. PFR rises upward.</Text>
    </View>
  );
}

export function RateGuideBars({ bars, width }: { bars: RateBars; width: number }) {
  if (!bars.hasData) {
    return <Text style={styles.empty}>Play a few hands to compare your rates with guide ranges.</Text>;
  }

  return (
    <View style={styles.block}>
      {bars.metrics.map((metric) => {
        const barWidth = chartWidth(width);
        const rangeX = pctX(metric.range.min, barWidth);
        const rangeW = pctX(metric.range.max - metric.range.min, barWidth);
        const valueX = pctX(metric.value, barWidth);
        const color = metric.hasSample ? RATE_COLORS[metric.key] : colors.inkMuted;
        return (
          <View key={metric.key} style={styles.rateRow}>
            <View style={styles.rateHeader}>
              <Text style={styles.rateLabel}>{metric.label}</Text>
              <Text style={[styles.rateValue, { color }]}>{metric.value}%</Text>
            </View>
            <Svg width={barWidth} height={16}>
              <Rect x={0} y={4} width={barWidth} height={8} rx={4} fill={colors.panelAlt} />
              <Rect x={rangeX} y={3} width={rangeW} height={10} rx={5} fill={colors.gold} opacity={0.28} />
              <Rect x={0} y={5} width={valueX} height={6} rx={3} fill={color} />
              <Circle cx={valueX} cy={8} r={5} fill={color} stroke="#fff" strokeWidth={2} />
            </Svg>
            <Text style={styles.note}>{metric.guide}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function HandSwingChart({ swings, width }: { swings: HandSwingSummary; width: number }) {
  if (!swings.hasData) {
    const message = swings.observedStacks === 1
      ? 'Play one more hand to compare hand by hand swings.'
      : 'Play a few hands to see hand by hand swings.';
    return <Text style={styles.empty}>{message}</Text>;
  }

  const barWidth = chartWidth(width);
  const height = 96;
  const mid = height / 2;
  const gap = 2;
  const count = swings.recent.length;
  const itemW = Math.max(3, (barWidth - gap * Math.max(0, count - 1)) / count);
  const scale = swings.maxAbs || 1;

  return (
    <View style={styles.block}>
      <Svg width={barWidth} height={height}>
        <Line x1={0} y1={mid} x2={barWidth} y2={mid} stroke={colors.borderStrong} strokeWidth={1} />
        {swings.recent.map((value, index) => {
          const h = Math.min(mid - 6, Math.abs(value) / scale * (mid - 6));
          const x = index * (itemW + gap);
          const y = value >= 0 ? mid - h : mid;
          const color = value > 0 ? colors.green : value < 0 ? colors.red : colors.inkMuted;
          return <Rect key={`${index}-${value}`} x={x} y={y} width={itemW} height={Math.max(1, h)} rx={2} fill={color} />;
        })}
      </Svg>
      <View style={styles.swingStats}>
        <View style={styles.statPill}>
          <Text style={styles.pillLabel}>Best hand</Text>
          <Text style={[styles.pillValue, { color: colors.green }]}>{formatSigned(swings.best ?? 0)}</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.pillLabel}>Worst hand</Text>
          <Text style={[styles.pillValue, { color: colors.red }]}>{formatSigned(swings.worst ?? 0)}</Text>
        </View>
      </View>
    </View>
  );
}

export function ChipHighlightCards({ highlights, width }: { highlights: ChipHighlights; width: number }) {
  if (!highlights.hasData) {
    return <Text style={styles.empty}>Play a hand to see chip highlights.</Text>;
  }

  const barWidth = Math.max(120, chartWidth(width) / 2 - spacing.sm);
  const netW = barWidth * highlights.netShare / 2;
  const potW = barWidth * highlights.potShare;
  const netColor = highlights.netChips >= 0 ? colors.green : colors.red;

  return (
    <View style={styles.highlightGrid}>
      <View style={styles.highlightCard}>
        <Text style={styles.pillLabel}>Net chips</Text>
        <Text style={[styles.highlightValue, { color: netColor }]}>{formatSigned(highlights.netChips)}</Text>
        <Svg width={barWidth} height={16}>
          <Rect x={0} y={5} width={barWidth} height={6} rx={3} fill={colors.panelAlt} />
          <Line x1={barWidth / 2} y1={2} x2={barWidth / 2} y2={14} stroke={colors.borderStrong} strokeWidth={1} />
          <Rect
            x={highlights.netChips >= 0 ? barWidth / 2 : barWidth / 2 - netW}
            y={4}
            width={Math.max(1, netW)}
            height={8}
            rx={4}
            fill={netColor}
          />
        </Svg>
      </View>
      <View style={styles.highlightCard}>
        <Text style={styles.pillLabel}>Biggest pot</Text>
        <Text style={[styles.highlightValue, { color: colors.accent }]}>{highlights.biggestPotWon.toLocaleString()}</Text>
        <Svg width={barWidth} height={16}>
          <Rect x={0} y={5} width={barWidth} height={6} rx={3} fill={colors.panelAlt} />
          <Rect x={0} y={4} width={Math.max(1, potW)} height={8} rx={4} fill={colors.accent} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  centerBlock: { alignItems: 'center', gap: spacing.sm },
  empty: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkMuted, paddingVertical: spacing.md, textAlign: 'center' },
  legendGrid: { gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  legendValue: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, ...numeric },
  callout: { fontFamily: fonts.bold, fontSize: 16, color: colors.blueDeep },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  rateRow: { gap: spacing.xs },
  rateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rateLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.inkSoft },
  rateValue: { fontFamily: fonts.bold, fontSize: 14, ...numeric },
  swingStats: { flexDirection: 'row', gap: spacing.sm },
  statPill: { flex: 1, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.panelAlt },
  pillLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  pillValue: { marginTop: 2, fontFamily: fonts.bold, fontSize: 16, ...numeric },
  highlightGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  highlightCard: { flex: 1, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.panelAlt, gap: spacing.xs },
  highlightValue: { fontFamily: fonts.bold, fontSize: 20, ...numeric },
});
