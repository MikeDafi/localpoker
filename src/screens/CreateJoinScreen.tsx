import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Share } from 'react-native';
import { showAlert } from '../components/alertBus';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { AdBanner } from '../components/AdBanner';
import { AnimatedPal } from '../components/AnimatedPal';
import { palFromSeed } from '../avatar/palConfig';
import { useApp } from '../state/AppContext';
import { isRoomCodeTaken, subscribeOpenRooms, getRoomListingInfo } from '../services/firebase/roomSync';
import { CODE_LENGTH, filterToCodeAlphabet, isRoomCodeShaped, makeAvailableRoomCode, makeRoomCode, normalizeRoomCode } from '../game/roomCode';
import type { RoomSummary } from '../services/firebase/types';
import { colors, fonts, radii, spacing } from '../theme/theme';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateJoin'>;

export function CreateJoinScreen({ navigation }: Props) {
  const { friends } = useApp();
  // Browsing for a table is the common arrival, hosting is the deliberate one.
  const [mode, setMode] = useState<'create' | 'join'>('join');
  const [joinCode, setJoinCode] = useState('');
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  // Shown immediately so hosting never waits on the network, then replaced if
  // the availability check finds that code already belongs to a live room.
  const [roomCode, setRoomCode] = useState(() => makeRoomCode(Crypto.getRandomBytes));
  useEffect(() => {
    let active = true;
    makeAvailableRoomCode(isRoomCodeTaken, Crypto.getRandomBytes)
      .then((free) => { if (active) setRoomCode(free); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  /*
   * Everyone, with whoever is online first.
   *
   * Filtering to online friends meant the list was usually empty and the
   * screen told you to come back later, when inviting someone who is away is
   * the normal case: they get a notification and join when they see it.
   */
  const invitableFriends = useMemo(
    () => [...friends].sort((a, b) => Number(!!b.online) - Number(!!a.online) || a.name.localeCompare(b.name)),
    [friends],
  );
  const [openRooms, setOpenRooms] = useState<{ friends: RoomSummary[]; public: RoomSummary[] }>({ friends: [], public: [] });

  useEffect(() => subscribeOpenRooms(setOpenRooms), []);

  /*
   * Who is already sitting at each listed table.
   *
   * Read from the rooms rather than the summaries: a summary is written by
   * the host and nobody refreshes it when a guest sits down, so its "1 seated"
   * was fixed at creation. Re-read whenever the set of listed codes changes,
   * which is also when someone joins or leaves one of them.
   */
  const [seats, setSeats] = useState<Record<string, { id: string; name: string; palSeed?: string; palJson?: string }[]>>({});
  /*
   * Adverts whose table is gone, started, or abandoned.
   *
   * The advert is written once by the host and never revisited, so it happily
   * outlives the room. One left over from an older build sat in Public tables
   * refusing everyone who tapped it, which is worse than not listing it.
   */
  const [dead, setDead] = useState<Record<string, true>>({});
  const listedCodes = useMemo(
    () => [...openRooms.friends, ...openRooms.public].map((r) => r.code).join(','),
    [openRooms],
  );
  useEffect(() => {
    let active = true;
    const codes = listedCodes ? listedCodes.split(',') : [];
    Promise.all(codes.map(async (code) => [code, await getRoomListingInfo(code)] as const))
      .then((pairs) => {
        if (!active) return;
        setSeats(Object.fromEntries(pairs.map(([code, info]) => [code, info.seats])));
        setDead(Object.fromEntries(pairs.filter(([, i]) => !i.joinable).map(([code]) => [code, true as const])));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [listedCodes]);

  const liveRooms = useMemo(() => ({
    friends: openRooms.friends.filter((r) => !dead[r.code]),
    public: openRooms.public.filter((r) => !dead[r.code]),
  }), [openRooms, dead]);

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
    if (!isRoomCodeShaped(joinCode)) {
      showAlert('Invalid code', `Enter the ${CODE_LENGTH} character room code your friend shared.`);
      return;
    }
    navigation.navigate('Lobby', { roomCode: normalizeRoomCode(joinCode), host: false });
  };

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="Play with Friends" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={styles.switch}>
          {(['create', 'join'] as const).map((m) => (
            /* Create Room goes straight to the setup screen. It used to open
               a page whose only job was to hold a green button that opened
               the setup screen, which is a tap and a screen to say nothing. */
            <Pressable key={m} onPress={() => { Haptics.selectionAsync(); if (m === 'create') startCreate(); else setMode(m); }} style={[styles.switchBtn, mode === m && styles.switchActive]}>
              <Text style={[styles.switchText, mode === m && styles.switchTextActive]}>{m === 'create' ? 'Create Room' : 'Join Room'}</Text>
            </Pressable>
          ))}
        </View>

        <>
          <WiiPanel padding={20}>
            <Text style={styles.label}>Enter room code</Text>
            <TextInput value={joinCode} onChangeText={(t) => setJoinCode(filterToCodeAlphabet(t))} autoCapitalize="characters" maxLength={CODE_LENGTH} placeholder="AB24" placeholderTextColor={colors.inkMuted} style={styles.codeInput} />
            <View style={{ height: spacing.md }} />
            <WiiButton label="Join Table" variant="blue" size="lg" fullWidth onPress={startJoin} />
            <Text style={styles.note}>Ask a friend for their room code.</Text>
          </WiiPanel>

            {/* Browsing sits under the code box: a code is the certain way in,
                the lists are for when you do not have one. Friends first,
                because a table with someone you know is the one you want. */}
            <RoomList
              title="Friends' tables"
              hint="Private tables your friends opened."
              rooms={liveRooms.friends}
              seats={seats}
              tone="friends"
              onJoin={joinListed}
              emptyText="No friends have a table open right now."
            />
            <RoomList
              title="Public tables"
              hint="Open to anyone."
              rooms={liveRooms.public}
              seats={seats}
              tone="public"
              onJoin={joinListed}
              emptyText="No public tables open right now."
            />
          </>
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
function RoomList({ title, hint, rooms, tone, onJoin, emptyText, seats }: {
  title: string;
  hint: string;
  rooms: RoomSummary[];
  tone: 'friends' | 'public';
  onJoin: (room: RoomSummary) => void;
  emptyText: string;
  seats: Record<string, { id: string; name: string; palSeed?: string; palJson?: string }[]>;
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
              {/* Faces, so you can see who is already there rather than
                  deciding from a host name and a blind level alone. */}
              {(seats[room.code] ?? []).length > 0 && (
                <View style={styles.seatFaces}>
                  {(seats[room.code] ?? []).slice(0, 3).map((p) => (
                    <View key={p.id} style={styles.seatFace}>
                      <AnimatedPal config={palFromSeed(p.palSeed || p.id)} size={26} alive />
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.note}>
                {`#${room.code} · ${room.smallBlind}/${room.bigBlind} · ${(seats[room.code] ?? []).length || room.playerCount} seated`}
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
  seatFaces: { flexDirection: 'row', marginTop: 6, marginBottom: 2 },
  seatFace: { marginRight: -8 },
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
  offlineDot: { backgroundColor: colors.offline },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.online },
  onlineText: { fontFamily: fonts.medium, fontSize: 12, color: colors.online },
});
