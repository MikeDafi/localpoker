import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { resolveChips, type ChipPalette } from '../game/cosmetics';

/**
 * Denominations, coloured by whichever chip set the table is using.
 *
 * The values are fixed because they are the game; only the colours come from
 * the palette, so a bought chip set changes what the chips look like and
 * never what they are worth.
 */
const DENOM_VALUES: { value: number; slot: keyof ChipPalette }[] = [
  { value: 1000, slot: 'gold' },
  { value: 500, slot: 'purple' },
  { value: 100, slot: 'black' },
  { value: 25, slot: 'green' },
  { value: 5, slot: 'red' },
  { value: 1, slot: 'white' },
];

/** Break an amount into chip counts per denomination (largest first). */
function breakdown(amount: number, palette: ChipPalette): { color: string; edge: string; count: number }[] {
  let remaining = Math.max(0, Math.floor(amount));
  const out: { color: string; edge: string; count: number }[] = [];
  for (const d of DENOM_VALUES) {
    const [color, edge] = palette[d.slot];
    if (remaining >= d.value) {
      const count = Math.min(5, Math.floor(remaining / d.value));
      out.push({ color, edge, count });
      remaining -= count * d.value;
    }
    if (out.length >= 4) break;
  }
  const [color, edge] = palette.white;
  return out.length ? out : [{ color, edge, count: 1 }];
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
  /*
   * Read from the table's settings rather than taken as a prop.
   *
   * Chips are drawn in a dozen places: pods, bet pills, the pot, every chip
   * in flight. Threading a palette through all of them would mean a dozen
   * chances for one of them to be missed and keep rendering the old colours.
   */
  const { settings, cosmetics } = useApp();
  const palette = resolveChips({
    setting: settings.chipStyle,
    equippedId: cosmetics.equippedByCategory.chips,
    owned: cosmetics.ownedCosmeticIds,
  });
  const stacks = breakdown(amount, palette);
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
