import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { AnimatedPal } from '../components/AnimatedPal';
import { CoinIcon } from '../components/Icons';
import { AdBanner } from '../components/AdBanner';
import { colors, fonts, spacing, radii } from '../theme/theme';
import { useApp, derivedStats } from '../state/AppContext';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const { profile, stats, updateProfile, logout } = useApp();
  const [name, setName] = useState(profile.name);
  const d = derivedStats(stats);
  const saveName = () => {
    const result = updateProfile({ name: name.trim() || profile.name });
    if (!result.ok) {
      Alert.alert('Choose another name', result.reason || 'That name cannot be used.');
      setName(profile.name);
    }
  };

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <WiiPanel padding={20}>
          <View style={{ alignItems: 'center' }}>
            <AnimatedPal config={profile.pal} size={120} ring />
            <View style={{ height: spacing.md }} />
            <WiiButton label="Customize Pal" variant="blue" size="md" onPress={() => navigation.navigate('PalDesigner')} />
          </View>

          <View style={{ height: spacing.lg }} />
          <Text style={styles.label}>Name</Text>
          <View style={styles.nameRow}>
            <TextInput value={name} onChangeText={setName} onBlur={saveName} autoCapitalize="none" autoCorrect={false} placeholder="your_name" placeholderTextColor={colors.inkMuted} maxLength={20} style={styles.input} />
            <WiiButton label="Save" variant="green" size="sm" onPress={saveName} />
          </View>
          <Text style={styles.hint}>This is how friends find you. Letters, numbers, and underscores, 3 to 20 characters.</Text>

          <View style={styles.coinRow}>
            <CoinIcon size={22} />
            <Text style={styles.coins}>{profile.coins.toLocaleString()} coins</Text>
          </View>
        </WiiPanel>

        <WiiPanel>
          <Text style={styles.section}>Lifetime</Text>
          <View style={styles.statGrid}>
            <Stat label="Hands" value={stats.handsPlayed} />
            <Stat label="Wins" value={stats.handsWon} />
            <Stat label="Win rate" value={`${d.winRate}%`} />
            <Stat label="Biggest pot" value={stats.biggestPotWon.toLocaleString()} />
            <Stat label="Coins earned" value={stats.coinsEarned.toLocaleString()} />
            <Stat label="Net chips" value={(stats.netChips >= 0 ? '+' : '') + stats.netChips.toLocaleString()} />
          </View>
          <View style={{ height: spacing.md }} />
          <WiiButton label="View full stats" variant="white" size="md" fullWidth onPress={() => navigation.navigate('Stats')} />
        </WiiPanel>

        <WiiButton label="Log out" variant="red" size="md" fullWidth onPress={logout} />
        <AdBanner />
      </ScrollView>
    </ScreenBackground>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft, marginBottom: 6 },
  hint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.inkMuted, marginTop: 8 },
  section: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink, marginBottom: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { flex: 1, height: 48, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelAlt, paddingHorizontal: 14, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  coinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.lg },
  coins: { fontFamily: fonts.bold, fontSize: 18, color: colors.goldDeep },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '33.33%', paddingVertical: spacing.sm, alignItems: 'center' },
  statValue: { fontFamily: fonts.bold, fontSize: 19, color: colors.blueDeep },
  statLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
});
