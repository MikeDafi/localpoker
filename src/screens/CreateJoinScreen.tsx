import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
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
import { CoachMark, useCoachTarget } from '../components/CoachMark';
import { useTutorialFlow } from '../components/useTutorialFlow';
import { TUTORIAL_COPY, TUTORIAL_SAMPLE_ROOMS, TUTORIAL_SAMPLE_SEATS } from '../game/tutorial';
import { palFromJson, palFromSeed } from '../avatar/palConfig';
import { isRoomCodeTaken, subscribeOpenRooms, getRoomListingInfo } from '../services/firebase/roomSync';
import { CODE_LENGTH, filterToCodeAlphabet, isRoomCodeShaped, makeAvailableRoomCode, makeRoomCode, normalizeRoomCode } from '../game/roomCode';
import type { RoomSummary } from '../services/firebase/types';
import { colors, fonts, radii, spacing } from '../theme/theme';
import { GAME_MODE_LABELS } from '../game/gameMode';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateJoin'>;

export function CreateJoinScreen({ navigation }: Props) {
  /*
   * In the tutorial's last step the friends list shows sample tables, so a
   * new player sees what a friend's open game looks like before they have a
   * friend. Swapped in at render and nowhere else: the samples are never
   * fetched for, joined or written, and the real lists come back the moment
   * the step ends.
   */
  const tutorial = useTutorialFlow();
  const coaching = tutorial.step === 'join';
  const listTarget = useCoachTarget(coaching);
  // Browsing for a table is the common arrival, hosting is the deliberate one.
  const [mode, setMode] = useState<'create' | 'join'>('join');
  const [joinCode, setJoinCode] = useState('');
  // Shown immediately so hosting never waits on the network, then replaced if
  // the availability check finds that code already belongs to a live room.
  const [roomCode, setRoomCode] = useState(() => makeRoomCode(Crypto.getRandomBytes));
  // Read from inside the open-rooms listener, which is subscribed once.
  const roomCodeRef = useRef(roomCode);
  roomCodeRef.current = roomCode;
  const coachingRef = useRef(coaching);
  coachingRef.current = coaching;
  useEffect(() => {
    let active = true;
    makeAvailableRoomCode(isRoomCodeTaken, Crypto.getRandomBytes)
      .then((free) => { if (active) setRoomCode(free); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const [openRooms, setOpenRooms] = useState<{ friends: RoomSummary[]; public: RoomSummary[] }>({ friends: [], public: [] });

  /*
   * Nothing to join: go straight to creating one.
   *
   * Decided on the first list the server sends, not on the empty list this
   * screen starts with, or everyone would be sent on before the tables had a
   * chance to load. Pushed rather than replaced, so Back still lands on the
   * code box: a friend's private table is only listed to their friends, and a
   * code is how everyone else gets in. Once per visit, so coming Back does
   * not bounce you forward again.
   */
  const autoCreated = useRef(false);
  useEffect(() => subscribeOpenRooms((rooms) => {
    setOpenRooms(rooms);
    if (autoCreated.current) return;
    autoCreated.current = true;
    if (!coachingRef.current && rooms.friends.length === 0 && rooms.public.length === 0) {
      navigation.navigate('GameSetup', { mode: 'friends', roomCode: roomCodeRef.current });
    }
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (coaching) {
      showAlert('Sample table', `${summary.hostName.replace('Sample: ', '')}'s table is only a sample. A real one takes you to its lobby, where you wait for the host to deal.`);
      return;
    }
    navigation.navigate('Lobby', { roomCode: summary.code, host: false });
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
          </WiiPanel>

            {/* Browsing sits under the code box: a code is the certain way in,
                the lists are for when you do not have one. Friends first,
                because a table with someone you know is the one you want. */}
            <View {...listTarget.props}>
            <RoomList
              title="Friends' tables"
              hint={coaching ? 'Sample tables, for the tutorial only.' : undefined}
              rooms={coaching ? TUTORIAL_SAMPLE_ROOMS : liveRooms.friends}
              seats={coaching ? TUTORIAL_SAMPLE_SEATS : seats}
              tone="friends"
              sample={coaching}
              onJoin={joinListed}
              emptyText="No friends have a table open right now."
            />
            </View>
            <RoomList
              title="Public tables"
              rooms={liveRooms.public}
              seats={seats}
              tone="public"
              onJoin={joinListed}
              emptyText="No public tables open right now."
            />
          </>
        <AdBanner />
      </ScrollView>
      {coaching ? (
        <CoachMark
          title={TUTORIAL_COPY.join.title}
          body={TUTORIAL_COPY.join.body}
          target={listTarget.rect}
          nextLabel={TUTORIAL_COPY.join.next}
          onNext={tutorial.next}
          onSkip={tutorial.skip}
        />
      ) : null}
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
function RoomList({ title, hint, rooms, tone, onJoin, emptyText, seats, sample }: {
  title: string;
  /** Optional: "Public tables" says enough on its own. */
  hint?: string;
  rooms: readonly RoomSummary[];
  tone: 'friends' | 'public';
  /** Badge the rows as samples, so a tutorial table is never mistaken for a real one. */
  sample?: boolean;
  onJoin: (room: RoomSummary) => void;
  emptyText: string;
  seats: Readonly<Record<string, readonly { id: string; name: string; palSeed?: string; palJson?: string }[]>>;
}) {
  const accent = tone === 'friends' ? colors.blue : colors.felt;
  return (
    <WiiPanel padding={16}>
      <View style={styles.listHead}>
        <View style={[styles.listDot, { backgroundColor: accent }]} />
        <Text style={styles.suggestTitle}>{title}</Text>
        <Text style={styles.listCount}>{rooms.length}</Text>
      </View>
      {hint ? <Text style={styles.note}>{hint}</Text> : null}
      {rooms.length === 0 ? (
        <Text style={styles.note}>{emptyText}</Text>
      ) : (
        rooms.map((room) => {
          const seated = seats[room.code] ?? [];
          // The host leads the card. Everyone else is a small row of faces,
          // so who is hosting reads first and the crowd reads second.
          const host = seated.find((p) => p.id === room.hostUid) ?? seated[0];
          const others = seated.filter((p) => p !== host);
          const hostName = room.hostName || 'Someone';
          return (
            /*
             * The whole card is the target, not only the button. A row of
             * plain text with a small pill at the end read as a label, and
             * people tapped the name and got nothing.
             */
            <Pressable
              key={room.code}
              onPress={() => onJoin(room)}
              accessibilityRole="button"
              accessibilityLabel={`Join ${hostName}'s table`}
              style={({ pressed }) => [styles.roomCard, { borderLeftColor: accent }, pressed && styles.roomCardPressed]}
            >
              <View style={[styles.hostRing, { borderColor: accent }]}>
                {host ? (
                  <AnimatedPal config={seatPal(host)} size={46} alive />
                ) : (
                  // Seats are still loading. A seeded stand-in here would
                  // flash a stranger's face and then swap, so hold an initial.
                  <Text style={styles.hostInitial}>{hostName.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.roomBody}>
                <View style={styles.roomTitleRow}>
                  <Text style={styles.roomHost} numberOfLines={1}>{hostName}</Text>
                  <View style={[styles.roomBadge, { backgroundColor: accent }]}>
                    <Text style={styles.roomBadgeText}>{sample ? 'SAMPLE' : tone === 'friends' ? 'FRIEND' : 'PUBLIC'}</Text>
                  </View>
                </View>
                <Text style={styles.roomMeta} numberOfLines={1}>
                  {[
                    // Every table is the same game, but nothing said which.
                    "Hold'em",
                    // A missing mode means the room was published by an older
                    // build, so say nothing rather than guess at cash.
                    room.gameMode ? GAME_MODE_LABELS[room.gameMode] : null,
                    `Blinds ${room.smallBlind}/${room.bigBlind}`,
                  ].filter(Boolean).join(' · ')}
                </Text>
                {/* The faces are the count, so no "3 seated" beside them.
                    Five fit beside the host, and past that a number carries
                    the overflow. */}
                <View style={styles.roomFoot}>
                  {others.slice(0, 5).map((p) => (
                    <View key={p.id} style={styles.seatFace}>
                      <AnimatedPal config={seatPal(p)} size={22} alive />
                    </View>
                  ))}
                  {others.length > 5 && <Text style={styles.seatOverflow}>{`+${others.length - 5}`}</Text>}
                  <Text style={styles.roomCode}>{`#${room.code}`}</Text>
                </View>
              </View>
              <WiiButton label="Join" variant="blue" size="sm" onPress={() => onJoin(room)} />
            </Pressable>
          );
        })
      )}
    </WiiPanel>
  );
}

/**
 * The face a seated player chose, falling back to their seeded one.
 *
 * The seats already carry each player's saved Pal. Drawing only from the seed
 * showed a stranger's face in place of the one they built.
 */
const seatPal = (p: { id: string; palSeed?: string; palJson?: string }) =>
  palFromJson(p.palJson) ?? palFromSeed(p.palSeed || p.id);

const styles = StyleSheet.create({
  listHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  listDot: { width: 10, height: 10, borderRadius: 5 },
  listCount: { marginLeft: 'auto', fontFamily: fonts.bold, fontSize: 13, color: colors.inkMuted },
  roomCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginTop: spacing.md, padding: spacing.md,
    backgroundColor: colors.panelAlt, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4,
  },
  roomCardPressed: { transform: [{ scale: 0.98 }], backgroundColor: '#E6F1F8' },
  hostRing: {
    width: 54, height: 54, borderRadius: 27, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel,
  },
  hostInitial: { fontFamily: fonts.bold, fontSize: 20, color: colors.inkSoft },
  roomBody: { flex: 1, minWidth: 0 },
  roomHost: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink, flexShrink: 1 },
  roomMeta: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft, marginTop: 3 },
  roomFoot: { flexDirection: 'row', alignItems: 'center', marginTop: 6, minHeight: 22 },
  roomCode: { fontFamily: fonts.medium, fontSize: 11, color: colors.inkMuted, marginLeft: 'auto', letterSpacing: 0.5 },
  seatOverflow: { fontFamily: fonts.bold, fontSize: 12, color: colors.inkMuted, marginLeft: 10 },
  seatFace: { marginRight: -6 },
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
