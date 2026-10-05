import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { SettingField } from '../game/settings';
import { colors, fonts, radii, spacing } from '../theme/theme';
import { offeredNumberValues } from './settingNumberOptions';

type NumberValueFormatter = (field: SettingField, value: number) => string;

type Props = {
  field: SettingField;
  value: number;
  onChange: (value: number) => void;
  formatValue?: NumberValueFormatter;
  style?: StyleProp<ViewStyle>;
};

export function SettingNumberChooser({
  field,
  value,
  onChange,
  formatValue = defaultFormatValue,
  style,
}: Props) {
  const values = useMemo(() => offeredNumberValues(field, value), [field, value]);

  return (
    <ScrollView
      horizontal
      directionalLockEnabled
      nestedScrollEnabled
      alwaysBounceVertical={false}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={[styles.scroller, style]}
      contentContainerStyle={styles.row}
    >
      {values.map((option) => {
        const selected = option === value;
        const label = formatValue(field, option);
        return (
          <Pressable
            key={`${String(field.key)}-${option}`}
            onPress={() => onChange(option)}
            style={[styles.pill, selected && styles.pillSelected]}
            accessibilityRole="button"
            accessibilityLabel={`${field.label}: ${label}`}
            accessibilityState={{ selected }}
          >
            <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function defaultFormatValue(_field: SettingField, value: number): string {
  return value.toLocaleString();
}

const styles = StyleSheet.create({
  scroller: {
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pill: {
    minHeight: 38,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillSelected: {
    backgroundColor: colors.blue,
    borderColor: colors.blueDeep,
    shadowColor: colors.blueDeep,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 1,
  },
  pillText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  pillTextSelected: {
    color: colors.onBlue,
  },
});
