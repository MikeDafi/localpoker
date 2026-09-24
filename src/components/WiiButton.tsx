import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, StyleProp, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, radii, shadows, fonts, springs } from '../theme/theme';
import { sound } from '../services/sound';

type Variant = 'blue' | 'green' | 'gold' | 'white' | 'red';
type Size = 'sm' | 'md' | 'lg';

const GRADIENTS: Record<Variant, [string, string, string]> = {
  blue: ['#5CC6EF', '#22ABE4', '#0B7CB8'],
  green: ['#5FD08C', '#2FA35E', '#1E7A45'],
  gold: ['#FFD866', '#F5C518', '#D9A400'],
  white: ['#FFFFFF', '#F3F8FB', '#DCE7EE'],
  red: ['#F58170', '#E8503A', '#C63A26'],
};

const TEXT_COLOR: Record<Variant, string> = {
  blue: '#FFFFFF',
  green: '#FFFFFF',
  gold: '#5A4700',
  white: colors.ink,
  red: '#FFFFFF',
};

const SIZES: Record<Size, { h: number; px: number; font: number }> = {
  sm: { h: 40, px: 16, font: 14 },
  md: { h: 52, px: 22, font: 17 },
  lg: { h: 62, px: 28, font: 20 },
};

export interface WiiButtonProps {
  label?: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  round?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const AView = Animated.createAnimatedComponent(View);

export function WiiButton({
  label,
  onPress,
  variant = 'blue',
  size = 'md',
  disabled,
  round,
  fullWidth,
  icon,
  style,
}: WiiButtonProps) {
  const scale = useSharedValue(1);
  const sz = SIZES[size];
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: (1 - scale.value) * 30 }],
  }));

  const dim = round ? { width: sz.h + 8, height: sz.h + 8 } : { height: sz.h };
  const radius = round ? radii.pill : radii.pill;

  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPressIn={() => {
        scale.value = withSpring(0.97, springs.snappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, springs.snappy);
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        sound.play('tap');
        onPress?.();
      }}
      style={[fullWidth && { alignSelf: 'stretch' }, style]}
    >
      <AView
        style={[
          styles.btn,
          dim,
          { borderRadius: radius, opacity: disabled ? 0.5 : 1 },
          shadows.soft,
          animStyle,
        ]}
      >
        <LinearGradient
          colors={GRADIENTS[variant]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.fill, { borderRadius: radius, paddingHorizontal: round ? 0 : sz.px }]}
        >
          {/* a single, very subtle top-light sheen, no plastic gloss */}
          <LinearGradient
            colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.gloss, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
            pointerEvents="none"
          />
          <View style={styles.content}>
            {icon}
            {label ? (
              <Text
                style={{
                  fontFamily: fonts.bold,
                  fontSize: sz.font,
                  color: TEXT_COLOR[variant],
                  marginLeft: icon ? 8 : 0,
                }}
              >
                {label}
              </Text>
            ) : null}
          </View>
        </LinearGradient>
      </AView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
