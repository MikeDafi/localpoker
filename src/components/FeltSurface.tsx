import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Svg, { Defs, Ellipse, G, Path, Pattern, Rect } from 'react-native-svg';
import { colors } from '../theme/theme';
import type { FeltMotif } from '../game/cosmetics';

/**
 * The felt's surface detail: a woven cloth texture plus a tonal suit watermark.
 *
 * Both layers come from permissively licensed sources rather than hand-drawn
 * shapes (see assets/textures/CREDITS.md):
 *  - weave: a Poly Haven CC0 fabric photograph, reduced to a 256px tiling
 *    alpha mask by scripts/make-weave-tile.py
 *  - suits: Bootstrap Icons (MIT) `suit-*-fill` glyph paths
 *
 * Every real poker table we looked at carries a cloth treatment only a few
 * percent off the base colour, so both layers are deliberately near-threshold.
 */

/** Bootstrap Icons `suit-*-fill`, 16x16 viewBox. MIT © The Bootstrap Authors. */
const SUITS = {
  spade:
    'M7.184 11.246A3.5 3.5 0 0 1 1 9c0-1.602 1.14-2.633 2.66-4.008C4.986 3.792 6.602 2.33 8 0c1.398 2.33 3.014 3.792 4.34 4.992C13.86 6.367 15 7.398 15 9a3.5 3.5 0 0 1-6.184 2.246 20 20 0 0 0 1.582 2.907c.231.35-.02.847-.438.847H6.04c-.419 0-.67-.497-.438-.847a20 20 0 0 0 1.582-2.907',
  heart:
    'M4 1c2.21 0 4 1.755 4 3.92C8 2.755 9.79 1 12 1s4 1.755 4 3.92c0 3.263-3.234 4.414-7.608 9.608a.513.513 0 0 1-.784 0C3.234 9.334 0 8.183 0 4.92 0 2.755 1.79 1 4 1',
  diamond:
    'M2.45 7.4 7.2 1.067a1 1 0 0 1 1.6 0L13.55 7.4a1 1 0 0 1 0 1.2L8.8 14.933a1 1 0 0 1-1.6 0L2.45 8.6a1 1 0 0 1 0-1.2',
  club:
    'M11.5 12.5a3.5 3.5 0 0 1-2.684-1.254 20 20 0 0 0 1.582 2.907c.231.35-.02.847-.438.847H6.04c-.419 0-.67-.497-.438-.847a20 20 0 0 0 1.582-2.907 3.5 3.5 0 1 1-2.538-5.743 3.5 3.5 0 1 1 6.708 0A3.5 3.5 0 1 1 11.5 12.5',
} as const;

export interface FeltSurfaceProps {
  /** Explicit size of the surface. `resizeMode="repeat"` and SVG percentage
   *  sizing are both unreliable against an auto-sized absolute fill, so the
   *  parent passes the felt's measured dimensions. */
  width: number;
  height: number;
  /** Tile size for the suit watermark, in px. */
  tile?: number;
  /** Opacity of the woven cloth layer. */
  weaveOpacity?: number;
  /** Opacity of the suit watermark. */
  suitOpacity?: number;
  /** What is printed into the cloth. The classic table has suits. */
  motif?: FeltMotif;
  /** Colour of the motif. */
  motifColor?: string;
}

/** A four-point star, 16x16. */
const STAR = 'M8 0 L9.6 6.4 L16 8 L9.6 9.6 L8 16 L6.4 9.6 L0 8 L6.4 6.4 Z';

/**
 * One tile of a felt's printed motif.
 *
 * Each is drawn on the same tile as the suits so the cloth repeats at the
 * same scale whichever felt is down.
 */
function MotifTile({ motif, tile, color }: { motif: FeltMotif; tile: number; color: string }) {
  if (motif === 'lattice') {
    // A diamond weave: two diagonals per tile, thin as a stitch.
    return (
      <G stroke={color} strokeWidth={1.2} fill="none">
        <Path d={`M0 ${tile / 2} L${tile / 2} 0 L${tile} ${tile / 2} L${tile / 2} ${tile} Z`} />
        <Path d={`M${tile / 2} ${tile / 2 - 3} L${tile / 2 + 3} ${tile / 2} L${tile / 2} ${tile / 2 + 3} L${tile / 2 - 3} ${tile / 2} Z`} fill={color} />
      </G>
    );
  }
  if (motif === 'waves') {
    const row = (y: number) => {
      const q = tile / 4;
      return `M0 ${y} Q${q} ${y - 10} ${q * 2} ${y} T${tile} ${y}`;
    };
    return (
      <G stroke={color} strokeWidth={2} fill="none" strokeLinecap="round">
        <Path d={row(tile * 0.3)} />
        <Path d={row(tile * 0.8)} />
      </G>
    );
  }
  if (motif === 'petals') {
    // Five-petal blossoms at two sizes and turns, so the fall looks loose.
    const blossom = (cx: number, cy: number, r: number, turn: number) => (
      <G transform={`translate(${cx} ${cy}) rotate(${turn})`}>
        {[0, 72, 144, 216, 288].map((a) => (
          <Ellipse key={a} cx={0} cy={-r} rx={r * 0.55} ry={r} transform={`rotate(${a})`} />
        ))}
      </G>
    );
    return (
      <G fill={color}>
        {blossom(tile * 0.25, tile * 0.22, tile * 0.05, 12)}
        {blossom(tile * 0.72, tile * 0.6, tile * 0.035, 40)}
        <Ellipse cx={tile * 0.5} cy={tile * 0.88} rx={tile * 0.03} ry={tile * 0.016} transform={`rotate(30 ${tile * 0.5} ${tile * 0.88})`} />
      </G>
    );
  }
  if (motif === 'stars') {
    const star = (fx: number, fy: number, size: number) => (
      <G transform={`translate(${tile * fx - size / 2} ${tile * fy - size / 2}) scale(${size / 16})`}>
        <Path d={STAR} />
      </G>
    );
    return (
      <G fill={color}>
        {star(0.2, 0.18, tile * 0.07)}
        {star(0.7, 0.45, tile * 0.045)}
        {star(0.35, 0.78, tile * 0.03)}
        <Rect x={tile * 0.85} y={tile * 0.12} width={2} height={2} rx={1} />
        <Rect x={tile * 0.55} y={tile * 0.92} width={2} height={2} rx={1} />
        <Rect x={tile * 0.08} y={tile * 0.55} width={1.5} height={1.5} rx={0.75} />
      </G>
    );
  }
  return null;
}

export function FeltSurface({ width, height, tile = 184, weaveOpacity = 0.5, suitOpacity = 0.045, motif = 'suits', motifColor = colors.onDark }: FeltSurfaceProps) {
  // Half-drop layout: the right-hand column is offset vertically so the repeat
  // reads as a diagonal lattice instead of a polka-dot grid.
  const glyph = tile * 0.155; // drawn size of one suit
  const k = glyph / 16; // Bootstrap's 16x16 viewBox -> our size
  const place = (fx: number, fy: number) =>
    `translate(${tile * fx - glyph / 2} ${tile * fy - glyph / 2}) scale(${k})`;

  if (width <= 0 || height <= 0) return null;

  return (
    <View
      style={[styles.fill, { width, height }]}
      pointerEvents="none"
      // Cloth texture and suit watermark are decoration, not content.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={require('../../assets/textures/felt-weave.png')}
        style={{ width, height, opacity: weaveOpacity }}
        resizeMode="repeat"
        fadeDuration={0}
      />
      <Svg style={styles.fill} width={width} height={height} opacity={suitOpacity}>
        <Defs>
          <Pattern id="suits" width={tile} height={tile} patternUnits="userSpaceOnUse">
            {motif === 'suits' ? (
              <G fill={motifColor}>
                <G transform={place(0.25, 0.125)}><Path d={SUITS.spade} /></G>
                <G transform={place(0.75, 0.375)}><Path d={SUITS.heart} /></G>
                <G transform={place(0.25, 0.625)}><Path d={SUITS.diamond} /></G>
                <G transform={place(0.75, 0.875)}><Path d={SUITS.club} /></G>
              </G>
            ) : (
              <MotifTile motif={motif} tile={tile} color={motifColor} />
            )}
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#suits)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
