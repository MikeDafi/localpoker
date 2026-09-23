import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AdBanner, ADS_ENABLED } from '../components/AdBanner';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiButton } from '../components/WiiButton';
import { WiiPanel } from '../components/WiiPanel';
import {
  SETTINGS_SCHEMA,
  DEFAULT_GAME_SETTINGS,
  normalizeSettings,
  type GameSettings,
  type SettingsSection,
  type SettingField,
} from '../game/settings';
import { RootStackParamList } from '../navigation/types';
import { sound } from '../services/sound';
import { useApp } from '../state/AppContext';
import { colors, fonts, radii, shadows, spacing, type, numeric } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'GameSetup'>;
type SettingValue = GameSettings[keyof GameSettings];
type BooleanSettingKey = { [K in keyof GameSettings]: GameSettings[K] extends boolean ? K : never }[keyof GameSettings];
type NumberSettingKey = { [K in keyof GameSettings]: GameSettings[K] extends number ? K : never }[keyof GameSettings];
type SelectableSettingKey = { [K in keyof GameSettings]: GameSettings[K] extends string | number ? K : never }[keyof GameSettings];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy', hint: 'Relaxed' },
  { value: 'medium', label: 'Medium', hint: 'Balanced' },
  { value: 'hard', label: 'Hard', hint: 'Sharp' },
  { value: 'expert', label: 'Expert', hint: 'Punishing' },
] satisfies { value: GameSettings['difficulty']; label: string; hint: string }[];

export function GameSetupScreen({ navigation, route }: Props) {
  const { settings, updateSettings } = useApp();
  const { width } = useWindowDimensions();
  const [local, setLocal] = useState<GameSettings>(() => ({ ...settings }));

  // App-wide preferences (sound, animations, accessibility) live in Settings, not
  // in per-table Game Setup — only show game/table-relevant sections here.
  const setupSections = useMemo(
    () => SETTINGS_SCHEMA.filter((s) => !['sound', 'animations', 'a11y'].includes(s.id)),
    [],
  );
  const [activeSectionId, setActiveSectionId] = useState(() => setupSections[0]?.id ?? '');

  const isFriends = route.params.mode === 'friends';
  const compact = width < 430;
  const activeSection = useMemo(
    () => setupSections.find((section) => section.id === activeSectionId) ?? setupSections[0],
    [activeSectionId, setupSections],
  );
  const visibleFields = useMemo(
    () => activeSection.fields.filter((field) => shouldShowField(field, isFriends)),
    [activeSection, isFriends],
  );
  const summarySettings = useMemo(() => normalizeSettings(local), [local]);

  const setField = useCallback(<K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    sound.play('select');
    setLocal((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setBooleanField = useCallback(<K extends BooleanSettingKey>(key: K, value: boolean) => {
    setField(key, value as GameSettings[K]);
  }, [setField]);

  const setNumberField = useCallback(<K extends NumberSettingKey>(key: K, value: number) => {
    setField(key, value as GameSettings[K]);
  }, [setField]);

  const setSelectableField = useCallback(<K extends SelectableSettingKey>(key: K, value: string | number) => {
    setField(key, value as GameSettings[K]);
  }, [setField]);

  const handleBooleanChange = useCallback((field: SettingField, value: boolean) => {
    setBooleanField(field.key as BooleanSettingKey, value);
  }, [setBooleanField]);

  const handleNumberChange = useCallback((field: SettingField, value: number) => {
    setNumberField(field.key as NumberSettingKey, value);
  }, [setNumberField]);

  const handleSelectChange = useCallback((field: SettingField, value: string | number) => {
    setSelectableField(field.key as SelectableSettingKey, value);
  }, [setSelectableField]);

  const handleSectionPress = useCallback((sectionId: string) => {
    if (sectionId !== activeSectionId) {
      sound.play('select');
      setActiveSectionId(sectionId);
    }
  }, [activeSectionId]);

  const handleReset = useCallback(() => {
    sound.play('select');
    setLocal({ ...DEFAULT_GAME_SETTINGS });
  }, []);

  const handleStart = useCallback(() => {
    const tableSettings = normalizeSettings(local);
    sound.play('start');
    updateSettings(local);
    navigation.replace('Table', {
      settings: tableSettings,
      seed: Math.floor(Math.random() * 1e9),
      roomCode: route.params.roomCode,
    });
  }, [local, navigation, route.params.roomCode, updateSettings]);

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="Game Setup" onBack={() => navigation.goBack()} />

      <View style={styles.container}>
        <WiiPanel padding={spacing.lg} style={styles.heroPanel}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIntro}>
              <Text style={styles.modeLabel}>{isFriends ? 'Private friends table' : 'Quick play vs bots'}</Text>
              <Text style={styles.heroTitle}>Tune your perfect table</Text>
              <Text style={styles.optionCount}>Table & opponent rules</Text>
            </View>
            <View style={styles.stakesBadge}>
              <Text style={styles.stakesKicker}>Stakes</Text>
              <Text style={styles.stakesValue}>{summarySettings.smallBlind}/{summarySettings.bigBlind}</Text>
              <Text style={styles.stakesMeta}>{formatChips(summarySettings.startingStack)} stack</Text>
            </View>
          </View>

          <View style={styles.quickPickHeader}>
            <Text style={styles.sectionEyebrow}>Difficulty quick-pick</Text>
            <Text style={styles.quickPickValue}>{capitalize(local.difficulty)}</Text>
          </View>
          <View style={styles.difficultyGrid}>
            {DIFFICULTY_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setField('difficulty', option.value)}
                style={[
                  styles.difficultyPill,
                  local.difficulty === option.value && styles.difficultyPillActive,
                ]}
              >
                <Text style={[styles.difficultyLabel, local.difficulty === option.value && styles.difficultyLabelActive]}>
                  {option.label}
                </Text>
                <Text style={[styles.difficultyHint, local.difficulty === option.value && styles.difficultyHintActive]}>
                  {option.hint}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.heroActions, compact && styles.heroActionsCompact]}>
            <WiiButton
              label="Reset defaults"
              variant="white"
              size="md"
              onPress={handleReset}
              fullWidth={compact}
              style={compact ? undefined : styles.resetButton}
            />
            <WiiButton
              label="Start Game"
              variant="green"
              size="lg"
              onPress={handleStart}
              fullWidth={compact}
              style={compact ? undefined : styles.startButton}
            />
          </View>
        </WiiPanel>

        <View style={styles.tabsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            {setupSections.map((section) => (
              <SectionTab
                key={section.id}
                section={section}
                active={section.id === activeSection.id}
                count={section.fields.filter((field) => shouldShowField(field, isFriends)).length}
                onPress={handleSectionPress}
              />
            ))}
          </ScrollView>
        </View>

        <ScrollView
          style={styles.fieldsScroll}
          contentContainerStyle={styles.fieldsContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View key={activeSection.id} entering={FadeInDown.duration(360)}>
            <WiiPanel padding={0} style={styles.sectionPanel}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionIconChip}>
                    <Text style={styles.sectionIcon}>{activeSection.icon}</Text>
                  </View>
                  <View>
                    <Text style={styles.sectionTitle}>{activeSection.title}</Text>
                    <Text style={styles.sectionSubtitle}>{visibleFields.length} settings in this section</Text>
                  </View>
                </View>
              </View>

              {visibleFields.map((field, index) => (
                <SettingRow
                  key={String(field.key)}
                  field={field}
                  value={local[field.key]}
                  compact={compact}
                  isLast={index === visibleFields.length - 1}
                  onBooleanChange={handleBooleanChange}
                  onNumberChange={handleNumberChange}
                  onSelectChange={handleSelectChange}
                />
              ))}
            </WiiPanel>
          </Animated.View>
        </ScrollView>

        {ADS_ENABLED ? (
          <View style={styles.adWrap}>
            <AdBanner />
          </View>
        ) : null}
      </View>
    </ScreenBackground>
  );
}

function shouldShowField(field: SettingField, isFriends: boolean): boolean {
  return !(isFriends && field.key === 'numOpponents');
}

function SectionTab({ section, active, count, onPress }: {
  section: SettingsSection;
  active: boolean;
  count: number;
  onPress: (sectionId: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(section.id)}
      style={[styles.tab, active && styles.tabActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.tabIconChip, active && styles.tabIconChipActive]}>
        <Text style={styles.tabIcon}>{section.icon}</Text>
      </View>
      <Text style={[styles.tabTitle, active && styles.tabTitleActive]} numberOfLines={1}>
        {section.title}
      </Text>
      <Text style={[styles.tabCount, active && styles.tabCountActive]}>{count}</Text>
    </Pressable>
  );
}

function SettingRow({
  field,
  value,
  compact,
  isLast,
  onBooleanChange,
  onNumberChange,
  onSelectChange,
}: {
  field: SettingField;
  value: SettingValue;
  compact: boolean;
  isLast: boolean;
  onBooleanChange: (field: SettingField, value: boolean) => void;
  onNumberChange: (field: SettingField, value: number) => void;
  onSelectChange: (field: SettingField, value: string | number) => void;
}) {
  return (
    <View style={[styles.settingRow, compact && styles.settingRowCompact, !isLast && styles.settingDivider]}>
      <View style={[styles.settingCopy, compact && styles.settingCopyCompact]}>
        <Text style={styles.settingLabel}>{field.label}</Text>
        {field.help ? <Text style={styles.settingHelp}>{field.help}</Text> : null}
      </View>
      <View style={[styles.controlSlot, compact && styles.controlSlotCompact]}>
        <FieldControl
          field={field}
          value={value}
          onBooleanChange={onBooleanChange}
          onNumberChange={onNumberChange}
          onSelectChange={onSelectChange}
        />
      </View>
    </View>
  );
}

function FieldControl({
  field,
  value,
  onBooleanChange,
  onNumberChange,
  onSelectChange,
}: {
  field: SettingField;
  value: SettingValue;
  onBooleanChange: (field: SettingField, value: boolean) => void;
  onNumberChange: (field: SettingField, value: number) => void;
  onSelectChange: (field: SettingField, value: string | number) => void;
}) {
  if (field.type === 'toggle') {
    const enabled = Boolean(value);
    return (
      <View style={styles.toggleWrap}>
        <Text style={[styles.toggleText, enabled && styles.toggleTextActive]}>{enabled ? 'On' : 'Off'}</Text>
        <Switch
          value={enabled}
          onValueChange={(next) => onBooleanChange(field, next)}
          trackColor={{ false: colors.border, true: colors.blueLight }}
          thumbColor={enabled ? colors.blueDeep : colors.panel}
          ios_backgroundColor={colors.border}
        />
      </View>
    );
  }

  if (field.type === 'select') {
    return (
      <View style={styles.optionGroup}>
        {(field.options ?? []).map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={`${String(field.key)}-${String(option.value)}`}
              onPress={() => onSelectChange(field, option.value)}
              style={[styles.optionPill, active && styles.optionPillActive]}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  const numberValue = typeof value === 'number' ? value : 0;
  const step = field.step ?? 1;
  const min = field.min ?? Number.MIN_SAFE_INTEGER;
  const max = field.max ?? Number.MAX_SAFE_INTEGER;
  const nextDown = clampToStep(numberValue - step, field);
  const nextUp = clampToStep(numberValue + step, field);
  const atMin = numberValue <= min;
  const atMax = numberValue >= max;
  const progress = getRangeProgress(numberValue, field);

  return (
    <View style={styles.stepperWrap}>
      <View style={styles.stepperTopRow}>
        <Pressable
          disabled={atMin}
          onPress={() => onNumberChange(field, nextDown)}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${field.label}`}
          style={[styles.stepButton, atMin && styles.stepButtonDisabled]}
        >
          <Text style={[styles.stepButtonText, atMin && styles.stepButtonTextDisabled]}>−</Text>
        </Pressable>
        <View style={styles.numberReadout}>
          <Text style={styles.numberValue}>{formatSettingValue(field, numberValue)}</Text>
          <Text style={styles.numberMeta}>{formatRange(field)}</Text>
        </View>
        <Pressable
          disabled={atMax}
          onPress={() => onNumberChange(field, nextUp)}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${field.label}`}
          style={[styles.stepButton, atMax && styles.stepButtonDisabled]}
        >
          <Text style={[styles.stepButtonText, atMax && styles.stepButtonTextDisabled]}>+</Text>
        </Pressable>
      </View>
      {progress !== null ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

function clampToStep(value: number, field: SettingField): number {
  const step = field.step ?? 1;
  const min = field.min ?? Number.MIN_SAFE_INTEGER;
  const max = field.max ?? Number.MAX_SAFE_INTEGER;
  const base = Number.isFinite(min) ? min : 0;
  const stepped = base + Math.round((value - base) / step) * step;
  const clamped = Math.max(min, Math.min(max, stepped));
  return Number(clamped.toFixed(decimalPlaces(step)));
}

function getRangeProgress(value: number, field: SettingField): number | null {
  if (typeof field.min !== 'number' || typeof field.max !== 'number' || field.max <= field.min) return null;
  return Math.max(0, Math.min(100, Math.round(((value - field.min) / (field.max - field.min)) * 100)));
}

function decimalPlaces(step: number): number {
  const [, decimals = ''] = String(step).split('.');
  return decimals.length;
}

function formatRange(field: SettingField): string {
  if (typeof field.min !== 'number' || typeof field.max !== 'number') return `step ${field.step ?? 1}`;
  return `${field.min}–${field.max} · step ${field.step ?? 1}`;
}

function formatSettingValue(field: SettingField, value: number): string {
  const key = String(field.key).toLowerCase();
  if (key.includes('pct') || key.includes('volume') || key.includes('aggression')) return `${value}%`;
  if (key.includes('sec')) return `${value}s`;
  if (key.includes('min')) return `${value}m`;
  return formatChips(value);
}

function formatChips(value: number): string {
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  return String(value);
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  heroPanel: {
    marginTop: spacing.xs,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroIntro: {
    flex: 1,
  },
  modeLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.blueDeep,
  },
  heroTitle: {
    marginTop: spacing.xs,
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 28,
    color: colors.ink,
  },
  optionCount: {
    marginTop: spacing.xs,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkMuted,
  },
  stakesBadge: {
    minWidth: 112,
    borderRadius: radii.lg,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  stakesKicker: {
    ...type.label,
    color: colors.inkMuted,
  },
  stakesValue: {
    marginTop: 2,
    fontFamily: fonts.bold,
    fontSize: 21,
    // #9: stakes are data, not a status — keep them in the ink colour
    color: colors.ink,
    ...numeric,
  },
  stakesMeta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkSoft,
  },
  quickPickHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionEyebrow: {
    ...type.label,
    color: colors.inkMuted,
  },
  quickPickValue: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.blueDeep,
  },
  difficultyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  difficultyPill: {
    flexGrow: 1,
    minWidth: 78,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  difficultyPillActive: {
    backgroundColor: colors.blue,
    borderColor: colors.blueDeep,
    shadowColor: colors.blueDeep,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 1,
  },
  difficultyLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  difficultyLabelActive: {
    color: colors.onBlue,
  },
  difficultyHint: {
    marginTop: 1,
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.inkMuted,
  },
  difficultyHintActive: {
    color: 'rgba(255,255,255,0.82)',
  },
  summaryGrid: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryChip: {
    flexGrow: 1,
    minWidth: 88,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: colors.inkMuted,
  },
  summaryValue: {
    marginTop: 2,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  heroActions: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroActionsCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  resetButton: {
    minWidth: 150,
  },
  startButton: {
    flex: 1,
  },
  tabsWrap: {
    marginTop: spacing.md,
    marginHorizontal: -spacing.lg,
  },
  tabsContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    minWidth: 116,
    maxWidth: 156,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.soft,
  },
  tabActive: {
    backgroundColor: colors.panel,
    borderColor: colors.blue,
    transform: [{ translateY: -1 }],
  },
  tabIconChip: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconChipActive: {
    borderColor: colors.blueLight,
    backgroundColor: 'rgba(127,214,245,0.18)',
  },
  tabIcon: {
    fontSize: 17,
    lineHeight: 21,
  },
  tabTitle: {
    marginTop: 2,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.inkSoft,
  },
  tabTitleActive: {
    color: colors.blueDeep,
  },
  tabCount: {
    marginTop: 2,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: colors.panelAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.inkMuted,
  },
  tabCountActive: {
    backgroundColor: colors.blueLight,
    color: colors.blueInk,
  },
  fieldsScroll: {
    flex: 1,
    minHeight: 220,
  },
  fieldsContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  sectionPanel: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.panelAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionIconChip: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'rgba(127,214,245,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.ink,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkMuted,
  },
  settingRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  settingRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  settingDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingCopy: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  settingCopyCompact: {
    paddingRight: 0,
  },
  settingLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  settingHelp: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 17,
    color: colors.inkMuted,
  },
  controlSlot: {
    width: 252,
    alignItems: 'flex-end',
  },
  controlSlotCompact: {
    width: '100%',
    alignItems: 'stretch',
  },
  toggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleText: {
    minWidth: 28,
    textAlign: 'right',
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.inkMuted,
  },
  toggleTextActive: {
    color: colors.blueDeep,
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  optionPill: {
    minHeight: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  optionPillActive: {
    backgroundColor: colors.blue,
    borderColor: colors.blueDeep,
  },
  optionText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.inkSoft,
  },
  optionTextActive: {
    color: colors.onBlue,
  },
  stepperWrap: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  stepperTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  stepButton: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  stepButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    opacity: 0.58,
  },
  stepButtonText: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 28,
    color: colors.blueDeep,
  },
  stepButtonTextDisabled: {
    color: colors.inkMuted,
  },
  numberReadout: {
    minWidth: 108,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  numberValue: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.ink,
  },
  numberMeta: {
    marginTop: 1,
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.inkMuted,
  },
  progressTrack: {
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.panelAlt,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.accentAlt,
  },
  adWrap: {
    paddingTop: spacing.sm,
  },
});
