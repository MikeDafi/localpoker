import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, Image, FlatList } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, Easing } from 'react-native-reanimated';
import { colors, fonts, radii, shadows, spacing, type, motion, easings } from '../theme/theme';
import { sound } from '../services/sound';
import { GIF_LIBRARY, gifUrl, gifThumbUrl } from '../services/gifs';

export type EmoteAnim = 'bounce' | 'spin' | 'pulse' | 'shake' | 'burst';
export type Emote = { type: 'emoji' | 'text' | 'sticker' | 'gif'; value: string; anim?: EmoteAnim };

/** Big, clear emoji reactions. */
export const EMOJIS = ['👍', '😂', '😮', '😎', '🔥', '🎉', '😤', '🤔', '😅', '🙌', '😱', '🤯', '💪', '🍀', '😴', '🤝'];

/** Animated "sticker" reactions, each plays a looping animation in the bubble. */
export const STICKERS: Emote[] = [
  { type: 'sticker', value: '🎉', anim: 'burst' },
  { type: 'sticker', value: '🔥', anim: 'pulse' },
  { type: 'sticker', value: '😂', anim: 'shake' },
  { type: 'sticker', value: '💰', anim: 'bounce' },
  { type: 'sticker', value: '🃏', anim: 'spin' },
  { type: 'sticker', value: '👀', anim: 'shake' },
  { type: 'sticker', value: '🚀', anim: 'bounce' },
  { type: 'sticker', value: '💎', anim: 'pulse' },
];

/** One-tap canned lines. */
export const QUICK_TEXTS = ['Nice hand!', 'All in!', 'Bluffing?', 'GG', "Let's go!", 'Fold!', 'Wow!', 'Unlucky'];

// Curated GIF pack lives in services/gifs.
export { GIF_LIBRARY };

export function EmoteBar({ onEmote }: { onEmote: (emote: Emote) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  // The whole curated pack, shown at once. Thumbnails are Giphy's tiny static
  // renditions (~6KB each) so all of them load instantly; the GIF that actually
  // gets sent is the full animated one.
  const gifs = useMemo(
    () => GIF_LIBRARY.map((g) => ({ send: gifUrl(g.id), thumb: gifThumbUrl(g.id) })),
    [],
  );

  const send = (emote: Emote) => {
    onEmote(emote);
    setOpen(false);
  };

  const sendText = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    send({ type: 'text', value: trimmed.slice(0, 40) });
    setText('');
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
                  <Pressable style={styles.gifChip} onPress={() => send({ type: 'gif', value: g.send })} accessibilityLabel="Send GIF">
                    <Image source={{ uri: g.thumb }} style={styles.gifThumb} resizeMode="cover" />
                  </Pressable>
                )}
              />

              <Text style={styles.sectionLabel}>Animated stickers</Text>
              <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stickerRow} keyboardShouldPersistTaps="handled">
                {STICKERS.map((s, i) => (
                  <Pressable key={i} style={styles.stickerChip} onPress={() => send(s)} accessibilityLabel={`Send animated ${s.value}`}>
                    <Text style={styles.stickerEmoji}>{s.value}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.sectionLabel}>Emojis</Text>
              <View style={styles.emojiGrid}>
                {EMOJIS.map((e) => (
                  <Pressable key={e} style={styles.emojiChip} onPress={() => send({ type: 'emoji', value: e })} accessibilityLabel={`Send ${e}`}>
                    <Text style={styles.emoji}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Pinned bottom bar, text input sits right above the keyboard, so
                opening it lifts only this row (no bouncy full-sheet jump). */}
            <View style={styles.bottomBar}>
              <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow} keyboardShouldPersistTaps="handled">
                {QUICK_TEXTS.map((t) => (
                  <Pressable key={t} style={styles.quickChip} onPress={() => send({ type: 'text', value: t })}>
                    <Text style={styles.quickChipText}>{t}</Text>
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

const styles = StyleSheet.create({
  fab: {
    width: 48, height: 48, borderRadius: radii.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center',
  },
  fabIcon: { fontSize: 22 },
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
  stickerRow: { gap: 10, paddingVertical: 6, paddingRight: 8 },
  stickerChip: {
    width: 56, height: 56, borderRadius: radii.lg, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center',
  },
  stickerEmoji: { fontSize: 32 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  emojiChip: {
    width: 52, height: 52, borderRadius: radii.md, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.surfaceBorder, alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 30 },
  bottomBar: { borderTopWidth: 1, borderTopColor: colors.surfaceBorder, paddingTop: spacing.sm, marginTop: spacing.xs },
  quickRow: { gap: 8, paddingBottom: 8, paddingRight: 8 },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.surfaceBorder },
  quickChipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onDarkSoft },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1, height: 46, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.surfaceBorder, paddingHorizontal: 16, fontFamily: fonts.medium, fontSize: 15, color: colors.onDark,
  },
  sendBtn: { height: 46, paddingHorizontal: 20, borderRadius: radii.pill, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.surfaceAlt },
  sendText: { fontFamily: fonts.semibold, fontSize: 14, color: '#fff' },
});
