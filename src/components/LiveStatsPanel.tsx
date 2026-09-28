import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { FadeIn, SlideInDown, Easing } from 'react-native-reanimated';
import { colors, fonts, radii, shadows, spacing, type, numeric, motion, easings } from '../theme/theme';
import { useApp, derivedStats } from '../state/AppContext';
import { InfoDot, InfoNote } from './InfoDot';
import { LIVE_STAT_KEYS, OPPONENT_STAT_KEYS, STAT_HELP, statHelpText, type StatKey } from '../game/statHelp';
import { observedStats, emptyCounters, type ObservedTable, type ObservedCounters } from '../game/observedStats';

export interface LiveStatsOpponent {
  id: string;
  name: string;
}

export interface LiveStatsPanelProps {
  visible: boolean;
  onClose: () => void;
  sessionHands: number;
  handHint?: string | null;
  winProbability?: number | null;
  /** Everyone else at the table, in seat order. */
  opponents?: LiveStatsOpponent[];
  /** What this table has been seen to do. */
  observed?: ObservedTable;
  /** What these players did at previous tables, keyed the same way. */
  history?: Record<string, ObservedCounters>;
  /** Open straight onto this player, set by tapping their seat. */
  focusPlayerId?: string | null;
}

/** 'you', or an opponent id. One tab per person, rather than one shared list. */
type Tab = string;
/** Within an opponent, this table or everything before it. */
type Span = 'current' | 'previous';

/**
 * The in-game stats sheet.
 *
 * Every figure carries an ⓘ, because a poker stat is jargon until someone
 * explains it and an unexplained number invites the wrong conclusion. The rows
 * are generated from the keys in `statHelp`, so a stat cannot be added to this
 * sheet without its explanation coming along with it.
 */
export function LiveStatsPanel({
  visible,
  onClose,
  sessionHands,
  handHint,
  winProbability,
  opponents = [],
  observed,
  history = {},
  focusPlayerId = null,
}: LiveStatsPanelProps) {
  const { stats } = useApp();
  const d = derivedStats(stats);
  const [tab, setTab] = useState<Tab>('you');
  const [span, setSpan] = useState<Span>('current');

  /*
   * Tapping a seat should land on that player, not on a list to pick them from
   * again. The panel is unmounted while hidden, so following the focus on each
   * open is enough and no effect is needed.
   */
  const wantedTab = focusPlayerId && opponents.some((o) => o.id === focusPlayerId) ? focusPlayerId : null;
  const activeTab = wantedTab && tab === 'you' ? wantedTab : tab;
  // Only one explanation is open at a time: several at once turns a compact
  // list of numbers into a wall of prose.
  const [openHelp, setOpenHelp] = useState<string | null>(null);

  if (!visible) return null;

  const valueFor = (key: StatKey): { value: string; color?: string } => {
    switch (key) {
      case 'vpip': return { value: `${d.vpip}%` };
      case 'pfr': return { value: `${d.pfr}%` };
      case 'af': return { value: `${d.aggression}` };
      // Restrained palette: figures stay neutral; only win rate carries a
      // semantic colour, so nothing competes for attention.
      case 'winRate': return { value: `${d.winRate}%`, color: colors.green };
      case 'showdownWin': return { value: `${d.showdownWinRate}%` };
      case 'handsLifetime': return { value: `${stats.handsPlayed}` };
      case 'handsSession': return { value: `${sessionHands}` };
      case 'netChips':
        return { value: `${stats.netChips >= 0 ? '+' : ''}${stats.netChips.toLocaleString()}` };
      default: return { value: '-' };
    }
  };

  const toggle = (id: string) => setOpenHelp((cur) => (cur === id ? null : id));
  const fmt = (v: number | null, suffix = '%') => (v == null ? '-' : v === Infinity ? '∞' : `${v}${suffix}`);

  return (
    <Animated.View entering={FadeIn.duration(motion.fast)} style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View entering={SlideInDown.duration(motion.base).easing(Easing.bezier(...easings.out))} style={[styles.sheet, shadows.raised]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Live Stats</Text>

        {opponents.length > 0 && (
          /* One tab per person. A single shared "Opponents" list meant reading
             three players' numbers stacked together and working out which
             column belonged to whom, which is exactly the comparison a HUD is
             supposed to do for you. Scrolls, because a full table does not
             fit across the sheet. */
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {[{ id: 'you', name: 'You' }, ...opponents].map((t) => (
              <Pressable
                key={t.id}
                onPress={() => { setTab(t.id); setOpenHelp(null); }}
                accessibilityRole="button"
                accessibilityState={{ selected: activeTab === t.id }}
                style={[styles.tab, activeTab === t.id && styles.tabActive]}
              >
                <Text numberOfLines={1} style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>
                  {t.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {activeTab === 'you' && winProbability != null && (
          <>
            <View style={styles.hintRow}>
              <View style={[styles.hintPill, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.surfaceBorder }]}>
                <View style={styles.hintHead}>
                  <Text style={styles.hintLabel}>{STAT_HELP.winChance.label}</Text>
                  <InfoDot label={STAT_HELP.winChance.label} open={openHelp === 'winChance'} onPress={() => toggle('winChance')} />
                </View>
                <Text style={[styles.hintValue, { color: colors.green }]}>{Math.round(winProbability * 100)}%</Text>
              </View>
            </View>
            {openHelp === 'winChance' && <InfoNote>{statHelpText('winChance')}</InfoNote>}
          </>
        )}
        {activeTab === 'you' && handHint ? <Text style={styles.blurb}>{handHint}</Text> : null}

        <ScrollView style={{ maxHeight: 340 }}>
          {activeTab === 'you' ? (
            LIVE_STAT_KEYS.map((key) => {
              const { value, color } = valueFor(key);
              return (
                <View key={key}>
                  <View style={styles.row}>
                    <View style={styles.rowLabelWrap}>
                      <Text style={styles.rowLabel}>{STAT_HELP[key].label}</Text>
                      <InfoDot label={STAT_HELP[key].label} open={openHelp === key} onPress={() => toggle(key)} />
                    </View>
                    <Text style={[styles.rowValue, color ? { color } : null]}>{value}</Text>
                  </View>
                  {openHelp === key && <InfoNote>{statHelpText(key)}</InfoNote>}
                </View>
              );
            })
          ) : (
            (() => {
              const who = opponents.find((o) => o.id === activeTab);
              if (!who) return null;
              const live = observed?.counters[who.id] ?? emptyCounters();
              const past: ObservedCounters = history[who.id] ?? emptyCounters();
              const s = observedStats(span === 'current' ? live : past);
              return (
                <View style={styles.oppCard}>
                  {/* This table or every table before it. Both are earned by
                      watching, so neither can be faked, but they answer
                      different questions: whether someone has changed gear
                      tonight, and what they are like generally. */}
                  <View style={styles.spanTabs}>
                    {(['current', 'previous'] as Span[]).map((sp) => (
                      <Pressable
                        key={sp}
                        onPress={() => { setSpan(sp); setOpenHelp(null); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: span === sp }}
                        style={[styles.spanTab, span === sp && styles.spanTabActive]}
                      >
                        <Text style={[styles.spanText, span === sp && styles.spanTextActive]}>
                          {sp === 'current' ? 'This game' : 'Previous'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.oppHands}>
                    {s.handsSeen === 0
                      ? span === 'current' ? 'No hands seen yet' : 'You have not played them before'
                      : `${s.handsSeen} hand${s.handsSeen === 1 ? '' : 's'} seen${s.handsSeen < 20 ? ', still a small sample' : ''}`}
                  </Text>
                  <View style={styles.oppGrid}>
                    {OPPONENT_STAT_KEYS.map((key) => {
                      const value =
                        key === 'vpip' ? fmt(s.vpip)
                        : key === 'pfr' ? fmt(s.pfr)
                        : key === 'af' ? fmt(s.af, '')
                        : key === 'winRate' ? fmt(s.winRate)
                        : key === 'showdownWin' ? fmt(s.showdownWinRate)
                        : `${s.handsSeen}`;
                      const helpId = `opp:${key}`;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => toggle(helpId)}
                          accessibilityRole="button"
                          accessibilityLabel={`${STAT_HELP[key].label}: ${value}. Tap for what this means.`}
                          style={styles.oppCell}
                        >
                          <Text style={styles.oppValue}>{value}</Text>
                          <View style={styles.oppCellLabel}>
                            <Text style={styles.oppLabel}>
                              {key === 'handsLifetime' ? 'Hands' : STAT_HELP[key].label}
                            </Text>
                            <InfoDot
                              label={STAT_HELP[key].label}
                              open={openHelp === helpId}
                              onPress={() => toggle(helpId)}
                            />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                  {OPPONENT_STAT_KEYS.filter((k) => openHelp === `opp:${k}`).map((k) => (
                    <InfoNote key={k}>{statHelpText(k)}</InfoNote>
                  ))}
                </View>
              );
            })()
          )}
        </ScrollView>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim, justifyContent: 'flex-end', zIndex: 50 },
  sheet: { backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.surfaceBorder, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.lg, paddingBottom: spacing.xl },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: colors.surfaceBorderStrong, marginBottom: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.onDark, marginBottom: spacing.md },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, paddingRight: spacing.sm },
  spanTabs: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  spanTab: { flex: 1, paddingVertical: 6, borderRadius: radii.pill, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceBorder },
  spanTabActive: { backgroundColor: colors.surfaceBorderStrong, borderColor: colors.blueLight },
  spanText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onDarkSoft },
  spanTextActive: { color: colors.onDark },
  tab: { minWidth: 92, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, alignItems: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.surfaceBorder },
  tabActive: { backgroundColor: colors.blue, borderColor: colors.blueLight },
  tabText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.onDarkSoft },
  tabTextActive: { color: colors.onBlue },
  hintRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  hintPill: { flex: 1, borderRadius: radii.md, padding: spacing.md, alignItems: 'center' },
  hintHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hintLabel: { ...type.label, color: colors.onDarkMuted },
  hintValue: { fontFamily: fonts.bold, fontSize: 16, marginTop: 2, ...numeric },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  rowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.onDarkSoft },
  rowValue: { fontFamily: fonts.bold, fontSize: 15, color: colors.onDark, ...numeric },
  blurb: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: colors.onDarkMuted, marginBottom: spacing.md },
  oppCard: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  oppHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  oppName: { fontFamily: fonts.bold, fontSize: 15, color: colors.onDark },
  oppRead: { fontFamily: fonts.semibold, fontSize: 11, color: colors.blueLight },
  oppHands: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.onDarkMuted, marginTop: 2 },
  oppGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  oppCell: { width: '33.33%', paddingVertical: 6, alignItems: 'center' },
  oppCellLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  oppValue: { fontFamily: fonts.bold, fontSize: 16, color: colors.onDark, ...numeric },
  oppLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.onDarkMuted },
  closeBtn: { marginTop: spacing.md, alignSelf: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  closeText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.blueLight },
});
