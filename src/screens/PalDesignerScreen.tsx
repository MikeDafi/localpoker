import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import {
  BG_STYLES,
  DEFAULT_PAL,
  EYEBROW_STYLES,
  EYE_STYLES,
  FACIAL_HAIR,
  FEATURE_SPECS,
  GLASSES,
  HAIR_STYLES,
  HEADWEAR,
  HEAD_SHAPES,
  MOUTH_STYLES,
  NOSE_STYLES,
  PalConfig,
  FeatureSpec,
  normalizePal,
  randomPal,
} from '../avatar/palConfig';
import { PalAvatar } from '../components/PalAvatar';
import { AnimatedPal } from '../components/AnimatedPal';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { AdBanner } from '../components/AdBanner';
import { RootStackParamList } from '../navigation/types';
import { useApp } from '../state/AppContext';
import { sound } from '../services/sound';
import { colors, fonts, radii, shadows, spacing, easings } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PalDesigner'>;
type FeatureGroup = FeatureSpec['group'];
type BooleanPalKey = {
  [K in keyof PalConfig]: PalConfig[K] extends boolean ? K : never;
}[keyof PalConfig];
type NumericPalKey = {
  [K in keyof PalConfig]: PalConfig[K] extends number ? K : never;
}[keyof PalConfig];
type EditableNumericKey = Exclude<NumericPalKey, 'version'>;
type NumericFeatureSpec = FeatureSpec & { key: EditableNumericKey; kind: 'option' | 'color' };
type ToggleFeatureSpec = FeatureSpec & { key: BooleanPalKey; kind: 'toggle' };
type EditableFeatureSpec = NumericFeatureSpec | ToggleFeatureSpec;

const GROUPS: readonly FeatureGroup[] = ['Face', 'Hair', 'Eyes', 'Extras', 'Style'] as const;
const EDITABLE_FEATURE_SPECS = FEATURE_SPECS as readonly EditableFeatureSpec[];
const PREVIEW_SIZE = 160;

const OPTION_NAMES: Partial<Record<EditableNumericKey, readonly string[]>> = {
  headShape: HEAD_SHAPES,
  hairStyle: HAIR_STYLES,
  eyebrowStyle: EYEBROW_STYLES,
  eyeStyle: EYE_STYLES,
  noseStyle: NOSE_STYLES,
  mouthStyle: MOUTH_STYLES,
  facialHair: FACIAL_HAIR,
  glasses: GLASSES,
  headwear: HEADWEAR,
  bgStyle: BG_STYLES,
};

const GROUP_ACCENTS: Record<FeatureGroup, string> = {
  Face: colors.accentPink,
  Hair: colors.gold,
  Eyes: colors.accentAlt,
  Extras: colors.accent,
  Style: colors.green,
};

const GROUP_SUBTITLES: Record<FeatureGroup, string> = {
  Face: 'Shape, smile, skin and tiny details',
  Hair: 'Silhouette, shade and signature flair',
  Eyes: 'Expression, brows and color energy',
  Extras: 'Glasses, hats and table presence',
  Style: 'Outfit color and avatar backdrop',
};

const GROUP_COUNTS = EDITABLE_FEATURE_SPECS.reduce<Record<FeatureGroup, number>>(
  (counts, spec) => ({ ...counts, [spec.group]: counts[spec.group] + 1 }),
  { Face: 0, Hair: 0, Eyes: 0, Extras: 0, Style: 0 },
);

export function PalDesignerScreen({ navigation }: Props) {
  const { profile, setPal } = useApp();
  const [pal, setPalState] = useState<PalConfig>(() => normalizePal(profile.pal));
  const [activeGroup, setActiveGroup] = useState<FeatureGroup>('Face');
  const { width } = useWindowDimensions();
  const compactPreview = width < 370;

  useEffect(() => {
    setPalState(normalizePal(profile.pal));
  }, [profile.pal]);

  const visibleSpecs = useMemo(
    () => EDITABLE_FEATURE_SPECS.filter((spec) => spec.group === activeGroup),
    [activeGroup],
  );

  const isDirty = useMemo(
    () => JSON.stringify(pal) !== JSON.stringify(normalizePal(profile.pal)),
    [pal, profile.pal],
  );

  const setNumericFeature = useCallback((key: EditableNumericKey, value: number) => {
    sound.play('select');
    setPalState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setBooleanFeature = useCallback((key: BooleanPalKey, value: boolean) => {
    sound.play('select');
    setPalState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const selectGroup = useCallback((group: FeatureGroup) => {
    if (group !== activeGroup) {
      sound.play('tap');
      setActiveGroup(group);
    }
  }, [activeGroup]);

  const handleRandomize = useCallback(() => {
    sound.play('select');
    setPalState(randomPal());
  }, []);

  const handleReset = useCallback(() => {
    sound.play('select');
    setPalState(normalizePal(DEFAULT_PAL));
  }, []);

  const handleSave = useCallback(() => {
    setPal(normalizePal(pal));
    navigation.goBack();
  }, [navigation, pal, setPal]);

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader
        title="Pal Designer"
        onBack={() => navigation.goBack()}
        right={(
          <View style={styles.headerAvatar}>
            <PalAvatar config={pal} size={34} />
          </View>
        )}
      />

      <View style={styles.container}>
        <Animated.View entering={FadeInDown.delay(40).duration(400).easing(Easing.bezier(...easings.out))}>
          <WiiPanel padding={spacing.lg} style={styles.previewPanel}>
            <View style={styles.previewBloom} />
            <View style={styles.previewSparkle} />
            <View style={[styles.previewContent, compactPreview && styles.previewContentCompact]}>
              <View style={styles.previewStage}>
                <View style={styles.avatarHalo}>
                  <AnimatedPal config={pal} size={PREVIEW_SIZE} alive ring />
                </View>
              </View>

              <View style={[styles.previewCopy, compactPreview && styles.previewCopyCompact]}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Live preview</Text>
                </View>
                <Text style={styles.previewTitle}>Design your table Pal</Text>
                <Text style={styles.previewSubtitle}>
                  Build a console-style avatar with smooth, instant updates.
                </Text>
                <Text style={[styles.dirtyText, isDirty && styles.dirtyTextActive]}>
                  {isDirty ? 'Unsaved changes ready' : 'Matching saved profile'}
                </Text>
              </View>
            </View>
          </WiiPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(95).duration(360).easing(Easing.bezier(...easings.out))}>
          <View style={styles.groupTabs}>
            {GROUPS.map((group) => {
              const active = group === activeGroup;
              return (
                <Pressable
                  key={group}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => selectGroup(group)}
                  style={({ pressed }) => [
                    styles.groupTab,
                    active && { backgroundColor: GROUP_ACCENTS[group], borderColor: GROUP_ACCENTS[group] },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.groupTabLabel, active && styles.groupTabLabelActive]}>{group}</Text>
                  <Text style={[styles.groupTabCount, active && styles.groupTabCountActive]}>
                    {GROUP_COUNTS[group]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <ScrollView
          style={styles.controlsScroll}
          contentContainerStyle={styles.controlsContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            key={`${activeGroup}-intro`}
            entering={FadeInDown.duration(360).easing(Easing.bezier(...easings.out))}
            style={styles.sectionHeader}
          >
            <View>
              <Text style={styles.sectionEyebrow}>{activeGroup}</Text>
              <Text style={styles.sectionTitle}>{GROUP_SUBTITLES[activeGroup]}</Text>
            </View>
            <View style={[styles.sectionCountPill, { borderColor: GROUP_ACCENTS[activeGroup] }]}>
              <Text style={[styles.sectionCountText, { color: GROUP_ACCENTS[activeGroup] }]}>
                {visibleSpecs.length} controls
              </Text>
            </View>
          </Animated.View>

          {visibleSpecs.map((spec, index) => (
            <Animated.View
              key={String(spec.key)}
              entering={FadeInDown.delay(index * 46).duration(380).easing(Easing.bezier(...easings.out))}
            >
              <FeatureControl
                pal={pal}
                spec={spec}
                accent={GROUP_ACCENTS[spec.group]}
                onBooleanChange={setBooleanFeature}
                onNumberChange={setNumericFeature}
              />
            </Animated.View>
          ))}
        </ScrollView>

        <View style={styles.bottomDock}>
          <AdBanner />
          <View style={styles.quickActions}>
            <WiiButton
              label="Randomize"
              onPress={handleRandomize}
              variant="gold"
              size="sm"
              fullWidth
              style={styles.actionHalf}
            />
            <WiiButton
              label="Reset"
              onPress={handleReset}
              variant="white"
              size="sm"
              fullWidth
              style={styles.actionHalf}
            />
          </View>
          <WiiButton label="Save" onPress={handleSave} variant="blue" size="lg" fullWidth />
        </View>
      </View>
    </ScreenBackground>
  );
}

function FeatureControl({
  accent,
  onBooleanChange,
  onNumberChange,
  pal,
  spec,
}: {
  accent: string;
  onBooleanChange: (key: BooleanPalKey, value: boolean) => void;
  onNumberChange: (key: EditableNumericKey, value: number) => void;
  pal: PalConfig;
  spec: EditableFeatureSpec;
}) {
  if (spec.kind === 'toggle') {
    const enabled = pal[spec.key];
    return (
      <View style={styles.controlCard}>
        <View style={styles.controlLabelWrap}>
          <Text style={styles.controlLabel}>{spec.label}</Text>
          <Text style={styles.controlHint}>{enabled ? 'Enabled' : 'Disabled'}</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled }}
          onPress={() => onBooleanChange(spec.key, !enabled)}
          style={({ pressed }) => [
            styles.toggleTrack,
            enabled && { backgroundColor: accent, borderColor: accent },
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.toggleKnobRail, enabled && styles.toggleKnobRailOn]}>
            <View style={styles.toggleKnob} />
          </View>
          <Text style={[styles.toggleText, enabled && styles.toggleTextOn]}>
            {enabled ? 'On' : 'Off'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const value = normalizeIndex(pal[spec.key], spec.count);

  if (spec.kind === 'color') {
    return (
      <View style={styles.controlCard}>
        <View style={styles.colorHeader}>
          <View style={styles.controlLabelWrap}>
            <Text style={styles.controlLabel}>{spec.label}</Text>
            <Text style={styles.controlHint}>Color {value + 1} of {spec.count}</Text>
          </View>
          <View
            style={[
              styles.currentColor,
              { backgroundColor: spec.palette?.[value] ?? colors.panelAlt, borderColor: accent },
            ]}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.swatches}
        >
          {(spec.palette ?? []).map((hex, index) => {
            const selected = index === value;
            return (
              <Pressable
                key={`${spec.key}-${hex}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`${spec.label} color ${index + 1}`}
                accessibilityState={{ selected }}
                onPress={() => {
                  if (selected) {
                    sound.play('tap');
                    return;
                  }
                  onNumberChange(spec.key, index);
                }}
                style={({ pressed }) => [
                  styles.swatchButton,
                  selected && { borderColor: accent, backgroundColor: colors.panel },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.swatchColor, { backgroundColor: hex }]} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  const optionName = optionLabel(spec.key, value, spec.count);
  return (
    <View style={styles.controlCard}>
      <View style={styles.controlLabelWrap}>
        <Text style={styles.controlLabel}>{spec.label}</Text>
        <Text style={styles.controlHint}>{optionName}</Text>
      </View>
      <View style={styles.stepper}>
        <StepperButton label="‹" onPress={() => onNumberChange(spec.key, cycle(value, -1, spec.count))} />
        <View style={[styles.stepperValue, { borderColor: accent }]}>
          <Text style={styles.stepperValueText}>{value + 1}</Text>
          <Text style={styles.stepperValueSub}>/ {spec.count}</Text>
        </View>
        <StepperButton label="›" onPress={() => onNumberChange(spec.key, cycle(value, 1, spec.count))} />
      </View>
    </View>
  );
}

function StepperButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
    >
      <Text style={styles.stepperButtonText}>{label}</Text>
    </Pressable>
  );
}

function cycle(value: number, delta: number, count: number) {
  return normalizeIndex(value + delta, count);
}

function normalizeIndex(value: number, count: number) {
  if (count <= 0) return 0;
  const whole = Math.trunc(value);
  return ((whole % count) + count) % count;
}

function optionLabel(key: EditableNumericKey, value: number, count: number) {
  const option = OPTION_NAMES[key]?.[normalizeIndex(value, count)];
  if (!option) return `${value + 1} / ${count}`;
  return option
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.soft,
  },
  previewPanel: {
    borderColor: 'rgba(34,171,228,0.28)',
  },
  previewContent: {
    minHeight: 176,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  previewContentCompact: {
    flexDirection: 'column',
    minHeight: 252,
    justifyContent: 'center',
  },
  previewStage: {
    width: PREVIEW_SIZE + spacing.lg,
    height: PREVIEW_SIZE + spacing.lg,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,214,245,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(127,214,245,0.36)',
  },
  avatarHalo: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: PREVIEW_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
    ...shadows.blueGlow,
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  previewCopyCompact: {
    alignItems: 'center',
  },
  liveBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(47,191,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(47,191,113,0.22)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.online,
  },
  liveText: {
    fontFamily: fonts.bold,
    color: colors.feltDeep,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  previewTitle: {
    fontFamily: fonts.bold,
    color: colors.ink,
    fontSize: 25,
    lineHeight: 30,
  },
  previewSubtitle: {
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 21,
  },
  dirtyText: {
    alignSelf: 'flex-start',
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
    fontSize: 13,
  },
  dirtyTextActive: {
    color: colors.blueDeep,
  },
  previewBloom: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(108,92,231,0.13)',
    right: -58,
    top: -72,
  },
  previewSparkle: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(255,95,162,0.13)',
    left: -24,
    bottom: -22,
  },
  groupTabs: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.soft,
  },
  groupTab: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  groupTabLabel: {
    fontFamily: fonts.bold,
    color: colors.inkSoft,
    fontSize: 12,
  },
  groupTabLabelActive: {
    color: colors.panel,
  },
  groupTabCount: {
    marginTop: 1,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
    fontSize: 10,
  },
  groupTabCountActive: {
    color: 'rgba(255,255,255,0.88)',
  },
  controlsScroll: {
    flex: 1,
    marginHorizontal: -spacing.xs,
  },
  controlsContent: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  sectionEyebrow: {
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    marginTop: 2,
    fontFamily: fonts.semibold,
    color: colors.ink,
    fontSize: 17,
    lineHeight: 22,
  },
  sectionCountPill: {
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sectionCountText: {
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  controlCard: {
    minHeight: 84,
    borderRadius: radii.xl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.soft,
  },
  controlLabelWrap: {
    flex: 1,
    minWidth: 0,
  },
  controlLabel: {
    fontFamily: fonts.bold,
    color: colors.ink,
    fontSize: 18,
  },
  controlHint: {
    marginTop: 3,
    fontFamily: fonts.medium,
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 17,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperButtonText: {
    marginTop: -2,
    fontFamily: fonts.bold,
    color: colors.blueDeep,
    fontSize: 31,
    lineHeight: 34,
  },
  stepperValue: {
    minWidth: 96,
    height: 48,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    backgroundColor: '#F8FBFD',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  stepperValueText: {
    fontFamily: fonts.bold,
    color: colors.ink,
    fontSize: 19,
  },
  stepperValueSub: {
    marginLeft: 3,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
    fontSize: 12,
  },
  colorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  currentColor: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    borderWidth: 3,
    backgroundColor: colors.panelAlt,
  },
  swatches: {
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  swatchButton: {
    width: 43,
    height: 43,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchColor: {
    width: 31,
    height: 31,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(27,42,54,0.28)',
  },
  toggleTrack: {
    width: 112,
    height: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  toggleKnobRail: {
    width: 42,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  toggleKnobRailOn: {
    alignItems: 'flex-end',
  },
  toggleKnob: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    ...shadows.soft,
  },
  toggleText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.bold,
    color: colors.inkMuted,
    fontSize: 14,
  },
  toggleTextOn: {
    color: colors.panel,
  },
  bottomDock: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionHalf: {
    flex: 1,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
});
