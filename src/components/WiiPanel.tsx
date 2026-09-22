import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, shadows } from '../theme/theme';

export interface WiiPanelProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  /** subtle top gloss like a Wii channel surface */
  gloss?: boolean;
}

/** White glossy rounded panel with a thin cool-gray border and soft shadow. */
export function WiiPanel({ children, style, padding = 16, gloss = true }: WiiPanelProps) {
  return (
    <View style={[styles.panel, shadows.panel, style]}>
      {gloss && (
        <LinearGradient
          colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.5 }}
          style={styles.gloss}
          pointerEvents="none"
        />
      )}
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
  },
});
