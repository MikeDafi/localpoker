import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, fonts } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { resolveChips, type ChipPalette } from '../game/cosmetics';
import { chipStackGeometry, compactChipCount, shade, vivid } from '../game/chipStackLook';

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
 * It reads as depth because the only complete face is the top ellipse. Every
 * chip under it contributes a curved wall slice, so the pile recedes in the
 * same direction as a real stack instead of repeating flat discs.
 *
 * Drawn from geometry rather than from an image, for the same reason the card
 * backs are: no licence, and it stays sharp at any size.
 */
function ChipPile({ color, edge, size = 22, count = 1 }: { color: string; edge: string; size?: number; count?: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (count <= 0) return null;
  const geometry = chipStackGeometry(size, count);
  const face = vivid(color, 0.32);
  const faceTop = shade(face, 0.3);
  const faceBottom = shade(face, -0.18);
  const wallLit = shade(color, 0.08);
  const wallMid = shade(color, -0.22);
  const wallDark = shade(color, -0.52);
  const edgeSpot = shade(vivid(edge, 0.2), 0.18);
  const rim = shade(edge, -0.12);
  const seamLight = shade(edgeSpot, 0.28);
  const seamDark = shade(edge, -0.56);
  /*
   * Unique per rendered pile: duplicate gradient ids make separate stacks
   * borrow each other's last-mounted colours inside the same Svg tree.
   */

  return (
    <Svg width={geometry.width} height={geometry.height}>
      <Defs>
        <LinearGradient id={`face-${uid}`} x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor={faceTop} />
          <Stop offset="0.55" stopColor={face} />
          <Stop offset="1" stopColor={faceBottom} />
        </LinearGradient>
        <LinearGradient id={`wall-${uid}`} x1="0.12" y1="0" x2="0.82" y2="1">
          <Stop offset="0" stopColor={wallLit} />
          <Stop offset="0.45" stopColor={wallMid} />
          <Stop offset="1" stopColor={wallDark} />
        </LinearGradient>
      </Defs>
      <Ellipse
        cx={geometry.rx}
        cy={geometry.height - geometry.faceRy * 0.08}
        rx={geometry.rx * 0.86}
        ry={geometry.faceRy * 0.32}
        fill="rgba(0,0,0,0.18)"
      />
      {geometry.walls.map((wall) => (
        <React.Fragment key={wall.chipIndexFromTop}>
          <Path d={wall.path} fill={`url(#wall-${uid})`} />
          <Path d={wall.path} fill="rgba(0,0,0,0.45)" opacity={wall.shadowOpacity} />
          {wall.spotPaths.map((path, i) => (
            <Path
              key={`${wall.chipIndexFromTop}-${i}`}
              d={path}
              fill={edgeSpot}
              opacity={0.9}
              stroke="rgba(255,255,255,0.26)"
              strokeWidth={geometry.strokeWidth * 0.32}
            />
          ))}
          {!geometry.drawSeams && (
            <Path
              d={wall.frontRimPath}
              fill="none"
              stroke={shade(edge, -0.32)}
              strokeWidth={geometry.strokeWidth * 0.7}
              opacity={0.65}
            />
          )}
        </React.Fragment>
      ))}
      {geometry.drawSeams &&
        geometry.walls.map((wall) => (
          <React.Fragment key={`seams-${wall.chipIndexFromTop}`}>
            <Path
              d={wall.baseShadowPath}
              fill="none"
              stroke={seamDark}
              strokeWidth={geometry.seamStrokeWidth}
              opacity={0.86}
            />
            {wall.chipIndexFromTop > 0 && (
              <Path
                d={wall.topLipPath}
                fill="none"
                stroke={seamLight}
                strokeWidth={geometry.seamStrokeWidth * 0.78}
                opacity={0.9}
              />
            )}
          </React.Fragment>
        ))}
      <Ellipse
        cx={geometry.rx}
        cy={geometry.topFaceCy}
        rx={geometry.rx}
        ry={geometry.faceRy}
        fill={`url(#face-${uid})`}
        stroke={rim}
        strokeWidth={geometry.strokeWidth}
      />
      <Ellipse
        cx={geometry.rx}
        cy={geometry.topFaceCy}
        rx={geometry.rimRx}
        ry={geometry.rimRy}
        fill="none"
        stroke={edgeSpot}
        strokeWidth={geometry.strokeWidth * 1.2}
        strokeDasharray={`${geometry.dashLength},${geometry.dashLength * 0.82}`}
      />
      <Ellipse
        cx={geometry.rx}
        cy={geometry.topFaceCy}
        rx={geometry.centerRx}
        ry={geometry.centerRy}
        fill="rgba(255,255,255,0.1)"
      />
      <Ellipse
        cx={geometry.glossCx}
        cy={geometry.glossCy}
        rx={geometry.glossRx}
        ry={geometry.glossRy}
        fill="rgba(255,255,255,0.32)"
      />
    </Svg>
  );
}

export interface ChipStackProps {
  amount: number;
  size?: number;
  showLabel?: boolean;
  compact?: boolean;
  /**
   * Draw a specific chip set rather than the table's.
   *
   * Only the Store needs this, to show a set you have not bought and so
   * cannot have equipped. The table never passes it, which is what keeps the
   * guarantee below true for every chip drawn during a hand.
   */
  palette?: ChipPalette;
}

export function ChipStack({ amount, size = 26, showLabel = true, compact, palette: override }: ChipStackProps) {
  /*
   * Read from the table's settings rather than taken as a prop.
   *
   * Chips are drawn in a dozen places: pods, bet pills, the pot, every chip
   * in flight. Threading a palette through all of them would mean a dozen
   * chances for one of them to be missed and keep rendering the old colours.
   */
  const { settings, cosmetics } = useApp();
  const equipped = resolveChips({
    setting: settings.chipStyle,
    equippedId: cosmetics.equippedByCategory.chips,
    owned: cosmetics.ownedCosmeticIds,
  });
  const palette = override ?? equipped;
  const stacks = breakdown(amount, palette);
  return (
    <View style={styles.row}>
      {!compact &&
        stacks.map((s, i) => (
          <View key={i} style={styles.stack}>
            <ChipPile color={s.color} edge={s.edge} size={size} count={s.count} />
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
          <ChipPile color={stacks[0].color} edge={stacks[0].edge} size={size} count={compactChipCount(amount)} />
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
