/**
 * Glyphs for the six Home tiles.
 *
 * One bold white symbol per tile, drawn on the tile's own accent colour. The
 * earlier illustrated scenes (faces, tables, a robot) read as a kids' game;
 * a single confident mark per tile reads as an app for adults.
 *
 * Every glyph draws on a 100 unit canvas centred on the origin. Each is drawn
 * twice: a soft dark copy nudged down for depth, then the white mark. Cut-outs
 * (the spade on the card, the coin's inner ring) are painted in the tile's
 * accent so they read as holes rather than a second colour.
 */
import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/theme';
import { shade } from '../theme/color';

interface TileIconProps {
  size?: number;
  /** The tile's accent, used for cut-outs. */
  accent?: string;
}

const DEFAULT_SIZE = 64;
const WHITE = '#FFFFFF';
const SHADOW = 'rgba(0,0,0,0.16)';

const SPADE =
  'M0,-14 C-10,-4 -16,2 -16,8 C-16,14 -10,17 -4,13 L-6,20 L6,20 L4,13 C10,17 16,14 16,8 C16,2 10,-4 0,-14Z';
const SPARKLE = 'M0,-8 L2.4,-2.4 L8,0 L2.4,2.4 L0,8 L-2.4,2.4 L-8,0 L-2.4,-2.4Z';

type Draw = (fill: string, cut: string, soft: number) => React.ReactNode;

function Glyph({ size = DEFAULT_SIZE, accent = colors.blue, draw }: TileIconProps & { draw: Draw }) {
  const cut = shade(accent, 0.05);
  return (
    <Svg width={size} height={size} viewBox="-50 -50 100 100">
      <G transform="translate(0,2.5)">{draw(SHADOW, SHADOW, 1)}</G>
      {draw(WHITE, cut, 0.55)}
    </Svg>
  );
}

export function PlayWithFriendsTileIcon(props: TileIconProps) {
  return (
    <Glyph
      {...props}
      draw={(fill, cut, soft) => (
        <>
          <G transform="rotate(-12) translate(-12,0)">
            <Rect x={-22} y={-32} width={44} height={62} rx={7} fill={fill} opacity={soft} />
          </G>
          <G transform="rotate(10) translate(10,0)">
            <Rect x={-22} y={-32} width={44} height={62} rx={7} fill={fill} />
            <Path d={SPADE} fill={cut} />
          </G>
        </>
      )}
    />
  );
}

export function QuickPlayTileIcon(props: TileIconProps) {
  return (
    <Glyph
      {...props}
      draw={(fill) => <Path d="M6,-40 L-22,6 L-2,6 L-8,40 L22,-8 L2,-8 Z" fill={fill} strokeLinejoin="round" />}
    />
  );
}

export function MyPalTileIcon(props: TileIconProps) {
  return (
    <Glyph
      {...props}
      draw={(fill) => (
        <>
          <Circle cx={-4} cy={-14} r={18} fill={fill} />
          <Path d="M-36,36 C-36,12 -20,6 -4,6 C12,6 28,12 28,36 Z" fill={fill} />
          <G transform="translate(30,-32) scale(1.3)">
            <Path d={SPARKLE} fill={fill} />
          </G>
        </>
      )}
    />
  );
}

export function FriendsTileIcon(props: TileIconProps) {
  return (
    <Glyph
      {...props}
      draw={(fill, _cut, soft) => (
        <>
          <G opacity={soft}>
            <Circle cx={16} cy={-16} r={13} fill={fill} />
            <Path d="M-2,30 C0,6 8,0 16,0 C26,0 38,6 38,30Z" fill={fill} />
          </G>
          <Circle cx={-12} cy={-10} r={15} fill={fill} />
          <Path d="M-40,36 C-40,12 -26,6 -12,6 C2,6 16,12 16,36Z" fill={fill} />
        </>
      )}
    />
  );
}

export function StatsTileIcon(props: TileIconProps) {
  return (
    <Glyph
      {...props}
      draw={(fill) => (
        <>
          <Rect x={-36} y={6} width={16} height={30} rx={4} fill={fill} />
          <Rect x={-8} y={-10} width={16} height={46} rx={4} fill={fill} />
          <Rect x={20} y={-30} width={16} height={66} rx={4} fill={fill} />
        </>
      )}
    />
  );
}

export function StoreTileIcon(props: TileIconProps) {
  return (
    <Glyph
      {...props}
      draw={(fill, cut) => (
        <>
          <Circle cx={0} cy={0} r={34} fill={fill} />
          <Circle cx={0} cy={0} r={24} fill="none" stroke={cut} strokeWidth={3} strokeDasharray="6 5" />
          <G transform="translate(0,-4) scale(1.1)">
            <Path d={SPADE} fill={cut} />
          </G>
        </>
      )}
    />
  );
}
