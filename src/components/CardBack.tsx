import React, { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
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

export const cardBackColors = {
  rim: 'rgba(255,255,255,0.5)',
  panel: 'rgba(255,255,255,0.4)',
  emblemFill: 'rgba(255,255,255,0.14)',
  emblemStroke: 'rgba(255,255,255,0.45)',
  mark: 'rgba(255,255,255,0.9)',
};

/** The card back designs offered in Settings. */
export type CardBackVariant = 'blue' | 'red' | 'black' | 'holo' | 'retro';

export interface CardBackTheme {
  /** Gradient run across the card: top-left, middle, bottom-right. */
  gradient: readonly [string, string, string];
  rim: string;
  panel: string;
  emblemFill: string;
  emblemStroke: string;
  mark: string;
  /** The glyph in the middle, so the designs differ in shape and not just hue. */
  glyph: string;
}

/**
 * Every back is the same artwork in a different palette.
 *
 * Keeping one geometry and swapping only colours means a new design cannot
 * break the peel, which cuts into this exact shape, and guarantees all five
 * read equally well at an 18pt opponent card.
 *
 * `retro` is the one light design, so it carries ink-coloured accents instead
 * of the white the dark backs use; white on cream would disappear.
 */
export const CARD_BACK_THEMES: Record<CardBackVariant, CardBackTheme> = {
  blue: {
    gradient: [colors.cardBackEdge, colors.cardBack, colors.cardBackDeep],
    ...cardBackColors,
    glyph: '♠',
  },
  red: {
    gradient: ['#B4394A', '#8E1F32', '#5E0F1F'],
    ...cardBackColors,
    glyph: '♥',
  },
  black: {
    gradient: ['#4A4F58', '#282C33', '#14171B'],
    rim: 'rgba(255,255,255,0.42)',
    panel: 'rgba(255,255,255,0.32)',
    emblemFill: 'rgba(255,255,255,0.10)',
    emblemStroke: 'rgba(255,255,255,0.38)',
    mark: 'rgba(255,255,255,0.82)',
    glyph: '♣',
  },
  holo: {
    gradient: ['#6ED8D0', '#7A5CE0', '#2C1B6B'],
    rim: 'rgba(255,255,255,0.62)',
    panel: 'rgba(255,255,255,0.5)',
    emblemFill: 'rgba(255,255,255,0.2)',
    emblemStroke: 'rgba(255,255,255,0.6)',
    mark: 'rgba(255,255,255,0.95)',
    glyph: '◆',
  },
  retro: {
    gradient: ['#F3DCAE', '#E0B978', '#B9844A'],
    rim: 'rgba(92,58,20,0.45)',
    panel: 'rgba(92,58,20,0.38)',
    emblemFill: 'rgba(92,58,20,0.12)',
    emblemStroke: 'rgba(92,58,20,0.42)',
    mark: 'rgba(72,44,14,0.85)',
    glyph: '♦',
  },
};

export const DEFAULT_CARD_BACK: CardBackVariant = 'blue';

export function cardBackTheme(variant: CardBackVariant | undefined): CardBackTheme {
  return CARD_BACK_THEMES[variant ?? DEFAULT_CARD_BACK] ?? CARD_BACK_THEMES[DEFAULT_CARD_BACK];
}

export interface CardBackProps {
  size: number;
  /** Which design to draw. Defaults to the classic blue. */
  variant?: CardBackVariant;
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
  const gradId = `cardBack-${useId()}`;
  return (
    <Svg width={size} height={g.h}>
      <Defs>
        <LinearGradient id={gradId} x1={0} y1={0} x2={size} y2={g.h} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={theme.gradient[0]} />
          <Stop offset="0.5" stopColor={theme.gradient[1]} />
          <Stop offset="1" stopColor={theme.gradient[2]} />
        </LinearGradient>
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
