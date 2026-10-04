import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSequence, cancelAnimation, Easing, ZoomIn, FadeOut, FadeInDown } from 'react-native-reanimated';
import { AnimatedPal } from './AnimatedPal';
import { PlayingCard } from './PlayingCard';
import { DealtCard } from './DealtCard';
import { colors, fonts, radii, shadows, spacing, numeric, motion, easings } from '../theme/theme';
import type { PalConfig } from '../avatar/palConfig';
import type { PalExpression } from './PalAvatar';
import type { Emote } from './EmoteBar';
import type { Player } from '../engine';
import type { CardBackVariant } from './CardBack';
import type { MaybeHoleCard } from '../game/holeCardExposure';

export interface SeatProps {
  player: Player;
  pal: PalConfig;
  isCurrent: boolean;
  isDealer: boolean;
  isHuman: boolean;
  showCards?: boolean;
  shownCards?: readonly boolean[];
  displayCards?: readonly MaybeHoleCard[];
  won?: boolean;
  /**
   * Beaten at a showdown.
   *
   * Gold alone only says who won; it leaves everyone else looking exactly as
   * they did mid-hand, so a player has to read the result panel to find out
   * they lost. Red says it on the seat, and only for someone who actually got
   * to the end of the hand: folding is not losing a showdown.
   */
  lost?: boolean;
  reaction?: PalExpression;
  idleMotion?: boolean;
  /** Compact vertical pod (avatar over a small name tag), used for opponents. */
  compact?: boolean;
  /** A reaction the player is currently "saying" (shown as a bubble). */
  emote?: Emote | null;
  /** Changes each hand so the deal animation replays. */
  dealKey?: string;
  /** Offset (px) the cards are thrown from, the middle of the felt. */
  dealFrom?: { x: number; y: number };
  /** Delay before this player's first card is thrown. */
  dealDelay?: number;
  /** Gap between this player's first and second card (one lap of the table). */
  dealStep?: number;
  /** Whether to animate the deal at all (off when resuming or anims disabled). */
  dealAnimate?: boolean;
  showBet?: boolean;
  /**
   * Avatar diameter for a compact pod. A short-handed table has room to spare,
   * so faces get bigger the fewer opponents there are - at six-plus they have to
   * shrink or neighbouring pods collide on the seat arc.
   */
  avatarSize?: number;
  /**
   * The showdown overlay has taken ownership of this player's hole cards and is
   * flying them to the middle, so the pod must stop drawing its own copy.
   */
  handOff?: boolean;
  /** Which card back design to print, from Settings. */
  back?: CardBackVariant;
  /**
   * Whether to print the player's name. Off leaves the avatar and stack, which
   * is the point: you still know whose seat it is and what they have.
   */
  showName?: boolean;
}

/** A player pod around the felt: animated Pal, name, stack, status, and cards. */
/**
 * How tall the bet row is, with or without a pill in it.
 *
 * A constant rather than a measurement, because the entire point is that it
 * never changes: the pod's height is what the lane and the board are measured
 * from, so anything that can resize it moves the whole table.
 */
const BET_SLOT_H = 22;

export function Seat({ player, pal, isCurrent, isDealer, isHuman, showCards, shownCards, displayCards, won, lost, reaction, idleMotion = true, compact = false, emote = null, dealKey, dealFrom, dealDelay = 0, dealStep = 400, dealAnimate = true, showBet = true, handOff = false, back, showName = true, avatarSize = 42 }: SeatProps) {
  const dimmed = player.folded || player.sittingOut;
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (isCurrent) {
      pulse.value = withRepeat(withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = 0;
    }
    return () => cancelAnimation(pulse);
  }, [isCurrent, pulse]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: pulse.value, transform: [{ scale: 1 + pulse.value * 0.06 }] }));

  // Hole cards sit tiny beside the avatar while they're face down. Once they're
  // turned over they have to be readable, so they're rendered at full size and
  // scaled *down* while hidden, scaling a 18pt card up would just look soft.
  const HOLE_SIZE = 24;
  const HOLE_MIN = 18 / HOLE_SIZE;
  const anyCardShown = !!showCards || shownCards?.some(Boolean) === true;
  const shown = useSharedValue(anyCardShown ? 1 : HOLE_MIN);
  useEffect(() => {
    shown.value = withTiming(anyCardShown ? 1 : HOLE_MIN, {
      duration: motion.base,
      easing: Easing.bezier(...easings.out),
    });
  }, [anyCardShown, shown, HOLE_MIN]);
  const holeStyle = useAnimatedStyle(() => ({ transform: [{ scale: shown.value }] }));
  const cardsToDisplay = displayCards ?? player.holeCards;
  const hasHoleCardsToDisplay = cardsToDisplay.some(Boolean);
  const cardFaceUp = (index: number): boolean => !!showCards || shownCards?.[index] === true;

  // The ring is the avatar plus a fixed border allowance.
  const ringSize = avatarSize + 10;

  // Compact vertical pod for opponents: a round avatar with a small name/stack
  // tag beneath it. Keeps each seat narrow so the felt stays uncluttered.
  if (compact) {
    return (
      <View style={styles.cWrap}>
        {emote && <EmoteBubble emote={emote} />}
        <View style={styles.cAvatarWrap}>
        {hasHoleCardsToDisplay && !dimmed && !handOff && (
          <Animated.View
            key={dealKey}
            style={[styles.cCards, anyCardShown && styles.cCardsShown, holeStyle]}
            pointerEvents="none"
          >
            <View style={{ transform: [{ rotate: '-6deg' }] }}>
              <DealtCard
                rank={cardsToDisplay[0]?.rank}
                suit={cardsToDisplay[0]?.suit as any}
                size={HOLE_SIZE}
                dimmed={dimmed}
                back={back}
                faceUp={cardFaceUp(0)}
                animate={dealAnimate}
                delay={dealDelay}
                fromX={dealFrom?.x ?? 0}
                fromY={dealFrom?.y ?? 120}
              />
            </View>
            <View style={{ marginLeft: -HOLE_SIZE * 0.6, transform: [{ rotate: '10deg' }] }}>
              <DealtCard
                rank={cardsToDisplay[1]?.rank}
                suit={cardsToDisplay[1]?.suit as any}
                size={HOLE_SIZE}
                dimmed={dimmed}
                back={back}
                faceUp={cardFaceUp(1)}
                animate={dealAnimate}
                delay={dealDelay + dealStep}
                fromX={dealFrom?.x ?? 0}
                fromY={dealFrom?.y ?? 120}
              />
            </View>
          </Animated.View>
        )}
          {isCurrent && (
            <Animated.View
              style={[styles.cGlow, { borderRadius: ringSize / 2 + 6 }, glowStyle]}
              pointerEvents="none"
            />
          )}
          <View style={[
            styles.cRing,
            { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
            isCurrent && styles.cRingActive,
            won && styles.cRingWon,
            lost && styles.cRingLost,
            { opacity: dimmed ? 0.34 : 1 },
          ]}>
            <AnimatedPal config={pal} size={avatarSize} alive={idleMotion && !dimmed} reaction={won ? 'happy' : lost ? 'sad' : reaction} />
          </View>
          {isDealer && <View style={styles.cDealer}><Text style={styles.dealerText}>D</Text></View>}
        </View>
        <View style={[styles.cTag, won && styles.cTagWon, lost && styles.cTagLost, { opacity: dimmed ? 0.45 : 1 }]}>
          {showName && <Text style={styles.cName} numberOfLines={1}>{player.name}</Text>}
          <Text style={styles.cChips}>{player.chips.toLocaleString()}</Text>
        </View>
        {player.allIn && <View style={styles.allIn}><Text style={styles.allInText}>ALL IN</Text></View>}
        {/*
          * The slot is always here, the pill is not.
          *
          * Rendering the pill only when there were chips in front of somebody
          * made the pod taller the moment they bet and shorter again when the
          * pot was swept. The avatar and the name tag jumped every street, and
          * because the whole table is measured down from the pod, the board
          * slid with it. Reserving the row costs a few points of felt once and
          * holds everything still.
          */}
        <View style={styles.betSlot}>
          {showBet && player.currentBet > 0 && !player.sittingOut && (
            <View style={styles.bet}><Text style={styles.betText}>{player.currentBet.toLocaleString()}</Text></View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {emote && <EmoteBubble emote={emote} />}
      {!isHuman && hasHoleCardsToDisplay && (
        <View style={styles.cards}>
          <PlayingCard faceDown={!cardFaceUp(0)} rank={cardsToDisplay[0]?.rank} suit={cardsToDisplay[0]?.suit as any} size={26} dimmed={dimmed} back={back} />
          <PlayingCard faceDown={!cardFaceUp(1)} rank={cardsToDisplay[1]?.rank} suit={cardsToDisplay[1]?.suit as any} size={26} dimmed={dimmed} back={back} style={{ marginLeft: -10 }} />
        </View>
      )}

      <View style={styles.podWrap}>
        {isCurrent && <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />}
        <View style={[styles.pod, shadows.soft, isCurrent && styles.podActive, won && styles.podWon, lost && styles.podLost, { opacity: dimmed ? 0.5 : 1 }]}>
          <View style={styles.avatarWrap}>
            <AnimatedPal config={pal} size={40} alive={idleMotion && !dimmed} reaction={won ? 'happy' : lost ? 'sad' : reaction} />
          </View>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              {showName && <Text style={styles.name} numberOfLines={1}>{player.name}</Text>}
              {isDealer && (
                <View style={styles.dealer}><Text style={styles.dealerText}>D</Text></View>
              )}
            </View>
            <View style={styles.stackRow}>
              <Text style={styles.chips}>{player.chips.toLocaleString()}</Text>
              {player.allIn && (
                <View style={styles.allIn}><Text style={styles.allInText}>ALL IN</Text></View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Reserved whether or not there are chips out, so the pod never
          changes height mid hand. See the note on the compact seat above. */}
      <View style={styles.betSlot}>
        {showBet && player.currentBet > 0 && !player.sittingOut && (
          <View style={styles.bet}><Text style={styles.betText}>{player.currentBet.toLocaleString()}</Text></View>
        )}
      </View>
    </View>
  );
}

/** A short-lived reaction bubble that pops above a player's seat. */
function EmoteBubble({ emote }: { emote: Emote }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (emote.anim) {
      const dur = emote.anim === 'spin' ? 850 : emote.anim === 'shake' ? 220 : 480;
      t.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.quad) }), -1, emote.anim !== 'spin');
    } else {
      t.value = 0;
    }
    return () => cancelAnimation(t);
  }, [emote, t]);

  const animStyle = useAnimatedStyle(() => {
    switch (emote.anim) {
      case 'bounce': return { transform: [{ translateY: -12 * t.value }] };
      case 'spin': return { transform: [{ rotate: `${t.value * 360}deg` }] };
      case 'pulse': return { transform: [{ scale: 1 + t.value * 0.35 }] };
      case 'shake': return { transform: [{ rotate: `${(t.value - 0.5) * 34}deg` }] };
      case 'burst': return { transform: [{ scale: 1 + t.value * 0.28 }] };
      default: return {};
    }
  });

  const isText = emote.type === 'text';
  const isGif = emote.type === 'gif';
  // Text/GIF slide in gently; emoji & stickers keep a lively pop.
  // Fast, small, eased, no springy overshoot.
  const entering = isText || isGif
    ? FadeInDown.duration(motion.fast).easing(Easing.bezier(...easings.out))
    : ZoomIn.duration(motion.fast).easing(Easing.bezier(...easings.out));
  const textStyle = isText ? styles.emoteText : emote.type === 'sticker' ? styles.emoteSticker : styles.emoteEmoji;
  return (
    <View style={styles.emoteAnchor} pointerEvents="none">
      <Animated.View entering={entering} exiting={FadeOut.duration(motion.instant)} style={[styles.emoteBubble, emote.type === 'sticker' && styles.emoteBubbleSticker, isGif && styles.emoteBubbleGif, shadows.soft]}>
        {isGif ? (
          <Image source={{ uri: emote.value }} style={styles.emoteGif} resizeMode="cover" />
        ) : (
          <Animated.Text style={[textStyle, animStyle]} numberOfLines={2}>{emote.value}</Animated.Text>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  emoteAnchor: { position: 'absolute', top: -44, left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  emoteBubble: {
    backgroundColor: colors.surface, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.surfaceBorderStrong,
    paddingHorizontal: spacing.md, paddingVertical: 5, maxWidth: 150,
  },
  emoteBubbleSticker: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0, paddingVertical: 0 },
  emoteBubbleGif: { padding: 3, paddingHorizontal: 3, paddingVertical: 3, borderRadius: radii.md, maxWidth: 120 },
  emoteGif: { width: 96, height: 72, borderRadius: radii.sm },
  emoteEmoji: { fontSize: 30 },
  emoteSticker: { fontSize: 44 },
  emoteText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onDark, textAlign: 'center' },
  cards: { flexDirection: 'row', marginBottom: 3 },
  podWrap: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute', top: -3, left: -3, right: -3, bottom: -3,
    borderRadius: radii.pill, borderWidth: 2, borderColor: colors.blue,
  },
  pod: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radii.pill, borderWidth: 1, borderColor: colors.surfaceBorder,
    paddingRight: spacing.md, paddingLeft: spacing.xs, paddingVertical: spacing.xs, minWidth: 118,
  },
  podActive: { borderColor: colors.blue, borderWidth: 2 },
  podWon: { borderColor: colors.gold, borderWidth: 2, backgroundColor: 'rgba(214,180,92,0.14)' },
  podLost: { borderColor: colors.red, borderWidth: 2, backgroundColor: 'rgba(238,81,64,0.14)' },
  avatarWrap: { width: 40, height: 40 },
  nameRow: { flexDirection: 'row', alignItems: 'center', minHeight: 18 },
  dealer: {
    marginLeft: 5, width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  dealerText: { fontFamily: fonts.bold, fontSize: 10, color: '#2A2210' },
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 16 },
  allIn: { backgroundColor: colors.red, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 1 },
  allInText: { fontFamily: fonts.semibold, fontSize: 9, color: '#fff' },
  info: { marginLeft: 8 },
  name: { fontFamily: fonts.semibold, fontSize: 12, color: colors.onDark, maxWidth: 74, flexShrink: 1 },
  /* Bumped from 13. These are the numbers a decision is made on, and they
     were the smallest text on the felt. */
  chips: { fontFamily: fonts.bold, fontSize: 16, color: colors.onDark, ...numeric },
  /** Height of the bet row, held constant so the pod cannot resize. */
  betSlot: { height: BET_SLOT_H, justifyContent: 'flex-start', alignItems: 'center' },
  bet: { marginTop: spacing.xs, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  betText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold, ...numeric },

  // Compact vertical opponent pod
  cWrap: { alignItems: 'center', width: 84 },
  // Tucked against the avatar's right edge, stacked above the head they read
  // as goggles/ears rather than as playing cards.
  // Rendered at full size and scaled down (see HOLE_SIZE), so the box is sized
  // for the big cards; the offsets keep the shrunken pair tucked beside the head.
  cCards: { position: 'absolute', right: -15, top: 16, flexDirection: 'row', zIndex: 2 },
  // Seats sit close together on the arc, so shown cards are only lifted a
  // little and tucked down-right: any bigger and neighbouring pods collide.
  cCardsShown: { right: -8, top: 28, zIndex: 6 },
  cAvatarWrap: { alignItems: 'center', justifyContent: 'center' },
  cGlow: {
    position: 'absolute', top: -4, left: -4, right: -4, bottom: -4,
    borderRadius: 40, borderWidth: 2, borderColor: colors.blue,
  },
  cRing: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surfaceBorderStrong,
    overflow: 'hidden', ...shadows.soft,
  },
  cRingActive: { borderColor: colors.blue },
  cRingWon: { borderColor: colors.gold },
  cRingLost: { borderColor: colors.red },
  cDealer: {
    position: 'absolute', bottom: -2, right: 10, width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  cTag: {
    marginTop: 3, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.surfaceBorder, paddingHorizontal: 10, paddingVertical: 2, maxWidth: 84, ...shadows.soft,
  },
  cTagWon: { borderColor: colors.gold, backgroundColor: 'rgba(214,180,92,0.14)' },
  cTagLost: { borderColor: colors.red, backgroundColor: 'rgba(238,81,64,0.14)' },
  foldedChip: { marginTop: spacing.xs, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 1, borderWidth: 1, borderColor: colors.surfaceBorder },
  foldedChipText: { fontFamily: fonts.semibold, fontSize: 9, color: colors.onDarkMuted, letterSpacing: 0.3 },
  cName: { fontFamily: fonts.semibold, fontSize: 12, color: colors.onDark, maxWidth: 84 },
  cChips: { fontFamily: fonts.bold, fontSize: 15, color: colors.onDark, ...numeric },
});
