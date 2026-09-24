import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View, AccessibilityInfo } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { PalAvatar, PalAvatarProps, PalExpression } from './PalAvatar';
import { getAppReduceMotion, subscribeAppReduceMotion } from '../theme/motionPreference';

export interface AnimatedPalProps extends PalAvatarProps {
  /** enable organic idle motion + natural blinking */
  alive?: boolean;
  /** transient reaction expression; falls back to expression/idle/blink when not set */
  reaction?: PalExpression;
  ring?: boolean;
}

const sinEase = Easing.inOut(Easing.sin);
const quickEase = Easing.out(Easing.cubic);

/**
 * Wraps PalAvatar with layered game-avatar motion: breath, bob, sway,
 * randomized blinking, and expression-specific reaction pops. Honors reduce-motion.
 */
export function AnimatedPal({
  alive = true,
  reaction,
  ring,
  size = 72,
  expression: baseExpression = 'idle',
  clip,
  ...props
}: AnimatedPalProps) {
  const breath = useSharedValue(1);
  const bob = useSharedValue(0);
  const sway = useSharedValue(0);
  const reactionY = useSharedValue(0);
  const reactionRotate = useSharedValue(0);
  const reactionScaleX = useSharedValue(1);
  const reactionScaleY = useSharedValue(1);
  const [blinking, setBlinking] = useState(false);
  const [osReduceMotion, setOsReduceMotion] = useState(false);
  // The app's own Reduce Motion setting, which must stop idle motion just as
  // the system one does. Read from a store rather than a prop so no caller can
  // forget to pass it.
  const appReduceMotion = useSyncExternalStore(subscribeAppReduceMotion, getAppReduceMotion, getAppReduceMotion);
  const reduceMotion = osReduceMotion || appReduceMotion;
  const blinkTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setOsReduceMotion(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setOsReduceMotion);
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!alive || reduceMotion) {
      cancelAnimation(breath);
      cancelAnimation(bob);
      cancelAnimation(sway);
      breath.value = 1;
      bob.value = 0;
      sway.value = 0;
      return;
    }

    breath.value = withRepeat(withSequence(
      withTiming(1.018, { duration: 1650, easing: sinEase }),
      withTiming(0.996, { duration: 1750, easing: sinEase }),
      withTiming(1, { duration: 900, easing: sinEase }),
    ), -1, false);
    bob.value = withRepeat(withSequence(
      withTiming(-1.9, { duration: 1320, easing: sinEase }),
      withTiming(0.35, { duration: 1480, easing: sinEase }),
      withTiming(0, { duration: 760, easing: sinEase }),
    ), -1, false);
    sway.value = withRepeat(withSequence(
      withTiming(1.15, { duration: 2350, easing: sinEase }),
      withTiming(-1.35, { duration: 2650, easing: sinEase }),
      withTiming(0.35, { duration: 1850, easing: sinEase }),
    ), -1, false);

    return () => {
      cancelAnimation(breath);
      cancelAnimation(bob);
      cancelAnimation(sway);
    };
  }, [alive, reduceMotion, breath, bob, sway]);

  useEffect(() => {
    blinkTimers.current.forEach(clearTimeout);
    blinkTimers.current = [];
    setBlinking(false);

    if (!alive || reduceMotion) return;

    const queueTimer = (fn: () => void, delay: number) => {
      const timer = setTimeout(fn, delay);
      blinkTimers.current.push(timer);
      return timer;
    };

    const blinkOnce = (duration = 105) => {
      setBlinking(true);
      queueTimer(() => setBlinking(false), duration);
    };

    const scheduleBlink = () => {
      const delay = 2400 + Math.random() * 4200;
      queueTimer(() => {
        blinkOnce(95 + Math.random() * 45);
        if (Math.random() < 0.34) {
          queueTimer(() => blinkOnce(85), 165 + Math.random() * 80);
        }
        scheduleBlink();
      }, delay);
    };

    scheduleBlink();
    return () => {
      blinkTimers.current.forEach(clearTimeout);
      blinkTimers.current = [];
    };
  }, [alive, reduceMotion]);

  useEffect(() => {
    cancelAnimation(reactionY);
    cancelAnimation(reactionRotate);
    cancelAnimation(reactionScaleX);
    cancelAnimation(reactionScaleY);
    reactionY.value = 0;
    reactionRotate.value = 0;
    reactionScaleX.value = 1;
    reactionScaleY.value = 1;

    if (!reaction || reduceMotion) return;

    switch (reaction) {
      case 'happy':
        reactionY.value = withSequence(
          withTiming(-7.8, { duration: 170, easing: quickEase }),
          withTiming(0.8, { duration: 220, easing: Easing.out(Easing.back(1.7)) }),
          withTiming(-2.2, { duration: 130, easing: sinEase }),
          withTiming(0, { duration: 210, easing: sinEase }),
        );
        reactionScaleX.value = withSequence(
          withTiming(1.08, { duration: 110, easing: quickEase }),
          withTiming(0.96, { duration: 170, easing: sinEase }),
          withTiming(1.02, { duration: 140, easing: sinEase }),
          withTiming(1, { duration: 170, easing: sinEase }),
        );
        reactionScaleY.value = withSequence(
          withTiming(0.93, { duration: 110, easing: quickEase }),
          withTiming(1.1, { duration: 170, easing: sinEase }),
          withTiming(0.99, { duration: 140, easing: sinEase }),
          withTiming(1, { duration: 170, easing: sinEase }),
        );
        reactionRotate.value = withSequence(
          withTiming(-2.4, { duration: 160, easing: sinEase }),
          withTiming(2, { duration: 190, easing: sinEase }),
          withTiming(0, { duration: 220, easing: sinEase }),
        );
        break;
      case 'sad':
        reactionY.value = withSequence(
          withTiming(3.2, { duration: 280, easing: sinEase }),
          withTiming(1.4, { duration: 420, easing: sinEase }),
          withTiming(0, { duration: 420, easing: sinEase }),
        );
        reactionScaleX.value = withSequence(
          withTiming(0.985, { duration: 300, easing: sinEase }),
          withTiming(1, { duration: 620, easing: sinEase }),
        );
        reactionScaleY.value = withSequence(
          withTiming(0.965, { duration: 300, easing: sinEase }),
          withTiming(1, { duration: 620, easing: sinEase }),
        );
        reactionRotate.value = withSequence(
          withTiming(-2.3, { duration: 360, easing: sinEase }),
          withTiming(-1, { duration: 320, easing: sinEase }),
          withTiming(0, { duration: 460, easing: sinEase }),
        );
        break;
      case 'surprised':
        reactionY.value = withSequence(
          withTiming(-3.8, { duration: 115, easing: quickEase }),
          withTiming(1.2, { duration: 180, easing: Easing.out(Easing.back(1.4)) }),
          withTiming(0, { duration: 210, easing: sinEase }),
        );
        reactionScaleX.value = withSequence(
          withTiming(1.12, { duration: 95, easing: quickEase }),
          withTiming(0.98, { duration: 165, easing: sinEase }),
          withTiming(1, { duration: 190, easing: sinEase }),
        );
        reactionScaleY.value = withSequence(
          withTiming(1.12, { duration: 95, easing: quickEase }),
          withTiming(0.98, { duration: 165, easing: sinEase }),
          withTiming(1, { duration: 190, easing: sinEase }),
        );
        reactionRotate.value = withSequence(
          withTiming(2.4, { duration: 110, easing: quickEase }),
          withTiming(-1.4, { duration: 160, easing: sinEase }),
          withTiming(0, { duration: 230, easing: sinEase }),
        );
        break;
      case 'think':
        reactionY.value = withSequence(
          withTiming(0.8, { duration: 420, easing: sinEase }),
          withTiming(0, { duration: 520, easing: sinEase }),
        );
        reactionRotate.value = withSequence(
          withTiming(-4.2, { duration: 520, easing: sinEase }),
          withTiming(-2.1, { duration: 520, easing: sinEase }),
          withTiming(0, { duration: 620, easing: sinEase }),
        );
        reactionScaleX.value = withSequence(
          withTiming(0.99, { duration: 420, easing: sinEase }),
          withTiming(1, { duration: 620, easing: sinEase }),
        );
        reactionScaleY.value = withSequence(
          withTiming(1.01, { duration: 420, easing: sinEase }),
          withTiming(1, { duration: 620, easing: sinEase }),
        );
        break;
      case 'blink':
      case 'idle':
      default:
        break;
    }
  }, [reaction, reduceMotion, reactionY, reactionRotate, reactionScaleX, reactionScaleY]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: bob.value + reactionY.value },
      { rotate: `${sway.value + reactionRotate.value}deg` },
      { scaleX: breath.value * reactionScaleX.value },
      { scaleY: breath.value * reactionScaleY.value },
    ],
  }));

  const expression: PalExpression = reaction ?? (blinking ? 'blink' : baseExpression);
  const inner = <PalAvatar {...props} size={size} expression={expression} clip={clip} />;

  return (
    <Animated.View style={style}>
      {ring ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 3,
            borderColor: '#FFFFFF',
            overflow: 'hidden',
            backgroundColor: '#fff',
            shadowColor: '#0F172A',
            shadowOpacity: 0.12,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 2,
          }}
        >
          {inner}
        </View>
      ) : (
        inner
      )}
    </Animated.View>
  );
}
