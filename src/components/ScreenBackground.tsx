import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
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
          /* carpeted room lit by overhead spots, see CasinoFloor */
          <CasinoFloor width={winW} height={winH} />
        ) : (
          <>
            {/*
              * The sheen used to run to 0.35 of the screen at 0.9 white,
              * which bleached the top third and took most of the colour with
              * it. Shorter and softer, so the orbs below actually arrive.
              */}
            <LinearGradient
              colors={['rgba(255,255,255,0.72)', 'rgba(255,255,255,0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.26 }}
              style={StyleSheet.absoluteFill}
            />
            {/*
              * Real glows, not discs.
              *
              * These were plain Views with a pill radius. At the old opacity
              * they were faint enough to pass, but turning them up to get the
              * colour the menu wanted turned them into five hard circles
              * with visible edges. A radial gradient fades to nothing at its
              * rim, which is what a glow does and what a flat disc cannot.
              *
              * Still translucent, because every menu screen puts dark text
              * over this and contrast is not negotiable.
              */}
            <GlowOrb cx={-40} cy={-20} r={240} color={colors.blueLight} opacity={0.75} w={winW} h={winH} />
            <GlowOrb cx={winW + 40} cy={winH * 0.26} r={220} color={colors.accent} opacity={0.42} w={winW} h={winH} />
            <GlowOrb cx={-20} cy={winH + 40} r={280} color={colors.accentAlt} opacity={0.38} w={winW} h={winH} />
            <GlowOrb cx={winW * 0.42} cy={winH * 0.52} r={200} color={colors.accentPink} opacity={0.26} w={winW} h={winH} />
            <GlowOrb cx={winW + 20} cy={winH + 10} r={210} color={colors.gold} opacity={0.3} w={winW} h={winH} />
          </>
        )}
      </View>
      <SafeAreaView style={[styles.fill, style]} edges={edges}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  );
}

/**
 * One soft coloured glow, drawn as a radial gradient that fades to fully
 * transparent at its rim so it has no edge to see.
 *
 * Each gets its own gradient id: two with the same id in one tree make every
 * orb take whichever mounted last, which shows up as the whole backdrop
 * turning a single colour.
 */
function GlowOrb({
  cx, cy, r, color, opacity, w, h,
}: {
  cx: number; cy: number; r: number; color: string; opacity: number; w: number; h: number;
}) {
  const id = React.useId();
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={`glow-${id}`} cx={cx} cy={cy} r={r} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#glow-${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
