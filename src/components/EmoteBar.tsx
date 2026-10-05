import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, Image, FlatList } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, Easing } from 'react-native-reanimated';
import { colors, fonts, radii, shadows, spacing, type, motion, easings } from '../theme/theme';
import { sound } from '../services/sound';
import { GIF_LIBRARY, gifUrl, gifThumbUrl } from '../services/gifs';
import { shuffleForDay } from '../game/dailyShuffle';
import {
  canSendEmotePayload,
  EMOJI_EMOTES,
  resolveEmojiEmoteOptions,
  resolveGifEmoteOptions,
  resolvePalMotionOptions,
  resolveStickerEmoteOptions,
  resolveTextEmoteOptions,
  STICKER_EMOTES,
  unlockedFirst,
  TEXT_EMOTES,
} from '../game/cosmetics';
import { DEFAULT_PAL, type PalConfig } from '../avatar/palConfig';
import { PalMotion } from './PalMotion';

export type EmoteAnim = 'bounce' | 'spin' | 'pulse' | 'shake' | 'burst';
/**
 * A reaction, in one of four kinds.
 *
 * `palMotion` carries the motion's short id in `value`, the way a `gif`
 * carries a URL: the wire only moves `type`, `value` and `anim`, so the id is
 * the whole payload and `palMotionByMotionId` turns it back into a gesture on
 * the other side.
 */
export type Emote = { type: 'emoji' | 'text' | 'sticker' | 'gif' | 'palMotion'; value: string; anim?: EmoteAnim };

/** Big, clear emoji reactions. */
export const EMOJIS = Object.values(EMOJI_EMOTES).map((emoji) => emoji.emoji);

/** Animated "sticker" reactions, each plays a looping animation in the bubble. */
export const STICKERS: Emote[] = Object.values(STICKER_EMOTES)
  .map((sticker) => ({ type: 'sticker', value: sticker.sticker, anim: sticker.anim }));

/** One-tap canned lines. */
export const QUICK_TEXTS = Object.values(TEXT_EMOTES).map((text) => text.text);

// Curated GIF pack lives in services/gifs.
export { GIF_LIBRARY };

const NO_OWNED_COSMETICS: readonly string[] = [];

/**
 * Pal size in a motion chip.
 *
 * Near the 42pt a Pal is drawn at on a seat, so the tray is an honest preview
 * of what the rest of the table is about to see rather than a flattering one.
 */
const MOTION_CHIP_PAL = 46;

export function EmoteBar({
  onEmote,
  ownedCosmeticIds = NO_OWNED_COSMETICS,
  pal = DEFAULT_PAL,
}: {
  onEmote: (emote: Emote) => void;
  ownedCosmeticIds?: readonly string[];
  /** The player's own Pal, so the motion row shows the face that will do it. */
  pal?: PalConfig;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  // The available curated pack, shown at once. Thumbnails are Giphy's tiny static
  // renditions (~6KB each) so all of them load instantly; the GIF that actually
  // gets sent is the full animated one.
  //
  // The order is reshuffled once a day (see `shuffleForDay`), so the ones in
  // easy reach are not the same six forever, while the tray still holds still
  // for as long as anyone is playing.
  const gifs = useMemo(
    // Partitioned AFTER the daily shuffle, or the shuffle puts the locked
    // ones straight back among the ones you can send.
    () => unlockedFirst(shuffleForDay(resolveGifEmoteOptions({ owned: ownedCosmeticIds })))
      .map((g) => ({
        id: g.id,
        send: gifUrl(g.gifId),
        thumb: gifThumbUrl(g.gifId),
        locked: g.locked,
      })),
    [ownedCosmeticIds],
  );
  const emojis = useMemo(
    () => resolveEmojiEmoteOptions({ owned: ownedCosmeticIds }),
    [ownedCosmeticIds],
  );
  const stickers = useMemo(
    () => resolveStickerEmoteOptions({ owned: ownedCosmeticIds }),
    [ownedCosmeticIds],
  );
  const quickTexts = useMemo(
    () => resolveTextEmoteOptions({ owned: ownedCosmeticIds }),
    [ownedCosmeticIds],
  );
  // Every motion stays visible, not only the owned ones. A locked chip is a
  // store preview in the place where the player wanted to use it.
  const motions = useMemo(
    () => resolvePalMotionOptions({ owned: ownedCosmeticIds }),
    [ownedCosmeticIds],
  );

  const send = (emote: Emote): boolean => {
    if (!canSendEmotePayload(emote, ownedCosmeticIds)) return false;
    onEmote(emote);
    setOpen(false);
    return true;
  };

  const sendText = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (send({ type: 'text', value: trimmed.slice(0, 40) })) setText('');
  };

  return (
    <>
      <Pressable
        onPress={() => { sound.play('tap'); setOpen(true); }}
        style={[styles.fab, shadows.soft]}
        accessibilityRole="button"
        accessibilityLabel="Send a reaction"
        hitSlop={8}
      >
        <Text style={styles.fabIcon}>💬</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Animated.View entering={FadeIn.duration(motion.fast)} exiting={FadeOut.duration(motion.instant)} style={styles.backdrop}>
          <Pressable style={styles.fill} onPress={() => setOpen(false)} accessibilityLabel="Close reactions" />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
          <Animated.View entering={SlideInDown.duration(motion.base).easing(Easing.bezier(...easings.out))} exiting={SlideOutDown.duration(motion.fast)} style={[styles.sheet, shadows.panel]}>
            <View style={styles.handle} />

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>GIFs</Text>
                {/* Giphy's terms require their mark wherever their content is
                    shown. It is also what keeps the third-party content
                    declaration on the store listing honest. */}
                <Text style={styles.attribution}>POWERED BY GIPHY</Text>
              </View>
              {/* One horizontally-scrolling row. A wrapped grid of 79 thumbs
                  pushed the stickers and emojis off the bottom of the sheet and
                  mounted every image at once; a horizontal list keeps the sheet
                  shallow and only renders what's on screen. */}
              <FlatList
                data={gifs}
                horizontal
                bounces={false}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyExtractor={(g) => g.send}
                contentContainerStyle={styles.gifRow}
                initialNumToRender={8}
                windowSize={5}
                renderItem={({ item: g }) => (
                  <Pressable
                    style={[styles.gifChip, g.locked && styles.lockedChip]}
                    onPress={() => send({ type: 'gif', value: g.send })}
                    disabled={g.locked}
                    accessibilityState={{ disabled: g.locked }}
                    accessibilityLabel={g.locked ? 'Locked GIF, buy it in the Store' : 'Send GIF'}
                  >
                    <Image source={{ uri: g.thumb }} style={[styles.gifThumb, g.locked && styles.lockedMedia]} resizeMode="cover" />
                    {g.locked ? <LockedMark /> : null}
                  </Pressable>
                )}
              />

              {motions.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Pal motions</Text>
                  {/* Each chip plays the real thing rather than a picture of
                      it, on the player's own Pal, so what is in the tray and
                      what the table sees are the same gesture. */}
                  <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.motionRow} keyboardShouldPersistTaps="handled">
                    {motions.map((m) => (
                      <Pressable
                        key={m.id}
                        style={[styles.motionChip, m.locked && styles.lockedChip]}
                        onPress={() => send({ type: 'palMotion', value: m.motionId })}
                        disabled={m.locked}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: m.locked }}
                        accessibilityLabel={m.locked ? `Locked ${m.name}, buy it in the Store` : `Send ${m.name}`}
                      >
                        <View style={m.locked && styles.lockedMotionPreview}>
                          <PalMotion config={pal} motionId={m.motionId} size={MOTION_CHIP_PAL} loop />
                        </View>
                        <Text style={[styles.motionName, m.locked && styles.lockedLabel]} numberOfLines={1}>{m.name}</Text>
                        {m.locked ? <LockedMark /> : null}
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.sectionLabel}>Animated stickers</Text>              <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stickerRow} keyboardShouldPersistTaps="handled">
                {stickers.map((s) => (
                  <Pressable
                    key={s.id}
                    style={[styles.stickerChip, s.locked && styles.lockedChip]}
                    onPress={() => send({ type: 'sticker', value: s.sticker, anim: s.anim })}
                    disabled={s.locked}
                    accessibilityState={{ disabled: s.locked }}
                    accessibilityLabel={s.locked ? `Locked animated ${s.sticker}, buy it in the Store` : `Send animated ${s.sticker}`}
                  >
                    <Text style={[styles.stickerEmoji, s.locked && styles.lockedEmoji]}>{s.sticker}</Text>
                    {s.locked ? <LockedMark compact /> : null}
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.sectionLabel}>Emojis</Text>
              <View style={styles.emojiGrid}>
                {emojis.map((e) => (
                  <Pressable
                    key={e.id}
                    style={[styles.emojiChip, e.locked && styles.lockedChip]}
                    onPress={() => send({ type: 'emoji', value: e.emoji })}
                    disabled={e.locked}
                    accessibilityState={{ disabled: e.locked }}
                    accessibilityLabel={e.locked ? `Locked ${e.emoji}, buy it in the Store` : `Send ${e.emoji}`}
                  >
                    <Text style={[styles.emoji, e.locked && styles.lockedEmoji]}>{e.emoji}</Text>
                    {e.locked ? <LockedMark compact /> : null}
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Pinned bottom bar, text input sits right above the keyboard, so
                opening it lifts only this row (no bouncy full-sheet jump). */}
            <View style={styles.bottomBar}>
              <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow} keyboardShouldPersistTaps="handled">
                {quickTexts.map((t) => (
                  <Pressable
                    key={t.id}
                    style={[styles.quickChip, t.locked && styles.lockedQuickChip]}
                    onPress={() => send({ type: 'text', value: t.text })}
                    disabled={t.locked}
                    accessibilityState={{ disabled: t.locked }}
                    accessibilityLabel={t.locked ? `Locked ${t.text}, buy it in the Store` : `Send ${t.text}`}
                  >
                    <Text style={[styles.quickChipText, t.locked && styles.lockedLabel]}>{t.locked ? `🔒 ${t.text}` : t.text}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.inputRow}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Type a message…"
                  placeholderTextColor={colors.onDarkMuted}
                  style={styles.input}
                  maxLength={40}
                  returnKeyType="send"
                  onSubmitEditing={sendText}
                />
                <Pressable onPress={sendText} style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]} disabled={!text.trim()}>
                  <Text style={styles.sendText}>Send</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function LockedMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.lockOverlay} pointerEvents="none">
      <Text style={compact ? styles.lockIconCompact : styles.lockIcon}>🔒</Text>
      {!compact ? <Text style={styles.lockText}>Store</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * The same 36pt as the gear above it.
   *
   * These two sit in one column at the edge of the felt and were 48 and 36,
   * which read as a mistake rather than a hierarchy. The gear's size won
   * because it is the one that has to stay out of the way.
   */
  fab: {
    width: 36, height: 36, borderRadius: radii.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center',
  },
  fabIcon: { fontSize: 17 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    borderWidth: 1, borderColor: colors.surfaceBorder, maxHeight: '86%',
  },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: colors.surfaceBorderStrong, marginBottom: spacing.sm },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: spacing.sm },
  sectionLabel: { ...type.label, color: colors.onDarkMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  attribution: { ...type.label, fontSize: 9, letterSpacing: 0.8, color: colors.onDarkMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  gifRow: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  gifChip: { width: 96, height: 76, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  gifThumb: { width: '100%', height: '100%' },
  lockedChip: { borderColor: colors.gold, backgroundColor: colors.surface },
  lockedMedia: { opacity: 0.35 },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(5,9,11,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  lockIcon: { fontSize: 16 },
  lockIconCompact: { fontSize: 13 },
  lockText: { fontFamily: fonts.bold, fontSize: 9, color: colors.gold },
  stickerRow: { gap: 10, paddingVertical: 6, paddingRight: 8 },
  stickerChip: {
    width: 56, height: 56, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  stickerEmoji: { fontSize: 32 },
  lockedEmoji: { opacity: 0.38 },
  motionRow: { gap: 10, paddingVertical: 6, paddingRight: 8 },
  motionChip: {
    width: 84, paddingVertical: 8, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center', gap: 4,
    overflow: 'hidden',
  },
  motionName: { fontFamily: fonts.semibold, fontSize: 11, color: colors.onDarkSoft, maxWidth: 76 },
  lockedMotionPreview: { opacity: 0.35 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  emojiChip: {
    width: 52, height: 52, borderRadius: radii.md, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  emoji: { fontSize: 30 },
  bottomBar: { borderTopWidth: 1, borderTopColor: colors.surfaceBorder, paddingTop: spacing.sm, marginTop: spacing.xs },
  quickRow: { gap: 8, paddingBottom: 8, paddingRight: 8 },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.surfaceBorder },
  quickChipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onDarkSoft },
  lockedQuickChip: { borderColor: colors.gold, backgroundColor: colors.surface },
  lockedLabel: { color: colors.onDarkMuted },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1, height: 46, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.surfaceBorder, paddingHorizontal: 16, fontFamily: fonts.medium, fontSize: 15, color: colors.onDark,
  },
  sendBtn: { height: 46, paddingHorizontal: 20, borderRadius: radii.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.surfaceAlt },
  sendText: { fontFamily: fonts.semibold, fontSize: 14, color: '#fff' },
});
