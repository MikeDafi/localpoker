import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing,
  runOnJS,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PEEL_TIMING, PeekCard, type PeelControl } from './PeekCard';
import type { CardBackVariant } from './CardBack';
import type { Suit } from '../game/cardFace';
import { easings, motion } from '../theme/theme';
import {
  cardUnder,
  foldAmount,
  foldExtent,
  foldLimit,
  foldOrigin,
  grabAnchor,
  PEEL_FRACTION,
  PEEL_OVERSHOOT,
} from '../game/peelFold';

export interface HoleCard {
  rank: number;
  suit: Suit;
}

export interface HoleCardsProps {
  cards: HoleCard[];
  size: number;
  /** Space between cards, in px. */
  gap?: number;
  animate?: boolean;
  /** Per-card deal stagger. */
  delayFor?: (index: number) => number;
  fromY?: number;
  forceOpen?: boolean;
  showToTable?: boolean;
  /** Fired once per peel, when the cards have been lifted far enough to read. */
  onPeek?: () => void;
  /** Which card back design to print, from Settings. */
  back?: CardBackVariant;
}

/**
 * The fraction of the card a peel may work in, measured from the bottom.
 *
 * Only the bottom half. That is how a hand is actually held, the near edge is
 * lifted towards you, and it means you can never lay your whole hand open by
 * accident.
 *
 * It governs two different things, and both are needed. Where a fold may
 * *begin* is the obvious one. What a fold may *uncover* is the one that
 * actually matters: a grab on the side at the midline starts perfectly legally
 * and still folds the card across its full height, exposing the entire face.
 */
const PEEL_HALF = 0.5;

/**
 * How far a peel may be pulled, given where it started and which way it is
 * going.
 *
 * Deliberately short of the hard geometric cap by exactly the overshoot the
 * gesture allows, so that dragging past the end resists and comes to rest *on*
 * the cap rather than sailing through it. Without that the rubber band was
 * worth a further twelve per cent, enough to carry the crease past the midline
 * and lay open most of the card, which is the whole thing the limit exists to
 * prevent.
 */
function reachFor(size: number, h: number, anchor: { x: number; y: number }, dx: number, dy: number) {
  'worklet';
  const cap = Math.min(
    foldExtent(size, h, anchor, dx, dy) * PEEL_FRACTION,
    foldLimit(size, h, anchor, dx, dy, h * PEEL_HALF),
  );
  return cap / PEEL_OVERSHOOT;
}

/**
 * Your hole cards, and the single gesture that lifts them.
 *
 * Both cards share one peel because that is how a hand is actually looked at:
 * you hold the pair together and lift them together. Giving each card its own
 * gesture - which is what this replaced - meant a drag lifted whichever card it
 * happened to start on and left the other lying flat, so reading your hand took
 * two separate drags and never looked like holding cards.
 *
 * The grab is resolved against whichever card is under your finger, then the
 * same pinned point and the same drag are applied to every card. So grabbing
 * the bottom-left corner lifts the bottom-left corner of both, and the pair
 * moves as one piece.
 */
export function HoleCards({
  cards,
  size,
  gap = 10,
  animate = true,
  delayFor,
  fromY = -200,
  forceOpen = false,
  showToTable = false,
  onPeek,
  back,
}: HoleCardsProps) {
  const h = size * 1.42;
  const step = size + gap;
  const count = cards.length;

  const fold = useSharedValue(0);
  // Somewhere to start that is not degenerate: the bottom-left corner, pulled
  // toward the middle. Never seen, because nothing is folded until a finger
  // lands and replaces it.
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(h);
  const dirX = useSharedValue(Math.SQRT1_2);
  const dirY = useSharedValue(-Math.SQRT1_2);
  const limit = useSharedValue(1);
  // Held stable, or every render would look like a new peel to the effect
  // below and restart whatever animation was running.
  const peel: PeelControl = useMemo(
    () => ({ fold, anchorX, anchorY, dirX, dirY, limit }),
    [fold, anchorX, anchorY, dirX, dirY, limit],
  );

  const ticked = useSharedValue(0);
  // Which card was grabbed. Fixed for the whole drag, so the finger is always
  // measured against the card the fold actually started on.
  const grabbed = useSharedValue(0);
  // Where the finger took hold. Only seeds the fold's direction and measures
  // how far it has been dragged; the crease itself starts from `foldOrigin`.
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  const locked = forceOpen || showToTable;

  const tick = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);
  // Held in a ref so the gesture below can be built once. The caller passes a
  // fresh arrow every render, and rebuilding the gesture on each one swaps the
  // handler out from under a touch that is still in progress.
  const onPeekRef = useRef(onPeek);
  onPeekRef.current = onPeek;
  const notifyPeek = useCallback(() => onPeekRef.current?.(), []);

  useEffect(() => {
    // The cards change size when the hand ends, which moves where a fold could
    // start from; reset the pinned point so the programmatic peel below and any
    // fold left over from a previous hand are expressed in the current card's
    // own coordinates.
    peel.dirX.value = Math.SQRT1_2;
    peel.dirY.value = -Math.SQRT1_2;
    const origin = foldOrigin(size, h, Math.SQRT1_2, -Math.SQRT1_2);
    peel.anchorX.value = origin.x;
    peel.anchorY.value = origin.y;
    peel.limit.value = reachFor(size, h, origin, Math.SQRT1_2, -Math.SQRT1_2);

    if (showToTable) {
      // Shown to the table the way a player does it: lift to break the cards
      // off the felt, hold them open long enough for the value to actually be
      // read, drop them flat, then turn them over. Cutting straight to the
      // rotation reads as the cards teleporting rather than being shown.
      peel.fold.value = withSequence(
        withTiming(peel.limit.value, { duration: PEEL_TIMING.open, easing: Easing.bezier(...easings.out) }),
        withDelay(
          PEEL_TIMING.hold,
          withTiming(0, { duration: PEEL_TIMING.close, easing: Easing.bezier(...easings.inOut) }),
        ),
      );
      return;
    }
    // Anything else means nobody is looking, so the hand is not on show.
    peel.fold.value = withTiming(0, { duration: motion.fast });
  }, [showToTable, forceOpen, size, h, peel]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          if (locked) return;
          ticked.value = 0;
          // Which card is under the finger, so the grab is resolved in that
          // card's own coordinates, then applied to all of them.
          grabbed.value = cardUnder(e.x, step, count);
          const local = { x: e.x - grabbed.value * step, y: e.y };
          // A corner counts as grabbed from a good way in, because fingers are
          // blunt: without it, aiming at a corner usually lands just along one
          // edge and folds a thin lopsided sliver instead of a dog-ear.
          const anchor = grabAnchor(size, h, local, size * 0.34, h * PEEL_HALF);
          grabX.value = anchor.x;
          grabY.value = anchor.y;
          peel.fold.value = 0;
          // Start pointing into the card. A fold's direction has to lead
          // inwards from the edge it starts at, see the guard in `onUpdate`,
          // and until the finger has moved there is nothing else to derive it
          // from.
          const inX = size / 2 - anchor.x;
          const inY = h / 2 - anchor.y;
          const inLen = Math.sqrt(inX * inX + inY * inY) || 1;
          peel.dirX.value = inX / inLen;
          peel.dirY.value = inY / inLen;
          const seed = foldOrigin(size, h, peel.dirX.value, peel.dirY.value);
          peel.anchorX.value = seed.x;
          peel.anchorY.value = seed.y;
        })
        .onUpdate((e) => {
          if (locked) return;
          // Measured against the card that was grabbed, not whichever one the
          // finger happens to be over now: crossing the gap between two cards
          // would otherwise shift the reading by a whole card's pitch and make
          // the fold jump.
          const local = { x: e.x - grabbed.value * step, y: e.y };
          const anchor = { x: grabX.value, y: grabY.value };

          // The crease follows where the finger *is*, not how far it has moved.
          // Translation-based peeling breaks whenever the gesture starts
          // tracking late, the first frames of a fast drag get swallowed,
          // which leaves the card stuck barely open. Distance from the pinned
          // point has no such problem and is the more natural mapping anyway.
          let vx = local.x - anchor.x;
          let vy = local.y - anchor.y;
          const dist = Math.sqrt(vx * vx + vy * vy);
          if (dist > 0.001) {
            // Which way you pull is which way it folds, so a corner dragged
            // diagonally dog-ears and an edge dragged straight up lifts square.
            //
            // Unless you are pulling *away* from the card, which is not a fold
            // at all. The crease is square to the drag and sits beyond the
            // pinned point, so an outward direction puts the whole card on the
            // lifted side: the back disappears and the card becomes a single
            // white triangle. Directions with no room to fold into are simply
            // not adopted, leaving the last good one in place.
            const nx = vx / dist;
            const ny = vy / dist;
            if (foldExtent(size, h, anchor, nx, ny) > 0) {
              peel.dirX.value = nx;
              peel.dirY.value = ny;
            }
          }

          // The crease enters the card at the point furthest back against the
          // drag, not at the finger, otherwise a slanted pull starts with a
          // corner already lifted, and an outward one lifts the whole card.
          const origin = foldOrigin(size, h, peel.dirX.value, peel.dirY.value);
          peel.anchorX.value = origin.x;
          peel.anchorY.value = origin.y;
          const reach = reachFor(size, h, origin, peel.dirX.value, peel.dirY.value);
          peel.limit.value = reach;
          // A small dead zone, so resting a thumb on the cards does not expose
          // the hand.
          peel.fold.value = foldAmount(dist, reach, size * 0.08);

          // One light tap at the moment the value becomes legible, which is the
          // point of the whole gesture, you can feel when you have lifted
          // enough instead of having to watch for it.
          if (ticked.value === 0 && reach > 0 && peel.fold.value > reach * 0.7) {
            ticked.value = 1;
            runOnJS(tick)();
          }
        })
        .onFinalize(() => {
          if (locked) return;
          if (ticked.value === 1) runOnJS(notifyPeek)();
          // Snap flat again: a hand is only exposed while you are actively
          // looking. Slightly overdamped, because a hole card flicking shut
          // with a visible bounce looks like a toy rather than card stock.
          peel.fold.value = withSpring(0, {
            damping: 26,
            stiffness: 240,
            mass: 0.7,
            overshootClamping: true,
          });
        }),
    [locked, count, step, size, h, peel, ticked, grabbed, grabX, grabY, tick, notifyPeek],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.row}>
        {cards.map((c, i) => (
          <View key={`${i}-${c.rank}${c.suit}`} style={{ marginLeft: i ? gap : 0 }}>
            <PeekCard
              rank={c.rank}
              suit={c.suit}
              size={size}
              peel={peel}
              animate={animate}
              delay={delayFor ? delayFor(i) : 0}
              forceOpen={forceOpen}
              showToTable={showToTable}
              fromX={(i === 0 ? 1 : -1) * (step / 2)}
              fromY={fromY}
              variant={back}
            />
          </View>
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});
