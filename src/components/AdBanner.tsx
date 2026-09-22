import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radii } from '../theme/theme';

/**
 * Placeholder banner ad slot. In a production build this is replaced by
 * `react-native-google-mobile-ads` <BannerAd/>, which requires a custom dev
 * client (AdMob native module is not available in Expo Go). Kept as a visual
 * slot so the layout reflects the real, ad-supported design.
 */
export function AdBanner({ label = 'Ad' }: { label?: string }) {
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
