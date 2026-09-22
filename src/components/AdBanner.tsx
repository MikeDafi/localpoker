import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ADS_ENABLED } from '../config/ads';
import { colors, fonts, radii } from '../theme/theme';

/**
 * Default-off ad slot. Do not enable this flag in a submitted binary until the
 * placeholder below is replaced by a real ad SDK banner.
 */
export function AdBanner({ label = 'Ad' }: { label?: string }) {
  if (!ADS_ENABLED) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.tag}>
        <Text style={styles.tagText}>{label}</Text>
      </View>
      <Text style={styles.text}>Reserved banner slot</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 14,
    gap: 10,
  },
  tag: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: { color: colors.onDarkMuted, fontFamily: fonts.semibold, fontSize: 10 },
  text: { color: colors.onDarkMuted, fontFamily: fonts.medium, fontSize: 13 },
});

export { ADS_ENABLED };
