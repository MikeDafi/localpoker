import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme/theme';

export interface InfoDotProps {
  /** What the explanation is about, for screen readers. */
  label: string;
  open: boolean;
  onPress: () => void;
  /** `dark` sits on the in-game sheet, `light` on the menu screens. */
  tone?: 'dark' | 'light';
}

/**
 * The ⓘ you tap to find out what a figure means.
 *
 * Deliberately a toggle with an inline answer rather than a tooltip or a modal:
 * a tooltip has nowhere to go on a phone, and a modal makes you lose your place
 * in the list you were reading. Toggling keeps the number and its explanation on
 * screen together, which is the whole point.
 */
export function InfoDot({ label, open, onPress, tone = 'dark' }: InfoDotProps) {
  const palette = tone === 'dark' ? darkTone : lightTone;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`What is ${label}?`}
      accessibilityState={{ expanded: open }}
      style={[styles.dot, palette.dot, open && palette.dotOpen]}
    >
      <Text style={[styles.glyph, palette.glyph, open && palette.glyphOpen]}>i</Text>
    </Pressable>
  );
}

export interface InfoNoteProps {
  children: string;
  tone?: 'dark' | 'light';
}

/** The explanation an {@link InfoDot} reveals. */
export function InfoNote({ children, tone = 'dark' }: InfoNoteProps) {
  return (
    <View style={[styles.note, tone === 'dark' ? darkTone.note : lightTone.note]}>
      <Text style={[styles.noteText, tone === 'dark' ? darkTone.noteText : lightTone.noteText]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The glyph is a lowercase i, so it needs nudging to sit optically centred.
  glyph: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, marginTop: 1 },
  note: { borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  noteText: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 },
});

const darkTone = StyleSheet.create({
  dot: { borderColor: colors.surfaceBorderStrong, backgroundColor: colors.surfaceAlt },
  dotOpen: { borderColor: colors.blueLight, backgroundColor: colors.blue },
  glyph: { color: colors.onDarkMuted },
  glyphOpen: { color: colors.onBlue },
  note: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.surfaceBorder },
  noteText: { color: colors.onDarkSoft },
});

const lightTone = StyleSheet.create({
  dot: { borderColor: colors.surfaceBorderStrong, backgroundColor: 'rgba(0,0,0,0.04)' },
  dotOpen: { borderColor: colors.blue, backgroundColor: colors.blue },
  glyph: { color: colors.inkMuted },
  glyphOpen: { color: colors.onBlue },
  note: { backgroundColor: 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  noteText: { color: colors.inkSoft },
});
