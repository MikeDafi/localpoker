import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';
import { colors, fonts } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { resolveChips, type ChipPalette } from '../game/cosmetics';
import { compactChipCount } from '../game/chipStackLook';

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

/**
 * A poker chip seen from slightly above, which is how one actually looks.
 *
 * It used to be a flat pill: a rounded rectangle with a line across it. That
 * reads as a counter rather than a chip, because the two things the eye uses
 * to recognise one were missing. A chip has a round face you are looking down
 * on, so it is an ellipse rather than a bar, and it has thickness, so there is
 * a wall under that face with the light catching it.
 *
 * Drawn from geometry rather than from an image, for the same reason the card
 * backs are: no licence, and it stays sharp at any size.
 */
/**
 * How much of each chip the one above it covers.
 *
 * A chip is now 0.77 of its width tall, face plus wall, so hiding 0.60 of it
 * leaves exactly the wall showing. That is what a stack looks like: one face
 * on top and a row of edges under it, rather than a pile of whole chips.
 */
const CHIP_OVERLAP = 0.6;

function Chip({ color, edge, size = 22 }: { color: string; edge: string; size?: number }) {
  const rx = size / 2;
  const ry = size * 0.3;
  const wall = Math.max(2, size * 0.17);
  const h = ry * 2 + wall;
  // Where the wall begins at a given x: the underside of the face.
  const wallTop = (x: number) => ry + ry * Math.sqrt(Math.max(0, 1 - ((x - rx) / rx) ** 2));
  // The pale blocks around a chip's edge. Four read as a chip; more at this
  // size just turns the wall into a dotted line.
  const spots = [0.18, 0.4, 0.62, 0.84].map((t) => t * size);
  const spotW = Math.max(1.5, size * 0.11);

  return (
    <Svg width={size} height={h}>
      {/* The wall, traced under the face and down to the base. */}
      <Path
        d={`M0,${ry} A${rx},${ry} 0 0 0 ${size},${ry} L${size},${ry + wall} A${rx},${ry} 0 0 1 0,${ry + wall} Z`}
        fill={edge}
      />
      {spots.map((x, i) => (
        <Rect
          key={i}
          x={Math.max(0, x - spotW / 2)}
          y={wallTop(x) - 0.5}
          width={spotW}
          height={wall}
          fill="rgba(255,255,255,0.72)"
          rx={spotW * 0.25}
        />
      ))}
      {/* The face, and the dashed ring every chip has printed round it. */}
      <Ellipse cx={rx} cy={ry} rx={rx} ry={ry} fill={color} stroke={edge} strokeWidth={Math.max(0.6, size * 0.035)} />
      <Ellipse
        cx={rx}
        cy={ry}
        rx={rx * 0.78}
        ry={ry * 0.72}
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={Math.max(0.8, size * 0.055)}
        strokeDasharray={`${Math.max(1.4, size * 0.1)},${Math.max(1.4, size * 0.1)}`}
      />
      <Ellipse cx={rx} cy={ry} rx={rx * 0.52} ry={ry * 0.46} fill="rgba(255,255,255,0.1)" />
    </Svg>
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
              <View key={j} style={{ marginTop: j === 0 ? 0 : -CHIP_OVERLAP * size }}>
                <Chip color={s.color} edge={s.edge} size={size} />
              </View>
            ))}
          </View>
        ))}
      {compact && (
        /*
         * A stack rather than one chip.
         *
         * This is what a pod and a bet pill draw, and it used to be a single
         * puck whatever the amount was, so 20 and 20,000 were the same
         * picture and the chips carried no information at all. Stacked from
         * the top denomination's colour, because at this size the height is
         * the only thing legible and the colour is what says which chips.
         */
        <View style={styles.stack}>
          {Array.from({ length: compactChipCount(amount) }).map((_, j) => (
            <View key={j} style={{ marginTop: j === 0 ? 0 : -CHIP_OVERLAP * size }}>
              <Chip color={stacks[0].color} edge={stacks[0].edge} size={size} />
            </View>
          ))}
        </View>
      )}
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
