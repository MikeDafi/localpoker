import React from 'react';
import { Pressable, View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, radii, fonts, springs } from '../theme/theme';
import { accentRamp, shade } from '../theme/color';
import { sound } from '../services/sound';

const AView = Animated.createAnimatedComponent(View);

export interface WiiChannelTileProps {
  title: string;
  subtitle?: string;
  /** Drawn at a size that fills the tile, so it takes a component, not an element. */
  Icon?: React.ComponentType<{ size?: number }>;
  onPress?: () => void;
  disabled?: boolean;
  accent?: string;
  width: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

const LABEL_H = 44;

/**
 * A Home "channel": the whole tile is the glossy accent badge, with the
 * illustrated icon blown up to fill it and the label printed on the colour.
 */
export function WiiChannelTile({
  title,
  subtitle,
  Icon,
  onPress,
  disabled,
  accent = colors.blue,
  width,
  height,
  style,
}: WiiChannelTileProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const h = height ?? width * 0.92;
  const iconSize = Math.round(Math.max(48, Math.min(width * 0.6, (h - LABEL_H) * 0.86)));

  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ disabled: !!disabled }}
      onPressIn={() => (scale.value = withSpring(0.95, springs.snappy))}
      onPressOut={() => (scale.value = withSpring(1, springs.gentle))}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        sound.play('select');
        onPress?.();
      }}
      style={style}
    >
      <AView
        style={[
          styles.tile,
          { width, height: h, opacity: disabled ? 0.55 : 1, shadowColor: shade(accent, 0.35) },
          animStyle,
        ]}
      >
        <View style={styles.clip}>
          {/* A light-to-deep ramp of the accent. A flat fill reads as a
              sticker; the ramp is what makes the tile look lit. */}
          <LinearGradient
            colors={accentRamp(accent)}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.6 }}
            style={styles.gloss}
            pointerEvents="none"
          />
          <View style={styles.art}>
            <View
              style={[styles.halo, { width: iconSize * 1.25, height: iconSize * 1.25, borderRadius: iconSize }]}
              pointerEvents="none"
            />
            {Icon ? <Icon size={iconSize} /> : null}
          </View>
          <View style={styles.label}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.title}>
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </AView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radii.tile,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 6,
  },
  clip: {
    flex: 1,
    borderRadius: radii.tile,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
  },
  art: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  halo: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  label: {
    height: LABEL_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 1,
  },
});
