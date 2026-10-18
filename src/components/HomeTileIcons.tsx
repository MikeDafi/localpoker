/**
 * Illustrated icons for the six Home tiles.
 *
 * The flat one-colour glyphs in `Icons.tsx` read as stock system icons, and
 * the Home grid is what App Store screenshots lead with. These are small
 * scenes in the app's own cast instead: Pals, felt, cards and chips.
 *
 * Every icon draws on a 64 unit canvas and sits on the accent-coloured face of a
 * `WiiChannelTile`, so each one picks colours that stand off its own badge
 * (no gold coins left bare on the gold Store badge, no blue chips on indigo).
 * Each has the same three finishing passes so they read as one set: a
 * top-to-bottom gradient on every solid, a white highlight on the upper left,
 * and a soft contact shadow underneath.
 *
 * Kept separate from `Icons.tsx` on purpose: those glyphs take a `color` and
 * are used as monochrome UI icons on other screens, these do not.
 */
import React from 'react';
import Svg, {
  Circle, Ellipse, G, Path, Rect, Defs, LinearGradient, RadialGradient, Stop,
} from 'react-native-svg';
import { colors } from '../theme/theme';
import { shade, tint } from '../theme/color';

interface TileIconProps {
  size?: number;
}

const DEFAULT_SIZE = 56;
const INK = '#243141';

/**
 * Gradient ids are document-global in react-native-svg, so two icons sharing
 * an id would paint with whichever gradient registered last. `useId` contains
 * colons, which do not survive inside `url(#...)`, hence the scrub.
 */
function useSvgId(): string {
  return React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

/** A lit vertical ramp of one colour, keyed so it can be referenced by fill. */
function Ramp({ id, color, light = 0.28, dark = 0.2 }: { id: string; color: string; light?: number; dark?: number }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={tint(color, light)} />
      <Stop offset="0.55" stopColor={color} />
      <Stop offset="1" stopColor={shade(color, dark)} />
    </LinearGradient>
  );
}

/** Soft contact shadow, the thing that stops a scene floating on its badge. */
function GroundShadow({ id, cx = 32, cy = 58, rx = 25, ry = 4.2 }: { id: string; cx?: number; cy?: number; rx?: number; ry?: number }) {
  return <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />;
}

function ShadowGradient({ id }: { id: string }) {
  return (
    <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
      <Stop offset="0" stopColor="#0B1620" stopOpacity={0.42} />
      <Stop offset="1" stopColor="#0B1620" stopOpacity={0} />
    </RadialGradient>
  );
}

const HEART = 'M0 0.36 C-0.52 0 -0.5 -0.46 -0.22 -0.46 C-0.09 -0.46 0 -0.34 0 -0.26 C0 -0.34 0.09 -0.46 0.22 -0.46 C0.5 -0.46 0.52 0 0 0.36 Z';
const SPADE = 'M0 -0.46 C-0.52 -0.04 -0.5 0.3 -0.2 0.3 C-0.1 0.3 -0.04 0.24 0 0.17 C0.04 0.24 0.1 0.3 0.2 0.3 C0.5 0.3 0.52 -0.04 0 -0.46 Z M0 0.08 L0.13 0.46 L-0.13 0.46 Z';

function Suit({ suit, x, y, s, fill }: { suit: 'heart' | 'spade'; x: number; y: number; s: number; fill?: string }) {
  return (
    <Path
      d={suit === 'heart' ? HEART : SPADE}
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={fill ?? (suit === 'heart' ? colors.cardRed : colors.cardBlack)}
    />
  );
}

/** A face-up card with one big pip, which is what reads at 50pt. */
function Card({ x, y, w, h, rotate = 0, suit }: { x: number; y: number; w: number; h: number; rotate?: number; suit: 'heart' | 'spade' }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <G transform={`rotate(${rotate} ${cx} ${cy})`}>
      <Rect x={x + 0.6} y={y + 1} width={w} height={h} rx={w * 0.18} fill="#0B1620" opacity={0.22} />
      <Rect x={x} y={y} width={w} height={h} rx={w * 0.18} fill="#FFFFFF" stroke="#C9D6DF" strokeWidth={0.7} />
      <Suit suit={suit} x={cx} y={cy + h * 0.02} s={w * 0.62} />
    </G>
  );
}

interface MiniPalProps {
  id: string;
  cx: number;
  cy: number;
  r: number;
  skin: string;
  hair: string;
  shirt: string;
}

/**
 * The Pal reduced to what survives at icon size: round head, hair cap, dot
 * eyes with a glint, a smile and blush. The full `PalAvatar` draws thirty
 * features that turn to mush below 30pt.
 */
function MiniPal({ id, cx, cy, r, skin, hair, shirt }: MiniPalProps) {
  return (
    <G>
      <Defs>
        <Ramp id={`${id}s`} color={skin} light={0.2} dark={0.1} />
        <Ramp id={`${id}h`} color={hair} light={0.25} dark={0.25} />
        <Ramp id={`${id}b`} color={shirt} light={0.25} dark={0.25} />
      </Defs>
      <Path
        d={`M${cx - r * 1.25} ${cy + r * 2.3} C${cx - r * 1.25} ${cy + r * 1.1} ${cx - r * 0.7} ${cy + r * 0.85} ${cx} ${cy + r * 0.85} C${cx + r * 0.7} ${cy + r * 0.85} ${cx + r * 1.25} ${cy + r * 1.1} ${cx + r * 1.25} ${cy + r * 2.3} Z`}
        fill={`url(#${id}b)`}
      />
      <Circle cx={cx} cy={cy} r={r} fill={`url(#${id}s)`} />
      <Path
        d={`M${cx - r * 1.02} ${cy - r * 0.02} C${cx - r * 1.05} ${cy - r * 1.25} ${cx + r * 1.05} ${cy - r * 1.25} ${cx + r * 1.02} ${cy - r * 0.02} C${cx + r * 0.75} ${cy - r * 0.42} ${cx + r * 0.2} ${cy - r * 0.62} ${cx - r * 0.2} ${cy - r * 0.42} C${cx - r * 0.55} ${cy - r * 0.62} ${cx - r * 0.85} ${cy - r * 0.38} ${cx - r * 1.02} ${cy - r * 0.02} Z`}
        fill={`url(#${id}h)`}
      />
      <Ellipse cx={cx - r * 0.38} cy={cy - r * 0.62} rx={r * 0.3} ry={r * 0.13} fill="#FFFFFF" opacity={0.35} transform={`rotate(-20 ${cx - r * 0.38} ${cy - r * 0.62})`} />
      <Ellipse cx={cx - r * 0.55} cy={cy + r * 0.36} rx={r * 0.2} ry={r * 0.12} fill="#FF7A8A" opacity={0.45} />
      <Ellipse cx={cx + r * 0.55} cy={cy + r * 0.36} rx={r * 0.2} ry={r * 0.12} fill="#FF7A8A" opacity={0.45} />
      <Circle cx={cx - r * 0.36} cy={cy + r * 0.08} r={r * 0.14} fill={INK} />
      <Circle cx={cx + r * 0.36} cy={cy + r * 0.08} r={r * 0.14} fill={INK} />
      <Circle cx={cx - r * 0.31} cy={cy + r * 0.03} r={r * 0.05} fill="#FFFFFF" />
      <Circle cx={cx + r * 0.41} cy={cy + r * 0.03} r={r * 0.05} fill="#FFFFFF" />
      <Path
        d={`M${cx - r * 0.3} ${cy + r * 0.4} Q${cx} ${cy + r * 0.7} ${cx + r * 0.3} ${cy + r * 0.4}`}
        stroke={INK}
        strokeWidth={r * 0.12}
        strokeLinecap="round"
        fill="none"
      />
    </G>
  );
}

/** One poker chip seen from the front, with the white edge spots. */
function ChipLayer({ cx, y, rx, ry, t, color }: { cx: number; y: number; rx: number; ry: number; t: number; color: string }) {
  return (
    <G>
      <Ellipse cx={cx} cy={y} rx={rx} ry={ry} fill={shade(color, 0.35)} />
      <Rect x={cx - rx} y={y - t} width={rx * 2} height={t} fill={shade(color, 0.12)} />
      <Rect x={cx - rx * 0.16} y={y - t} width={rx * 0.32} height={t} fill="#FFFFFF" opacity={0.9} />
      <Rect x={cx - rx * 0.86} y={y - t} width={rx * 0.16} height={t} fill="#FFFFFF" opacity={0.7} />
      <Rect x={cx + rx * 0.7} y={y - t} width={rx * 0.16} height={t} fill="#FFFFFF" opacity={0.7} />
      <Ellipse cx={cx} cy={y - t} rx={rx} ry={ry} fill={tint(color, 0.08)} />
    </G>
  );
}

function ChipStack({ cx, base, count, color, rx = 7.4, ry = 2.9, t = 3.6 }: { cx: number; base: number; count: number; color: string; rx?: number; ry?: number; t?: number }) {
  const top = base - count * t;
  return (
    <G>
      {Array.from({ length: count }).map((_, i) => (
        <ChipLayer key={i} cx={cx} y={base - i * t} rx={rx} ry={ry} t={t} color={color} />
      ))}
      <Ellipse cx={cx} cy={top} rx={rx * 0.62} ry={ry * 0.62} fill="none" stroke="#FFFFFF" strokeWidth={0.9} strokeDasharray="1.6 1.4" opacity={0.85} />
      <Ellipse cx={cx - rx * 0.3} cy={top - ry * 0.25} rx={rx * 0.35} ry={ry * 0.3} fill="#FFFFFF" opacity={0.35} />
    </G>
  );
}

/** Four-point twinkle, for the bits that should feel like a reward. */
function Sparkle({ x, y, s, fill = '#FFFFFF' }: { x: number; y: number; s: number; fill?: string }) {
  return (
    <Path
      d="M0 -1 C0.12 -0.22 0.22 -0.12 1 0 C0.22 0.12 0.12 0.22 0 1 C-0.12 0.22 -0.22 0.12 -1 0 C-0.22 -0.12 -0.12 -0.22 0 -1 Z"
      transform={`translate(${x} ${y}) scale(${s})`}
      fill={fill}
    />
  );
}

/** Play with Friends: two Pals across a little felt table, mid-hand. */
export function PlayWithFriendsTileIcon({ size = DEFAULT_SIZE }: TileIconProps) {
  const id = useSvgId();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <ShadowGradient id={`${id}sh`} />
        <Ramp id={`${id}rail`} color="#7A4A2A" light={0.25} dark={0.35} />
        <RadialGradient id={`${id}felt`} cx="50%" cy="35%" rx="60%" ry="70%">
          <Stop offset="0" stopColor="#3DBE7E" />
          <Stop offset="0.7" stopColor="#25935A" />
          <Stop offset="1" stopColor="#1A6B43" />
        </RadialGradient>
      </Defs>
      <GroundShadow id={`${id}sh`} cy={58.5} rx={28} />
      <MiniPal id={`${id}a`} cx={14} cy={20} r={9} skin="#F5C9A0" hair="#5B3A29" shirt={colors.red} />
      <MiniPal id={`${id}b`} cx={50} cy={20} r={9} skin="#C68B5E" hair="#22252E" shirt={colors.amber} />
      <Ellipse cx={32} cy={47} rx={30} ry={11} fill={`url(#${id}rail)`} />
      <Ellipse cx={32} cy={45.6} rx={26} ry={8.4} fill={`url(#${id}felt)`} />
      <Ellipse cx={26} cy={41.4} rx={13} ry={2.6} fill="#FFFFFF" opacity={0.16} />
      <Card x={21.5} y={31} w={10} h={14} rotate={-12} suit="heart" />
      <Card x={32.5} y={30.5} w={10} h={14} rotate={10} suit="spade" />
      <ChipStack cx={46} base={48.5} count={2} color={colors.chipBlue} rx={4.6} ry={1.8} t={2.4} />
      <ChipStack cx={18} base={48.5} count={3} color={colors.red} rx={4.6} ry={1.8} t={2.4} />
    </Svg>
  );
}

/** Quick Play: a bot Pal, ready with a hand of cards. */
export function QuickPlayTileIcon({ size = DEFAULT_SIZE }: TileIconProps) {
  const id = useSvgId();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <ShadowGradient id={`${id}sh`} />
        <LinearGradient id={`${id}metal`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.5" stopColor="#DCE6EE" />
          <Stop offset="1" stopColor="#A9BBC9" />
        </LinearGradient>
        <LinearGradient id={`${id}visor`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A3E52" />
          <Stop offset="1" stopColor="#111C27" />
        </LinearGradient>
        <RadialGradient id={`${id}bulb`} cx="38%" cy="32%" rx="65%" ry="65%">
          <Stop offset="0" stopColor="#FFD3CC" />
          <Stop offset="0.45" stopColor={colors.red} />
          <Stop offset="1" stopColor={colors.redDeep} />
        </RadialGradient>
        <Ramp id={`${id}bolt`} color="#FFD23F" light={0.4} dark={0.15} />
      </Defs>
      <GroundShadow id={`${id}sh`} />
      <Rect x={30.9} y={6} width={2.2} height={8} rx={1.1} fill="#8EA3B3" />
      <Circle cx={32} cy={6} r={5} fill={colors.red} opacity={0.25} />
      <Circle cx={32} cy={6} r={3.2} fill={`url(#${id}bulb)`} />
      <Rect x={8.5} y={21} width={6} height={11} rx={2.5} fill={`url(#${id}metal)`} stroke="#8296A5" strokeWidth={0.8} />
      <Rect x={49.5} y={21} width={6} height={11} rx={2.5} fill={`url(#${id}metal)`} stroke="#8296A5" strokeWidth={0.8} />
      <Rect x={20} y={39} width={24} height={16} rx={6} fill={`url(#${id}metal)`} stroke="#8296A5" strokeWidth={0.8} />
      <Rect x={13} y={12.5} width={38} height={28} rx={11} fill={`url(#${id}metal)`} stroke="#8296A5" strokeWidth={0.9} />
      <Path d="M17 18 C19 14.5 26 14 30 14.3" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.9} />
      <Rect x={18} y={19} width={28} height={14} rx={7} fill={`url(#${id}visor)`} />
      <Ellipse cx={25.5} cy={26} rx={3.6} ry={4} fill="#5FF3E6" opacity={0.3} />
      <Ellipse cx={38.5} cy={26} rx={3.6} ry={4} fill="#5FF3E6" opacity={0.3} />
      <Ellipse cx={25.5} cy={26} rx={2.3} ry={2.8} fill="#7DF9EE" />
      <Ellipse cx={38.5} cy={26} rx={2.3} ry={2.8} fill="#7DF9EE" />
      <Circle cx={24.7} cy={25} r={0.8} fill="#FFFFFF" />
      <Circle cx={37.7} cy={25} r={0.8} fill="#FFFFFF" />
      <Card x={15} y={37} w={12} h={17} rotate={-18} suit="heart" />
      <Card x={37} y={37} w={12} h={17} rotate={18} suit="heart" />
      <Card x={26} y={35} w={12} h={17} suit="spade" />
      <Circle cx={21.5} cy={51} r={3.2} fill={`url(#${id}metal)`} stroke="#8296A5" strokeWidth={0.8} />
      <Circle cx={42.5} cy={51} r={3.2} fill={`url(#${id}metal)`} stroke="#8296A5" strokeWidth={0.8} />
      <Path
        d="M55 2 L47.5 13.5 L52 13.5 L49 22 L58 9.5 L53.4 9.5 L56.5 2 Z"
        fill={`url(#${id}bolt)`}
        stroke="#B9800A"
        strokeWidth={0.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** My Pal: a Pal next to a paint palette and a loaded brush. */
export function MyPalTileIcon({ size = DEFAULT_SIZE }: TileIconProps) {
  const id = useSvgId();
  const blobs: [number, number, string][] = [
    [38, 45, colors.red],
    [44, 40.5, '#FFD23F'],
    [51.5, 41, colors.blue],
    [56, 47.5, colors.green],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <ShadowGradient id={`${id}sh`} />
        <LinearGradient id={`${id}wood`} x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor="#F8DDAE" />
          <Stop offset="0.6" stopColor="#E3AE6C" />
          <Stop offset="1" stopColor="#B97B3D" />
        </LinearGradient>
        <Ramp id={`${id}handle`} color="#E2574C" light={0.3} dark={0.25} />
      </Defs>
      <GroundShadow id={`${id}sh`} />
      <MiniPal id={`${id}p`} cx={24} cy={23} r={13} skin="#F2C29A" hair="#E07A2E" shirt={colors.teal} />
      <Path
        d="M31 47 C30 37.5 43 33 53 35.5 C62 37.8 63 47 58 51.5 C54.5 54.5 51.5 50 47.5 52.5 C43.5 55 45.5 59.5 39.5 59.5 C34 59.5 31.4 53.5 31 47 Z"
        fill={`url(#${id}wood)`}
        stroke="#9C6531"
        strokeWidth={0.9}
      />
      <Ellipse cx={46.5} cy={52.6} rx={2.6} ry={2} fill="#9C6531" opacity={0.75} />
      <Path d="M34 43 C36 38.5 42 36.5 47 36.6" stroke="#FFFFFF" strokeWidth={1.3} strokeLinecap="round" fill="none" opacity={0.6} />
      {blobs.map(([x, y, c]) => (
        <G key={`${x}-${y}`}>
          <Circle cx={x} cy={y} r={3.1} fill={c} stroke={shade(c, 0.25)} strokeWidth={0.6} />
          <Circle cx={x - 0.9} cy={y - 1} r={0.9} fill="#FFFFFF" opacity={0.75} />
        </G>
      ))}
      <G transform="rotate(38 50 16)">
        <Rect x={48} y={-1} width={4.2} height={18} rx={2.1} fill={`url(#${id}handle)`} />
        <Rect x={48.9} y={0.5} width={1.1} height={13} rx={0.55} fill="#FFFFFF" opacity={0.5} />
        <Rect x={47.6} y={16} width={5} height={4.2} rx={0.8} fill="#C9D3DA" stroke="#8B9AA5" strokeWidth={0.5} />
        <Path d="M47.8 20 C47.6 24 48.8 27.4 50.1 29.4 C51.4 27.4 52.6 24 52.4 20 Z" fill="#6E4A2B" />
        <Path d="M48.2 24 C48.6 26.2 49.3 28 50.1 29.4 C50.9 28 51.6 26.2 52 24 Z" fill={colors.accentPink} />
      </G>
      <Sparkle x={8} y={46} s={3.2} />
    </Svg>
  );
}

/** Friends: two Pals waving hello, with a heart between them. */
export function FriendsTileIcon({ size = DEFAULT_SIZE }: TileIconProps) {
  const id = useSvgId();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <ShadowGradient id={`${id}sh`} />
        <Ramp id={`${id}heart`} color="#F23B57" light={0.35} dark={0.15} />
      </Defs>
      <GroundShadow id={`${id}sh`} />
      {/* Back Pal, waving with the far arm. */}
      <Path d="M49 40 L56.5 22" stroke="#B8794C" strokeWidth={4.4} strokeLinecap="round" />
      <Circle cx={56.8} cy={20.6} r={3.4} fill="#C68B5E" />
      <MiniPal id={`${id}b`} cx={42} cy={24} r={10} skin="#C68B5E" hair="#22252E" shirt={colors.green} />
      {/* Front Pal, waving with the near arm. */}
      <Path d="M12.5 46 L6.5 28" stroke="#E3A97C" strokeWidth={4.8} strokeLinecap="round" />
      <Circle cx={6.3} cy={26.4} r={3.8} fill="#F5C9A0" />
      <MiniPal id={`${id}a`} cx={23} cy={30} r={11.5} skin="#F5C9A0" hair="#7A4A2A" shirt={colors.blue} />
      <Path d="M2 21 C1.6 19 2.4 17.4 3.6 16.6" stroke="#FFFFFF" strokeWidth={1.3} strokeLinecap="round" fill="none" />
      <Path d="M10.4 20 C11.6 21 12 22.8 11.7 24.4" stroke="#FFFFFF" strokeWidth={1.3} strokeLinecap="round" fill="none" />
      <Path d="M61.6 16.4 C62.6 18 62.6 20 61.8 21.4" stroke="#FFFFFF" strokeWidth={1.3} strokeLinecap="round" fill="none" />
      <G>
        <Suit suit="heart" x={33} y={9.5} s={14} fill={`url(#${id}heart)`} />
        <Path d={HEART} transform="translate(33 9.5) scale(14)" fill="none" stroke="#FFFFFF" strokeWidth={0.09} />
        <Ellipse cx={29.6} cy={6.6} rx={1.8} ry={1.1} fill="#FFFFFF" opacity={0.7} transform="rotate(-30 29.6 6.6)" />
      </G>
    </Svg>
  );
}

/** My Stats: chip stacks rising like a bar chart, with a trend arrow. */
export function StatsTileIcon({ size = DEFAULT_SIZE }: TileIconProps) {
  const id = useSvgId();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <ShadowGradient id={`${id}sh`} />
      </Defs>
      <GroundShadow id={`${id}sh`} cy={57.5} rx={28} />
      <ChipStack cx={13} base={54} count={3} color={colors.red} />
      <ChipStack cx={31} base={54} count={5} color={colors.green} />
      <ChipStack cx={49} base={54} count={8} color={colors.gold} />
      <Path d="M6 33 L20 25 L30 28 L48 11" stroke="#FFFFFF" strokeWidth={6.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M6 33 L20 25 L30 28 L48 11" stroke="#2EDB86" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M41.5 7.5 L54 4.5 L51 17 Z" fill="#2EDB86" stroke="#FFFFFF" strokeWidth={1.4} strokeLinejoin="round" />
    </Svg>
  );
}

/** Store: a felt-green coin bag with gold coins spilling out of it. */
export function StoreTileIcon({ size = DEFAULT_SIZE }: TileIconProps) {
  const id = useSvgId();
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <ShadowGradient id={`${id}sh`} />
        <LinearGradient id={`${id}bag`} x1="0.2" y1="0" x2="0.7" y2="1">
          <Stop offset="0" stopColor="#4FCB8C" />
          <Stop offset="0.55" stopColor="#24925A" />
          <Stop offset="1" stopColor="#156A3F" />
        </LinearGradient>
        <RadialGradient id={`${id}coin`} cx="38%" cy="32%" rx="70%" ry="70%">
          <Stop offset="0" stopColor="#FFF4C2" />
          <Stop offset="0.45" stopColor="#FFCB3D" />
          <Stop offset="1" stopColor="#D08E0B" />
        </RadialGradient>
        <Ramp id={`${id}rope`} color="#FFCB3D" light={0.35} dark={0.3} />
      </Defs>
      <GroundShadow id={`${id}sh`} cy={58} rx={27} />
      <Path d="M22.5 25 C20 19.5 22.5 14.5 25 12.5 L35 12.5 C37.5 14.5 40 19.5 37.5 25 Z" fill={`url(#${id}bag)`} stroke="#0F5432" strokeWidth={0.9} />
      <Path d="M24.5 12.5 L27.5 16 L30 12.5 L32.5 16 L35.5 12.5" stroke="#0F5432" strokeWidth={0.9} fill="none" strokeLinejoin="round" />
      <Path d="M22 27 C13 32 8 42 11 50 C13 56.5 47 56.5 49 50 C52 42 47 32 38 27 Z" fill={`url(#${id}bag)`} stroke="#0F5432" strokeWidth={0.9} />
      <Path d="M17 37 C18.5 33 21.5 30.5 24.5 29.5" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.55} />
      <Rect x={20.5} y={23.5} width={19} height={5} rx={2.5} fill={`url(#${id}rope)`} stroke="#9A6A06" strokeWidth={0.7} />
      <Circle cx={30} cy={41.5} r={7.2} fill={`url(#${id}coin)`} stroke="#9A6A06" strokeWidth={0.9} />
      <Suit suit="spade" x={30} y={41.5} s={8.4} fill="#156A3F" />
      <Ellipse cx={14} cy={55} rx={8} ry={3} fill="#B07607" />
      <Ellipse cx={14} cy={53} rx={8} ry={3} fill={`url(#${id}coin)`} stroke="#9A6A06" strokeWidth={0.7} />
      <Circle cx={49} cy={46} r={10.5} fill={`url(#${id}coin)`} stroke="#9A6A06" strokeWidth={1} />
      <Circle cx={49} cy={46} r={7.4} fill="none" stroke="#B07607" strokeWidth={1} opacity={0.75} />
      <Suit suit="spade" x={49} y={46} s={9} fill="#B07607" />
      <Ellipse cx={45} cy={41} rx={2.6} ry={1.4} fill="#FFFFFF" opacity={0.7} transform="rotate(-35 45 41)" />
      <Sparkle x={53} y={14} s={4.6} />
      <Sparkle x={10} y={20} s={3} />
      <Sparkle x={60} y={30} s={2.2} />
    </Svg>
  );
}
