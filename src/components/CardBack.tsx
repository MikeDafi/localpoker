import React, { useId } from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Line,
  Path,
  Pattern,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { latticeTile, rosetteRings } from '../game/cardBackPattern';
import {
  CARD_BACK_PALETTES,
  CLASSIC_CARD_BACK,
  type CardBackPalette,
} from '../game/cosmetics';
import { colors } from '../theme/theme';

/**
 * The geometry of a card back, in one place.
 *
 * Every face-down card in the game is drawn from these numbers: the hero's
 * hole cards, the opponents' cards, the deck. They used to be drawn twice,
 * once as stacked React Native views and once as SVG for the peel, which meant
 * the two drifted, and the small cards quietly dropped the panel and the emblem
 * below a size threshold so opponents were dealt visibly plainer cards than the
 * player.
 *
 * Everything is a fraction of the card's width, so one design scales from an
 * 18pt opponent card to an 86pt hole card without a special case.
 */
export function cardBackGeometry(size: number) {
  const h = size * 1.42;
  /**
   * The white card stock showing around the printed back.
   *
   * A real card is white board with the design printed inside a margin, and the
   * face here already draws that white with a hairline edge. The back used to
   * run its colour to the very edge, so a face-down card had no white on it at
   * all and read as a different object from the same card turned over.
   */
  const stock = Math.max(1, size * 0.038);
  // Matches the face's outer radius, so both sides share one silhouette.
  const radius = size * 0.085;
  return {
    h,
    stock,
    radius,
    print: {
      x: stock,
      y: stock,
      w: size - stock * 2,
      h: h - stock * 2,
      radius: Math.max(1, radius - stock * 0.6),
    },
    // Hairline rim: what separates a face-down card from the felt behind it.
    rim: Math.min(2, Math.max(0.6, size * 0.045)),
    panel: {
      x: size * 0.13,
      y: h * 0.09,
      w: size * 0.74,
      h: h * 0.82,
      radius: size * 0.15,
      stroke: Math.min(1.5, Math.max(0.5, size * 0.022)),
    },
    emblem: {
      cx: size / 2,
      cy: h / 2,
      r: size * 0.23,
      stroke: Math.min(1, Math.max(0.4, size * 0.016)),
      // The suit mark, sized to sit inside the disc at any card size.
      fontSize: size * 0.4,
      // Text baselines sit low; this lifts the glyph to the disc's centre.
      baseline: h / 2 + size * 0.145,
    },
  };
}

/** The card back designs, by id: the five built in and the five the store sells. */
export type CardBackVariant = string;

export type CardBackTheme = CardBackPalette;

export const CARD_BACK_THEMES = CARD_BACK_PALETTES;

export const DEFAULT_CARD_BACK = CLASSIC_CARD_BACK;

export function cardBackTheme(variant: CardBackVariant | undefined): CardBackTheme {
  return CARD_BACK_PALETTES[variant ?? DEFAULT_CARD_BACK] ?? CARD_BACK_PALETTES[DEFAULT_CARD_BACK]!;
}

export interface CardBackProps {
  size: number;
  /** Which design to draw. Defaults to the classic blue. */
  variant?: CardBackVariant;
}

/**
 * The lattice, as a tiling pattern rather than as loose lines.
 *
 * Drawn line by line this is around thirty nodes per card, and a full table is
 * seventeen face-down cards. As a `<Pattern>` it is one definition that the
 * renderer repeats, so the cost does not grow with the number of cards.
 *
 * Belongs inside a `<Defs>`.
 */
export function CardBackLattice({ id, size, color }: { id: string; size: number; color: string }) {
  const t = latticeTile(size);
  return (
    <Pattern
      id={id}
      x={0}
      y={0}
      width={t.pitch}
      height={t.pitch}
      patternUnits="userSpaceOnUse"
    >
      {t.secondary.map((l, i) => (
        <Line
          key={`s${i}`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={color}
          strokeWidth={t.secondaryStroke}
          opacity={0.55}
        />
      ))}
      {t.primary.map((l, i) => (
        <Line
          key={`p${i}`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={color}
          strokeWidth={t.primaryStroke}
        />
      ))}
      <Circle cx={t.pitch / 2} cy={t.pitch / 2} r={t.dot} fill={color} opacity={0.7} />
    </Pattern>
  );
}

/**
 * The engraved medallion behind the suit disc.
 *
 * Sized to the emblem so the disc always covers the rosette's busiest part and
 * the glyph keeps a clean field to sit on.
 */
export function CardBackRosette({ size, color }: { size: number; color: string }) {
  const g = cardBackGeometry(size);
  return (
    <G>
      {rosetteRings(g.emblem.cx, g.emblem.cy, g.emblem.r * 1.55).map((ring, i) => (
        <Path
          key={i}
          d={ring.d}
          fill="none"
          stroke={color}
          strokeWidth={ring.stroke}
          opacity={ring.opacity}
        />
      ))}
    </G>
  );
}

/**
 * The back of a playing card.
 *
 * Drawn as SVG rather than nested views so it is the same artwork the peel
 * cuts into, and so the detail survives being scaled down instead of being
 * switched off.
 */
export function CardBack({ size, variant }: CardBackProps) {
  const g = cardBackGeometry(size);
  const theme = cardBackTheme(variant);
  // Gradient ids share a namespace, so each card needs its own.
  const uid = useId();
  const gradId = `cardBack-${uid}`;
  const latticeId = `cardBackLattice-${uid}`;
  return (
    <Svg width={size} height={g.h}>
      <Defs>
        <LinearGradient id={gradId} x1={0} y1={0} x2={size} y2={g.h} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={theme.gradient[0]} />
          <Stop offset="0.5" stopColor={theme.gradient[1]} />
          <Stop offset="1" stopColor={theme.gradient[2]} />
        </LinearGradient>
        <CardBackLattice id={latticeId} size={size} color={theme.line} />
      </Defs>
      <Rect
        x={0.5}
        y={0.5}
        width={size - 1}
        height={g.h - 1}
        rx={g.radius}
        fill={colors.cardFace}
        stroke="#E2E8EE"
        strokeWidth={1}
      />
      <Rect
        x={g.print.x}
        y={g.print.y}
        width={g.print.w}
        height={g.print.h}
        rx={g.print.radius}
        fill={`url(#${gradId})`}
        stroke={theme.rim}
        strokeWidth={Math.min(g.rim, g.stock)}
      />
      {/* The engraving, laid over the colour and inside the same printed area
          so it stops exactly where the white stock begins. */}
      <Rect
        x={g.print.x}
        y={g.print.y}
        width={g.print.w}
        height={g.print.h}
        rx={g.print.radius}
        fill={`url(#${latticeId})`}
      />
      <CardBackRosette size={size} color={theme.line} />
      <Rect
        x={g.panel.x}
        y={g.panel.y}
        width={g.panel.w}
        height={g.panel.h}
        rx={g.panel.radius}
        fill="none"
        stroke={theme.panel}
        strokeWidth={g.panel.stroke}
      />
      <Circle
        cx={g.emblem.cx}
        cy={g.emblem.cy}
        r={g.emblem.r}
        fill={theme.emblemFill}
        stroke={theme.emblemStroke}
        strokeWidth={g.emblem.stroke}
      />
      <SvgText
        x={g.emblem.cx}
        y={g.emblem.baseline}
        fontSize={g.emblem.fontSize}
        fill={theme.mark}
        textAnchor="middle"
      >
        {theme.glyph}
      </SvgText>
    </Svg>
  );
}
