import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiButton } from '../components/WiiButton';
import { WiiPanel } from '../components/WiiPanel';
import {
  AccessibilityIcon,
  PaletteIcon,
  SoundIcon,
  SparklesIcon,
  TargetIcon,
} from '../components/Icons';
import {
  SETTINGS_SCHEMA,
  type GameSettings,
  type SettingField,
  type SettingsSection,
} from '../game/settings';
import { RootStackParamList } from '../navigation/types';
import { sound } from '../services/sound';
import { useApp } from '../state/AppContext';
import { colors, fonts, radii, shadows, spacing } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type SettingValue = GameSettings[keyof GameSettings];
type SetField = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

const APP_PREFERENCE_SECTION_IDS = ['ingame', 'sound', 'animations', 'a11y', 'appearance'] as const;
type AppPreferenceSectionId = (typeof APP_PREFERENCE_SECTION_IDS)[number];

const APP_PREFERENCE_SECTION_SET = new Set<string>(APP_PREFERENCE_SECTION_IDS);
const APP_SECTION_ICONS: Record<AppPreferenceSectionId, IconComponent> = {
  ingame: TargetIcon,
  sound: SoundIcon,
  animations: SparklesIcon,
  a11y: AccessibilityIcon,
  appearance: PaletteIcon,
};

export function SettingsScreen({ navigation }: Props) {
  const { settings, updateSettings, auth, logout, resetStats, profile, deleteAccount } = useApp();
  const { width } = useWindowDimensions();
  const compact = width < 430;
  const [deletingAccount, setDeletingAccount] = useState(false);

  const appSections = useMemo(
    () =>
      SETTINGS_SCHEMA.filter((section) => APP_PREFERENCE_SECTION_SET.has(section.id)).sort(
        (a, b) =>
          APP_PREFERENCE_SECTION_IDS.indexOf(a.id as AppPreferenceSectionId) -
          APP_PREFERENCE_SECTION_IDS.indexOf(b.id as AppPreferenceSectionId),
      ),
    [],
  );

  function setField<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    updateSettings({ [key]: value } as Partial<GameSettings>);
    sound.play('select');
  }

  const confirmResetStats = () => {
    Alert.alert('Reset stats?', 'This clears all lifetime poker stats. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset stats', style: 'destructive', onPress: resetStats },
    ]);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This deletes your LocalPoker profile, stats, friends, saved game, online handle, friend requests, and room presence. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            const result = await deleteAccount();
            setDeletingAccount(false);
            Alert.alert(
              result.ok ? 'Account deleted' : 'Could not delete account',
              result.reason || (result.ok ? 'Your account data was deleted.' : 'Try again in a moment.'),
            );
          },
        },
      ],
    );
  };

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {appSections.map((section) => (
          <SettingsSectionCard
            key={section.id}
            section={section}
            settings={settings}
            compact={compact}
            onSetField={setField}
          />
        ))}

        <AccountSection
          compact={compact}
          provider={formatProvider(auth.provider)}
          handle={auth.handle ?? 'Not connected'}
          displayName={profile.name}
          coins={profile.coins}
          onCustomizePal={() => navigation.navigate('PalDesigner')}
          onLogout={logout}
          onResetStats={confirmResetStats}
          onDeleteAccount={confirmDeleteAccount}
          deletingAccount={deletingAccount}
        />

        <Text style={styles.footer}>LocalPoker v0.1 · Play-money only</Text>
      </ScrollView>
    </ScreenBackground>
  );
}

function SettingsSectionCard({
  section,
  settings,
  compact,
  onSetField,
}: {
  section: SettingsSection;
  settings: GameSettings;
  compact: boolean;
  onSetField: SetField;
}) {
  return (
    <WiiPanel padding={0} style={styles.sectionPanel}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <SectionIconChip Icon={getAppSectionIcon(section.id)} fallbackIcon={section.icon} />
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionSubtitle}>{section.fields.length} {section.fields.length === 1 ? 'option' : 'options'}</Text>
          </View>
        </View>
      </View>

      {section.fields.map((field, index) => (
        <SettingRow
          key={String(field.key)}
          field={field}
          value={settings[field.key]}
          compact={compact}
          isLast={index === section.fields.length - 1}
          onSetField={onSetField}
        />
      ))}
    </WiiPanel>
  );
}

function SettingRow({
  field,
  value,
  compact,
  isLast,
  onSetField,
}: {
  field: SettingField;
  value: SettingValue;
  compact: boolean;
  isLast: boolean;
  onSetField: SetField;
}) {
  const isToggle = field.type === 'toggle';
  const rowCompact = compact && !isToggle;
  return (
    <View style={[styles.settingRow, rowCompact && styles.settingRowCompact, !isLast && styles.settingDivider]}>
      <View style={[styles.settingCopy, rowCompact && styles.settingCopyCompact]}>
        <Text style={styles.settingLabel}>{field.label}</Text>
        {field.help ? <Text style={styles.settingHelp}>{field.help}</Text> : null}
      </View>
      <View style={[isToggle ? styles.toggleSlot : styles.controlSlot, rowCompact && styles.controlSlotCompact]}>
        <FieldControl field={field} value={value} onSetField={onSetField} />
      </View>
    </View>
  );
}

function FieldControl({
  field,
  value,
  onSetField,
}: {
  field: SettingField;
  value: SettingValue;
  onSetField: SetField;
}) {
  if (field.type === 'toggle') {
    const enabled = Boolean(value);
    return (
      <Switch
        value={enabled}
        onValueChange={(next) => onSetField(field.key, next as GameSettings[typeof field.key])}
        trackColor={{ false: colors.border, true: colors.blue }}
        thumbColor={colors.panel}
        ios_backgroundColor={colors.border}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionGroup}
        style={styles.optionScroller}
      >
        {(field.options ?? []).map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={`${String(field.key)}-${String(option.value)}`}
              onPress={() => onSetField(field.key, option.value as GameSettings[typeof field.key])}
              style={[styles.optionPill, active && styles.optionPillActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  const numberValue = typeof value === 'number' ? value : 0;
  const nextDown = clampToStep(numberValue - (field.step ?? 1), field);
  const nextUp = clampToStep(numberValue + (field.step ?? 1), field);
  const atMin = typeof field.min === 'number' && numberValue <= field.min;
  const atMax = typeof field.max === 'number' && numberValue >= field.max;
  const progress = getRangeProgress(numberValue, field);

  return (
    <View style={styles.stepperWrap}>
      <View style={styles.stepperTopRow}>
        <Pressable
          disabled={atMin}
          onPress={() => onSetField(field.key, nextDown as GameSettings[typeof field.key])}
          style={[styles.stepButton, atMin && styles.stepButtonDisabled]}
          accessibilityRole="button"
        >
          <Text style={[styles.stepButtonText, atMin && styles.stepButtonTextDisabled]}>−</Text>
        </Pressable>
        <View style={styles.numberReadout}>
          <Text style={styles.numberValue}>{formatSettingValue(field, numberValue)}</Text>
          <Text style={styles.numberMeta}>{formatRange(field)}</Text>
        </View>
        <Pressable
          disabled={atMax}
          onPress={() => onSetField(field.key, nextUp as GameSettings[typeof field.key])}
          style={[styles.stepButton, atMax && styles.stepButtonDisabled]}
          accessibilityRole="button"
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

function AccountSection({
  compact,
  provider,
  handle,
  displayName,
  coins,
  onCustomizePal,
  onLogout,
  onResetStats,
  onDeleteAccount,
  deletingAccount,
}: {
  compact: boolean;
  provider: string;
  handle: string;
  displayName: string;
  coins: number;
  onCustomizePal: () => void;
  onLogout: () => void;
  onResetStats: () => void;
  onDeleteAccount: () => void;
  deletingAccount: boolean;
}) {
  return (
    <WiiPanel padding={0} style={styles.sectionPanel}>
      <View style={styles.accountHeader}>
        <View style={styles.sectionTitleRow}>
          <SectionIconChip fallbackIcon="👤" />
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionTitle}>Account</Text>
            <Text style={styles.sectionSubtitle}>Profile, pal, and local progress controls</Text>
          </View>
        </View>
      </View>

      <View style={styles.accountBody}>
        <View style={[styles.accountSummary, compact && styles.accountSummaryCompact]}>
          <AccountFact label="Provider" value={provider} />
          <AccountFact label="Handle" value={handle || 'Not connected'} />
          <AccountFact label="Display name" value={displayName} />
          <AccountFact label="Wallet" value={`${coins.toLocaleString()} coins`} />
        </View>

        <View style={styles.accountActions}>
          <WiiButton label="Customize Pal" variant="blue" size="md" fullWidth onPress={onCustomizePal} />
          <WiiButton label="Log out" variant="white" size="md" fullWidth onPress={onLogout} />
          <WiiButton label="Reset stats" variant="red" size="md" fullWidth onPress={onResetStats} />
          <WiiButton
            label={deletingAccount ? 'Deleting account...' : 'Delete account'}
            variant="red"
            size="md"
            fullWidth
            disabled={deletingAccount}
            onPress={onDeleteAccount}
          />
        </View>

        <View style={styles.supportBox}>
          <Text style={styles.supportTitle}>Safety and support</Text>
          <Text style={styles.supportText}>
            Report or block players from Friends or a live table. For help, privacy, or moderation concerns, contact maskndafi@gmail.com.
          </Text>
        </View>
      </View>
    </WiiPanel>
  );
}

function getAppSectionIcon(sectionId: string): IconComponent | undefined {
  return APP_PREFERENCE_SECTION_SET.has(sectionId)
    ? APP_SECTION_ICONS[sectionId as AppPreferenceSectionId]
    : undefined;
}

function SectionIconChip({ Icon, fallbackIcon }: { Icon?: IconComponent; fallbackIcon: string }) {
  return (
    <View style={styles.sectionIconChip}>
      {Icon ? (
        <Icon size={20} color={colors.blueDeep} />
      ) : (
        <Text style={styles.sectionIconFallback}>{fallbackIcon}</Text>
      )}
    </View>
  );
}

function AccountFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.accountFact}>
      <Text style={styles.accountFactLabel}>{label}</Text>
      <Text style={styles.accountFactValue} numberOfLines={1}>
        {value}
      </Text>
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
  return value.toLocaleString();
}

function formatProvider(provider: string | null): string {
  if (!provider) return 'Not signed in';
  if (provider === 'guest') return 'Guest';
  return provider.slice(0, 1).toUpperCase() + provider.slice(1);
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  heroPanel: {
    borderColor: colors.blueLight,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  heroCopy: {
    flex: 1,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.blueDeep,
  },
  heroTitle: {
    marginTop: spacing.xs,
    fontFamily: fonts.bold,
    fontSize: 25,
    lineHeight: 30,
    color: colors.ink,
  },
  heroText: {
    marginTop: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  instantBadge: {
    width: 108,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.soft,
  },
  instantIcon: {
    width: 34,
    height: 34,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: colors.green,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 34,
    color: colors.panel,
  },
  instantLabel: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.inkSoft,
  },
  sectionPanel: {
    overflow: 'hidden',
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.panelAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accountHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: 'rgba(108,92,231,0.1)',
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
  sectionIconFallback: {
    fontSize: 20,
    lineHeight: 24,
  },
  sectionHeadingCopy: {
    flex: 1,
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
    minHeight: 78,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    lineHeight: 18,
    color: colors.inkMuted,
  },
  controlSlot: {
    width: 272,
    alignItems: 'flex-end',
  },
  toggleSlot: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  controlSlotCompact: {
    width: '100%',
    alignItems: 'stretch',
  },
  togglePill: {
    minHeight: 46,
    minWidth: 112,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
  },
  togglePillActive: {
    borderColor: colors.blue,
    backgroundColor: 'rgba(127,214,245,0.22)',
  },
  toggleText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.inkMuted,
  },
  toggleTextActive: {
    color: colors.blueDeep,
  },
  optionScroller: {
    maxWidth: '100%',
  },
  optionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  optionPill: {
    minHeight: 38,
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
    shadowColor: colors.blueDeep,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 1,
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
    opacity: 0.55,
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
    minWidth: 112,
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
  accountBody: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  accountSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  accountSummaryCompact: {
    flexDirection: 'column',
  },
  accountFact: {
    flexGrow: 1,
    flexBasis: '48%',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  accountFactLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  accountFactValue: {
    marginTop: 3,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  accountActions: {
    gap: spacing.md,
  },
  supportBox: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    padding: spacing.md,
  },
  supportTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  supportText: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  footer: {
    marginTop: spacing.xs,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkMuted,
  },
});
