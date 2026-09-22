import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CasinoFloor } from './CasinoFloor';
import { colors } from '../theme/theme';

export interface ScreenBackgroundProps {
  children: React.ReactNode;
  /** felt = green poker table backdrop; menu = console-menu white-blue */
  variant?: 'menu' | 'felt';
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  style?: StyleProp<ViewStyle>;
}

/**
 * Layered, higher-fidelity backdrop. The menu variant adds soft coloured glow
 * orbs and a top sheen for depth (console-menu feel, elevated). The felt variant
 * adds a center glow + vignette so the table reads premium.
 */
export function ScreenBackground({
  children,
  variant = 'menu',
  edges = ['top', 'bottom'],
  style,
}: ScreenBackgroundProps) {
  const isFelt = variant === 'felt';
  const { width: winW, height: winH } = useWindowDimensions();
  const gradient = isFelt
    ? ([colors.feltRoomTop, colors.feltRoom, colors.feltRoom] as const)
    : ([colors.bgGradientTop, colors.bg, colors.bgGradientBottom] as const);

  return (
    <LinearGradient colors={gradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.fill}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {isFelt ? (
          /* carpeted room lit by overhead spots — see CasinoFloor */
          <CasinoFloor width={winW} height={winH} />
        ) : (
          <>
            <LinearGradient
              colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.35 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.orb, { width: 340, height: 340, top: -90, left: -110, backgroundColor: colors.blueLight, opacity: 0.35 }]} />
            <View style={[styles.orb, { width: 300, height: 300, top: 120, right: -120, backgroundColor: colors.accent, opacity: 0.14 }]} />
            <View style={[styles.orb, { width: 420, height: 420, bottom: -160, left: -80, backgroundColor: colors.accentAlt, opacity: 0.12 }]} />
          </>
        )}
      </View>
      <SafeAreaView style={[styles.fill, style]} edges={edges}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  orb: { position: 'absolute', borderRadius: 999 },
});
