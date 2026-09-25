import React, { useEffect, useMemo, useState } from 'react';
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
import { subscribeOpenRooms } from '../services/firebase/roomSync';
import type { RoomSummary } from '../services/firebase/types';
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
  // Browsing for a table is the common arrival, hosting is the deliberate one.
  const [mode, setMode] = useState<'create' | 'join'>('join');
  const [joinCode, setJoinCode] = useState('');
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  const roomCode = useMemo(() => makeCode(), []);
  const onlineFriends = useMemo(() => friends.filter((f) => f.online), [friends]);
  const [openRooms, setOpenRooms] = useState<{ friends: RoomSummary[]; public: RoomSummary[] }>({ friends: [], public: [] });

  useEffect(() => subscribeOpenRooms(setOpenRooms), []);

  const joinListed = (summary: RoomSummary) => {
    Haptics.selectionAsync();
    navigation.navigate('Lobby', { roomCode: summary.code, host: false });
  };

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

  const startCreate = () => navigation.navigate('GameSetup', { mode: 'friends', roomCode });
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
              <Text style={styles.note}>Share this code, then open the lobby. Real friends join here, no bots are added to friends games.</Text>
            </WiiPanel>
            <WiiButton label="Set up table →" variant="green" size="lg" fullWidth onPress={startCreate} />

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
          <>
          <WiiPanel padding={20}>
            <Text style={styles.label}>Enter room code</Text>
            <TextInput value={joinCode} onChangeText={(t) => setJoinCode(t.toUpperCase())} autoCapitalize="characters" maxLength={6} placeholder="ABC123" placeholderTextColor={colors.inkMuted} style={styles.codeInput} />
            <View style={{ height: spacing.md }} />
            <WiiButton label="Join Table" variant="blue" size="lg" fullWidth onPress={startJoin} />
            <Text style={styles.note}>Ask a friend for their 6-character code.</Text>
          </WiiPanel>

            {/* Browsing sits under the code box: a code is the certain way in,
                the lists are for when you do not have one. Friends first,
                because a table with someone you know is the one you want. */}
            <RoomList
              title="Friends' tables"
              hint="Private tables your friends opened."
              rooms={openRooms.friends}
              tone="friends"
              onJoin={joinListed}
              emptyText="No friends have a table open right now."
            />
            <RoomList
              title="Public tables"
              hint="Open to anyone."
              rooms={openRooms.public}
              tone="public"
              onJoin={joinListed}
              emptyText="No public tables open right now."
            />
          </>
        )}
        <AdBanner />
      </ScrollView>
    </ScreenBackground>
  );
}

/**
 * One browsable group of tables.
 *
 * Friends and public tables are the same data and must not look the same: the
 * whole point of ordering them is that you can tell at a glance which is which,
 * so the two differ by accent colour and by a badge rather than by position
 * alone.
 */
function RoomList({ title, hint, rooms, tone, onJoin, emptyText }: {
  title: string;
  hint: string;
  rooms: RoomSummary[];
  tone: 'friends' | 'public';
  onJoin: (room: RoomSummary) => void;
  emptyText: string;
}) {
  const accent = tone === 'friends' ? colors.blue : colors.felt;
  return (
    <WiiPanel padding={16}>
      <View style={styles.listHead}>
        <View style={[styles.listDot, { backgroundColor: accent }]} />
        <Text style={styles.suggestTitle}>{title}</Text>
        <Text style={styles.listCount}>{rooms.length}</Text>
      </View>
      <Text style={styles.note}>{hint}</Text>
      {rooms.length === 0 ? (
        <Text style={styles.note}>{emptyText}</Text>
      ) : (
        rooms.map((room) => (
          <View key={room.code} style={[styles.roomRow, { borderLeftColor: accent }]}>
            <View style={{ flex: 1 }}>
              <View style={styles.roomTitleRow}>
                <Text style={styles.friendName} numberOfLines={1}>{room.hostName || 'Someone'}</Text>
                <View style={[styles.roomBadge, { backgroundColor: accent }]}>
                  <Text style={styles.roomBadgeText}>{tone === 'friends' ? 'FRIEND' : 'PUBLIC'}</Text>
                </View>
              </View>
              <Text style={styles.note}>
                {`#${room.code} · ${room.smallBlind}/${room.bigBlind} · ${room.playerCount} seated`}
              </Text>
            </View>
            <WiiButton label="Join" variant="blue" size="sm" onPress={() => onJoin(room)} />
          </View>
        ))
      )}
    </WiiPanel>
  );
}

const styles = StyleSheet.create({
  listHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  listDot: { width: 10, height: 10, borderRadius: 5 },
  listCount: { marginLeft: 'auto', fontFamily: fonts.bold, fontSize: 13, color: colors.inkMuted },
  roomRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, paddingLeft: spacing.md,
    borderLeftWidth: 3, marginTop: spacing.sm,
  },
  roomTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  roomBadge: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  roomBadgeText: { fontFamily: fonts.bold, fontSize: 9, color: '#fff', letterSpacing: 0.6 },
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
