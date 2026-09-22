import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { G, Image as SvgImage, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, radii, shadows } from '../theme/theme';
import { CardBack } from './CardBack';
import { courtArt } from '../game/courtArt';
import {
  SUIT_PATH,
  Suit,
  faceGeometry,
  indexScaleX,
  isCourt,
  pipLayout,
  pipTransform,
  rankLabel,
} from '../game/cardFace';

export type { Suit };
export { RANK_LABEL, rankLabel } from '../game/cardFace';

export interface PlayingCardProps {
  /** Four-index printing, for cards you peel from any corner. */
  corners?: 2 | 4;
  rank?: number;
  suit?: Suit;
  faceDown?: boolean;
  size?: number; // width in px
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * What is printed on the face of a card, as SVG children.
 *
 * Separate from the card itself because the peel has to draw exactly this,
 * folded over. When the two were drawn from different code the lifted corner
 * showed a stand-in — a single large rank and suit — which is not what is on
 * the card and so never looked like paper folding back. Anything added to a
 * card face now automatically appears on the fold as well.
 *
 * `paper` draws the white card stock. The fold leaves it off, because there the
 * paper is already drawn with the shading that makes the flap read as lifted.
 */
export function CardFaceContent({
  rank,
  suit,
  size,
  paper = true,
  corners = 2,
}: {
  rank: number;
  suit: Suit;
  size: number;
  paper?: boolean;
  /**
   * How many corners carry the rank.
   *
   * Two is the classic printing and what the board uses. Your own cards use
   * four, because you peel them from whichever corner your thumb reaches and a
   * two-index card shows nothing but pips from half of them. Four-index decks
   * exist in the real world for exactly this reason.
   */
  corners?: 2 | 4;
}) {
  const g = faceGeometry(size);
  const isRed = suit === 'h' || suit === 'd';
  const ink = isRed ? colors.cardRed : colors.cardBlack;
  const label = rankLabel(rank);
  const squeeze = indexScaleX(label, g);

  /** The rank over its little suit, at one corner. */
  const mark = (x: number, key: string) => (
    <G key={key}>
      <G transform={`translate(${x}, ${g.index.rankBaseline}) scale(${squeeze}, 1)`}>
        <SvgText x={0} y={0} fontSize={g.index.rankFont} fontWeight="700" fill={ink} textAnchor="middle">
          {label}
        </SvgText>
      </G>
      <Path d={SUIT_PATH[suit]} fill={ink} transform={pipTransform(x, g.index.suitY, g.index.suitH, false)} />
    </G>
  );

  /** The top corners, and the same pair turned head to toe for the bottom. */
  const xs = corners === 4 ? [g.index.x, g.w - g.index.x] : [g.index.x];
  const index = (flipped: boolean) => (
    <G
      key={flipped ? 'idx-b' : 'idx-t'}
      transform={flipped ? `rotate(180, ${g.w / 2}, ${g.h / 2})` : undefined}
    >
      {xs.map((x, i) => mark(x, `${flipped ? 'b' : 't'}${i}`))}
    </G>
  );

  return (
    <G>
      {paper ? (
        <Rect
          x={0.5}
          y={0.5}
          width={g.w - 1}
          height={g.h - 1}
          rx={g.w * 0.085}
          fill={colors.cardFace}
          stroke="#E2E8EE"
          strokeWidth={1}
        />
      ) : null}
      {isCourt(rank) ? (
        <CourtFigure geometry={g} rank={rank} suit={suit} />
      ) : (
        pipLayout(rank).map((p, i) => (
          <Path
            key={`pip${i}`}
            d={SUIT_PATH[suit]}
            fill={ink}
            transform={pipTransform(p.x * g.w, p.y * g.h, g.pip.h * p.scale, p.inverted)}
          />
        ))
      )}
      {index(false)}
      {index(true)}
    </G>
  );
}

/**
 * A playing card.
 *
 * The face is drawn from `cardFace`'s measured layout and `suitPaths`' real
 * outlines, so a ten has ten pips in the places a printed ten has them. The
 * version this replaced drew a single oversized suit symbol in the middle,
 * which meant every card of a suit was the same picture with a different corner
 * number — legible, but it did not look like a card, and at a glance you could
 * not tell a seven from a three without reading.
 *
 * Drawn as SVG rather than nested views for the same reason the back is: one
 * description that stays sharp and keeps its proportions from an 18pt
 * opponent's card up to an 86pt hole card, instead of a pile of size
 * thresholds that quietly switch detail off.
 */
export function PlayingCard({ rank, suit, faceDown, size = 56, dimmed, style, corners }: PlayingCardProps) {
  const g = useMemo(() => faceGeometry(size), [size]);
  const cardOpacity = dimmed ? 0.55 : 1;

  if (faceDown || rank == null || suit == null) {
    // One shared back at every size: an opponent's 18pt card is the same
    // artwork as your 86pt hole card, just smaller.
    return (
      <View style={[styles.card, { width: g.w, height: g.h, opacity: cardOpacity }, shadows.soft, style]}>
        <CardBack size={size} />
      </View>
    );
  }

  return (
    <View style={[styles.card, { width: g.w, height: g.h, opacity: cardOpacity }, shadows.soft, style]}>
      <Svg width={g.w} height={g.h}>
        <CardFaceContent rank={rank} suit={suit} size={size} corners={corners} />
      </Svg>
    </View>
  );
}

/**
 * The middle of a jack, queen or king: the real thing.
 *
 * Court cards are the one part of a deck you cannot derive from a layout table
 * — they are illustrations, and a bad imitation of one looks far worse at 46pt
 * than an honest abstraction. This draws the actual public-domain figures,
 * cropped to the central panel so the app's own corner index is the only index
 * on the card.
 *
 * Raster rather than vector, unusually for this codebase: each source figure is
 * 140–190 KB of dense Bezier work, and asking react-native-svg to walk hundreds
 * of paths for every court card on the board is a poor trade for detail nobody
 * can see at this size.
 *
 * `meet` fits the figure inside its box without distorting it. The box is the
 * panel measured off the source deck, but those cards are 2:3 where these are
 * 1:1.42, so the height is what binds — a stretched king would be obvious.
 */
function CourtFigure({
  geometry: g,
  rank,
  suit,
}: {
  geometry: ReturnType<typeof faceGeometry>;
  rank: number;
  suit: Suit;
}) {
  const art = courtArt(rank, suit);
  if (art == null) return null;
  return (
    <SvgImage
      href={art}
      x={g.court.art.x}
      y={g.court.art.y}
      width={g.court.art.w}
      height={g.court.art.h}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
});
