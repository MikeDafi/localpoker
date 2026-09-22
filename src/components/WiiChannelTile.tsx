import React from 'react';
import { Pressable, View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, radii, shadows, fonts, springs } from '../theme/theme';
import { sound } from '../services/sound';

const AView = Animated.createAnimatedComponent(View);

export interface WiiChannelTileProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accent?: string;
  width: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/** A Wii Menu "channel": glossy white rounded-square tile with a label bar. */
export function WiiChannelTile({
  title,
  subtitle,
  icon,
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
          { width, height: h, opacity: disabled ? 0.55 : 1 },
          shadows.panel,
          animStyle,
        ]}
      >
        {/* art area */}
        <LinearGradient
          colors={['#FFFFFF', '#F2F8FC', '#E4EFF6']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.art}
        >
          <View style={[styles.gloss]} pointerEvents="none" />
          {/* accent glow halo behind the icon */}
          <View style={[styles.halo, { backgroundColor: accent }]} pointerEvents="none" />
          {/* glossy icon badge */}
          <View style={[styles.iconWrap, { backgroundColor: accent }, shadows.soft]}>
            <LinearGradient
              colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.65 }}
              style={styles.iconGloss}
              pointerEvents="none"
            />
            {icon}
          </View>
        </LinearGradient>
        {/* label bar */}
        <View style={styles.labelBar}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </AView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radii.tile,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  art: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '52%',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderTopLeftRadius: radii.tile,
    borderTopRightRadius: radii.tile,
  },
  halo: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    opacity: 0.12,
  },
  iconWrap: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
  },
  iconGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  labelBar: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#FBFDFE',
    paddingHorizontal: 8,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.inkMuted,
    marginTop: 1,
  },
});
