import React, { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme/theme';

/**
 * The geometry of a card back, in one place.
 *
 * Every face-down card in the game is drawn from these numbers: the hero's
 * hole cards, the opponents' cards, the deck. They used to be drawn twice —
 * once as stacked React Native views and once as SVG for the peel — which meant
 * the two drifted, and the small cards quietly dropped the panel and the emblem
 * below a size threshold so opponents were dealt visibly plainer cards than the
 * player.
 *
 * Everything is a fraction of the card's width, so one design scales from an
 * 18pt opponent card to an 86pt hole card without a special case.
 */
export function cardBackGeometry(size: number) {
  const h = size * 1.42;
  return {
    h,
    radius: size * 0.1,
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

export interface CardBackProps {
  size: number;
}

/**
 * The back of a playing card.
 *
 * Drawn as SVG rather than nested views so it is the same artwork the peel
 * cuts into, and so the detail survives being scaled down instead of being
 * switched off.
 */
export function CardBack({ size }: CardBackProps) {
  const g = cardBackGeometry(size);
  // Gradient ids share a namespace, so each card needs its own.
  const gradId = `cardBack-${useId()}`;
  return (
    <Svg width={size} height={g.h}>
      <Defs>
        <LinearGradient id={gradId} x1={0} y1={0} x2={size} y2={g.h} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors.cardBackEdge} />
          <Stop offset="0.5" stopColor={colors.cardBack} />
          <Stop offset="1" stopColor={colors.cardBackDeep} />
        </LinearGradient>
      </Defs>
      <Rect
        x={g.rim / 2}
        y={g.rim / 2}
        width={size - g.rim}
        height={g.h - g.rim}
        rx={g.radius}
        fill={`url(#${gradId})`}
        stroke={cardBackColors.rim}
        strokeWidth={g.rim}
      />
      <Rect
        x={g.panel.x}
        y={g.panel.y}
        width={g.panel.w}
        height={g.panel.h}
        rx={g.panel.radius}
        fill="none"
        stroke={cardBackColors.panel}
        strokeWidth={g.panel.stroke}
      />
      <Circle
        cx={g.emblem.cx}
        cy={g.emblem.cy}
        r={g.emblem.r}
        fill={cardBackColors.emblemFill}
        stroke={cardBackColors.emblemStroke}
        strokeWidth={g.emblem.stroke}
      />
      <SvgText
        x={g.emblem.cx}
        y={g.emblem.baseline}
        fontSize={g.emblem.fontSize}
        fill={cardBackColors.mark}
        textAnchor="middle"
      >
        ♠
      </SvgText>
    </Svg>
  );
}
