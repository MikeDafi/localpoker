import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { colors, fonts, radii, spacing } from '../theme/theme';
import { RUN_WHEEL_ITEM_H, offsetForRun, runAtOffset, runWheelOptions } from '../game/runWheel';
import type { RunCount } from '../game/runItTwice';

export interface RunCountWheelProps {
  /** The count currently voted for. */
  value: RunCount;
  /** False while somebody else is still answering. */
  enabled: boolean;
  onChange: (run: RunCount) => void;
}

/**
 * A dial for how many times to run the board.
 *
 * Scrolling is the answer, rather than scrolling and then confirming. The vote
 * can already be changed until everybody has answered, and the row of buttons
 * this replaces committed on a single tap, so asking for a second tap would
 * add a step to the one control on screen that is against a clock.
 *
 * Only a real drag commits. Spinning from 1 to 4 passes over 2 and 3 without
 * voting for either, because the commit happens when the wheel comes to rest.
 */
export function RunCountWheel({ value, enabled, onChange }: RunCountWheelProps) {
  const ref = useRef<ScrollView>(null);
  const options = runWheelOptions();
  const dragged = useRef(false);

  /*
   * Which row is in the window, according to the window.
   *
   * Deliberately not `value`. The number under the frame is whatever the
   * scroll position puts there, so highlighting `value` instead meant the two
   * could disagree, and they did: the wheel sat at the top showing a greyed 1
   * in the frame with the gold 2 below it, because the opening scroll had not
   * taken. Reading the position back makes that unrepresentable. The
   * highlight is always on the row you can actually see.
   */
  const [shown, setShown] = useState<RunCount>(value);

  /*
   * Follow the value when something other than a drag changes it, which is
   * what a tap on a neighbouring row is.
   */
  const settled = useRef(value);
  useEffect(() => {
    if (settled.current === value) return;
    settled.current = value;
    setShown(value);
    ref.current?.scrollTo({ y: offsetForRun(value), animated: true });
  }, [value]);

  /*
   * Open on the current vote, once the wheel has both a frame and its rows.
   *
   * `contentOffset` is the obvious way to do this and `snapToInterval` drags
   * it back to zero on first layout; scrolling from `onLayout` alone runs
   * before the rows are measured and is silently clamped to the top. In
   * practice this rarely has to do anything, because a vote opens on 1 and 1
   * is already offset zero. It is here for the remount, where the card
   * redraws with an answer already given.
   */
  const contentH = (options.length + 2) * RUN_WHEEL_ITEM_H;
  const framed = useRef(false);
  const measured = useRef(false);
  const place = useCallback(() => {
    if (!framed.current || !measured.current) return;
    ref.current?.scrollTo({ y: offsetForRun(settled.current), animated: false });
  }, []);

  const track = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setShown(runAtOffset(e.nativeEvent.contentOffset.y));
  };

  const commit = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = runAtOffset(e.nativeEvent.contentOffset.y);
    setShown(next);
    /*
     * Only a scroll the player actually did counts as a vote. Placing the
     * wheel on its opening value fired a rest event at offset zero, which
     * read as "they chose 1" and cast a vote nobody had made.
     */
    if (!dragged.current) return;
    dragged.current = false;
    settled.current = next;
    if (next !== value) onChange(next);
  };

  return (
    <View style={styles.wrap}>
      {/* The frame, drawn behind the numbers so the chosen one sits inside it. */}
      <View style={styles.window} pointerEvents="none" />
      <ScrollView
        ref={ref}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        // One row at a time, so the wheel can only ever stop on a number.
        snapToInterval={RUN_WHEEL_ITEM_H}
        decelerationRate="fast"
        scrollEnabled={enabled}
        onLayout={() => { framed.current = true; place(); }}
        onContentSizeChange={(_w, h) => { measured.current = h >= contentH; place(); }}
        onScroll={track}
        scrollEventThrottle={32}
        onScrollBeginDrag={() => { dragged.current = true; }}
        onMomentumScrollEnd={commit}
        // A slow drag that never gains momentum ends here instead.
        onScrollEndDrag={commit}
        accessibilityRole="adjustable"
        accessibilityLabel={`Run the board ${shown} ${shown === 1 ? 'time' : 'times'}`}
      >
        {options.map((run) => (
          <Pressable
            key={run}
            style={styles.item}
            disabled={!enabled}
            onPress={() => onChange(run)}
            accessibilityRole="button"
            accessibilityLabel={`Run it ${run} ${run === 1 ? 'time' : 'times'}`}
          >
            <Text style={[styles.number, run === shown ? styles.numberActive : styles.numberIdle]}>
              {run}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  /*
   * Exactly three rows tall: the value, and one either side of it. Two would
   * not say which way the wheel moves, and four makes the card taller than
   * the felt it has to sit on. The card is tight enough that the title sits
   * beside this rather than above it.
   */
  scroll: { height: RUN_WHEEL_ITEM_H * 3, width: 64 },
  // One row of padding top and bottom, so the first and last values can reach
  // a window that is not at the top of the list.
  content: { paddingVertical: RUN_WHEEL_ITEM_H },
  item: { height: RUN_WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' },
  window: {
    position: 'absolute',
    top: RUN_WHEEL_ITEM_H,
    height: RUN_WHEEL_ITEM_H,
    left: 0,
    right: 0,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  number: { fontFamily: fonts.bold, fontSize: 22 },
  numberActive: { color: colors.gold },
  // Still legible, so you can see what you are scrolling towards.
  numberIdle: { color: colors.onDarkMuted, opacity: 0.55 },
});
