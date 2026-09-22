import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Share, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { AdBanner } from '../components/AdBanner';
import { AnimatedPal } from '../components/AnimatedPal';
import { palFromSeed } from '../avatar/palConfig';
import { useApp } from '../state/AppContext';
import { colors, fonts, radii, spacing } from '../theme/theme';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateJoin'>;

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function CreateJoinScreen({ navigation }: Props) {
  const { friends } = useApp();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [joinCode, setJoinCode] = useState('');
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  const roomCode = useMemo(() => makeCode(), []);
  const onlineFriends = useMemo(() => friends.filter((f) => f.online), [friends]);

  const share = async () => {
    try {
      await Share.share({ message: `Join my LocalPoker table! Room code: ${roomCode}` });
    } catch {}
  };

  const inviteFriend = async (id: string, name: string) => {
    Haptics.selectionAsync();
    setInvited((prev) => ({ ...prev, [id]: true }));
    try {
      await Share.share({ message: `${name}, join my LocalPoker table! Room code: ${roomCode}` });
    } catch {}
  };

  const startCreate = () => navigation.navigate('Lobby', { roomCode, host: true });
  const startJoin = () => {
    if (joinCode.trim().length < 4) {
      Alert.alert('Invalid code', 'Enter the 6-character room code your friend shared.');
      return;
    }
    navigation.navigate('Lobby', { roomCode: joinCode.trim().toUpperCase(), host: false });
  };

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="Play with Friends" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={styles.switch}>
          {(['create', 'join'] as const).map((m) => (
            <Pressable key={m} onPress={() => { Haptics.selectionAsync(); setMode(m); }} style={[styles.switchBtn, mode === m && styles.switchActive]}>
              <Text style={[styles.switchText, mode === m && styles.switchTextActive]}>{m === 'create' ? 'Create Room' : 'Join Room'}</Text>
            </Pressable>
          ))}
        </View>

        {mode === 'create' ? (
          <>
            <WiiPanel padding={20}>
              <Text style={styles.label}>Invite code</Text>
              <View style={styles.codeBox}><Text style={styles.code}>{roomCode}</Text></View>
              <WiiButton label="Share invite" variant="blue" size="md" fullWidth onPress={share} />
              <Text style={styles.note}>Share this code, then open the lobby. Real friends join here — no bots are added to friends games.</Text>
            </WiiPanel>
            <WiiButton label="Open Lobby →" variant="green" size="lg" fullWidth onPress={startCreate} />

            <WiiPanel padding={16}>
              <Text style={styles.suggestTitle}>Invite friends</Text>
              {onlineFriends.length === 0 ? (
                <Text style={styles.note}>
                  {friends.length === 0
                    ? 'Add friends first, then invite them here when they’re online.'
                    : 'No friends online right now. Share the code above to invite anyone.'}
                </Text>
              ) : (
                onlineFriends.map((f) => (
                  <View key={f.id} style={styles.friendRow}>
                    <AnimatedPal config={palFromSeed(f.palSeed || f.id)} size={36} alive />
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <Text style={styles.friendName} numberOfLines={1}>{f.name}</Text>
                      <View style={styles.onlineRow}>
                        <View style={styles.onlineDot} />
                        <Text style={styles.onlineText}>Online</Text>
                      </View>
                    </View>
                    <WiiButton
                      label={invited[f.id] ? 'Invited' : 'Invite'}
                      variant={invited[f.id] ? 'white' : 'blue'}
                      size="sm"
                      disabled={invited[f.id]}
                      onPress={() => inviteFriend(f.id, f.name)}
                    />
                  </View>
                ))
              )}
            </WiiPanel>
          </>
        ) : (
          <WiiPanel padding={20}>
            <Text style={styles.label}>Enter room code</Text>
            <TextInput value={joinCode} onChangeText={(t) => setJoinCode(t.toUpperCase())} autoCapitalize="characters" maxLength={6} placeholder="ABC123" placeholderTextColor={colors.inkMuted} style={styles.codeInput} />
            <View style={{ height: spacing.md }} />
            <WiiButton label="Join Table" variant="blue" size="lg" fullWidth onPress={startJoin} />
            <Text style={styles.note}>Ask a friend for their 6-character code.</Text>
          </WiiPanel>
        )}
        <AdBanner />
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: 'row', backgroundColor: '#DCE7EE', borderRadius: radii.pill, padding: 4 },
  switchBtn: { flex: 1, paddingVertical: 10, borderRadius: radii.pill, alignItems: 'center' },
  switchActive: { backgroundColor: colors.panel },
  switchText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.inkMuted },
  switchTextActive: { color: colors.blueDeep },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft, marginBottom: 8 },
  codeBox: { backgroundColor: colors.panelAlt, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 16, alignItems: 'center', marginBottom: spacing.md },
  code: { fontFamily: fonts.bold, fontSize: 34, letterSpacing: 6, color: colors.blueDeep },
  codeInput: { backgroundColor: colors.panelAlt, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 16, textAlign: 'center', fontFamily: fonts.bold, fontSize: 30, letterSpacing: 6, color: colors.blueDeep },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted, marginTop: spacing.md, textAlign: 'center', lineHeight: 17 },
  suggestTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink, marginBottom: spacing.sm },
  friendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.panelAlt },
  friendName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.online },
  onlineText: { fontFamily: fonts.medium, fontSize: 12, color: colors.online },
});
