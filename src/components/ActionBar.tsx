import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { WiiButton } from './WiiButton';
import { roundWager, WAGER_STEP } from '../game/wager';
import { colors, fonts, radii, spacing, numeric } from '../theme/theme';
import type { LegalActions, PlayerAction } from '../engine';

export interface ActionBarProps {
  legal: LegalActions;
  potSize: number;
  step?: number;
  onAction: (action: PlayerAction, amount?: number) => void;
}

export function ActionBar({ legal, potSize, step, onAction }: ActionBarProps) {
  const isRaise = legal.actions.includes('raise');
  const isBet = legal.actions.includes('bet');
  const sizingAvailable = isRaise || isBet;

  const min = isRaise ? legal.minRaiseTo ?? 0 : legal.minBet ?? 0;
  const max = isRaise ? legal.maxRaiseTo ?? 0 : legal.maxBet ?? 0;
  // Fine increment for the +/- stepper: the big blind, so you can pick amounts
  // between min and max (e.g. 40, 60, 80) instead of jumping by the min-raise.
  const inc = Math.max(WAGER_STEP, step ?? legal.minBet ?? WAGER_STEP);

  const [amount, setAmount] = useState(() => roundWager(min, min, max));

  useEffect(() => {
    setAmount(roundWager(min, min, max));
  }, [min, max]);

  // Every wager is a round number of chips (see roundWager): the stepper, the
  // quick tiers and the committed amount all go through the same rule, so the
  // displayed figure and the amount actually sent can never disagree.
  const clamp = (v: number) => roundWager(v, min, max);

  // Approximate sizing tiers, always clamped to the legal [min, max] range.
  const quick = [
    { label: 'Min', value: clamp(min) },
    { label: '½ Pot', value: clamp(min + Math.floor(potSize * 0.5)) },
    { label: 'Pot', value: clamp(min + potSize) },
    { label: 'Max', value: max },
  ];

  const commitSizing = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAction(isRaise ? 'raise' : 'bet', clamp(amount));
  };

  return (
    <View style={styles.wrap}>
      {sizingAvailable && (
        <View style={styles.sizer}>
          <View style={styles.quickRow}>
            {quick.map((q) => (
              <Pressable
                key={q.label}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAmount(clamp(q.value));
                }}
                style={[styles.quickPill, amount === clamp(q.value) && styles.quickActive]}
              >
                <Text style={[styles.quickText, amount === clamp(q.value) && styles.quickTextActive]}>{q.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.stepRow}>
            <Stepper label="−" onPress={() => setAmount((a) => clamp(a - inc))} />
            <View style={styles.amountBox}>
              <Text style={styles.amountText}>{clamp(amount).toLocaleString()}</Text>
            </View>
            <Stepper label="+" onPress={() => setAmount((a) => clamp(a + inc))} />
          </View>
        </View>
      )}

      <View style={styles.actions}>
        {legal.actions.includes('fold') && (
          <WiiButton label="Fold" variant="red" size="md" onPress={() => onAction('fold')} style={styles.flex} />
        )}
        {legal.actions.includes('check') && (
          <WiiButton label="Check" variant="green" size="md" onPress={() => onAction('check')} style={styles.flex} />
        )}
        {legal.actions.includes('call') && (
          <WiiButton
            label={`Call ${legal.toCall.toLocaleString()}`}
            variant="green"
            size="md"
            onPress={() => onAction('call')}
            style={styles.flex}
          />
        )}
        {sizingAvailable ? (
          <WiiButton
            label={`${isRaise ? 'Raise to' : 'Bet'} ${clamp(amount).toLocaleString()}`}
            variant="blue"
            size="md"
            onPress={commitSizing}
            style={styles.flex2}
          />
        ) : (
          legal.actions.includes('allin') && (
            <WiiButton label="All In" variant="gold" size="md" onPress={() => onAction('allin')} style={styles.flex} />
          )
        )}
      </View>
    </View>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={styles.stepper}
    >
      <Text style={styles.stepperText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  sizer: {
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quickPill: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  quickText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.onDarkSoft, textAlign: 'center' },
  quickTextActive: { color: '#fff' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stepper: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: { fontFamily: fonts.bold, fontSize: 22, color: colors.onDark, marginTop: -2 },
  amountBox: {
    minWidth: 120,
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountText: { fontFamily: fonts.bold, fontSize: 20, color: colors.onDark, ...numeric },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  flex: { flex: 1, minHeight: 44 },
  flex2: { flex: 1.4, minHeight: 44 },
});
