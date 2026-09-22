import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/theme';

const DENOMS: { value: number; color: string; edge: string }[] = [
  { value: 1000, color: colors.chipGold, edge: '#B8860B' },
  { value: 500, color: colors.chipPurple, edge: '#5B3AA0' },
  { value: 100, color: colors.chipBlack, edge: '#000' },
  { value: 25, color: colors.chipGreen, edge: '#186B3D' },
  { value: 5, color: colors.chipRed, edge: '#A82C22' },
  { value: 1, color: colors.chipWhite, edge: '#B8C4CC' },
];

/** Break an amount into chip counts per denomination (largest first). */
function breakdown(amount: number): { color: string; edge: string; count: number }[] {
  let remaining = Math.max(0, Math.floor(amount));
  const out: { color: string; edge: string; count: number }[] = [];
  for (const d of DENOMS) {
    if (remaining >= d.value) {
      const count = Math.min(5, Math.floor(remaining / d.value));
      out.push({ color: d.color, edge: d.edge, count });
      remaining -= count * d.value;
    }
    if (out.length >= 4) break;
  }
  return out.length ? out : [{ color: colors.chipWhite, edge: '#B8C4CC', count: 1 }];
}

function Chip({ color, edge, size = 22 }: { color: string; edge: string; size?: number }) {
  return (
    <View
      style={[
        styles.chip,
        { width: size, height: size * 0.34, borderRadius: size, backgroundColor: color, borderColor: edge },
      ]}
    >
      <View style={styles.chipDash} />
    </View>
  );
}

export interface ChipStackProps {
  amount: number;
  size?: number;
  showLabel?: boolean;
  compact?: boolean;
}

export function ChipStack({ amount, size = 26, showLabel = true, compact }: ChipStackProps) {
  const stacks = breakdown(amount);
  return (
    <View style={styles.row}>
      {!compact &&
        stacks.map((s, i) => (
          <View key={i} style={styles.stack}>
            {Array.from({ length: s.count }).map((_, j) => (
              <View key={j} style={{ marginTop: j === 0 ? 0 : -size * 0.24 }}>
                <Chip color={s.color} edge={s.edge} size={size} />
              </View>
            ))}
          </View>
        ))}
      {compact && <Chip color={stacks[0].color} edge={stacks[0].edge} size={size} />}
      {showLabel && (
        <Text style={styles.label}>{amount.toLocaleString()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  stack: { marginRight: 5, justifyContent: 'flex-end' },
  chip: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDash: {
    width: '55%',
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  label: {
    marginLeft: 6,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
});
