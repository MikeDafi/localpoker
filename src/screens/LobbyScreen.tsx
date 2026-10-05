import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Share } from 'react-native';
import { showAlert } from '../components/alertBus';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { AnimatedPal } from '../components/AnimatedPal';
import { AdBanner } from '../components/AdBanner';
import { colors, fonts, radii, spacing } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { applyOutfit } from '../game/outfits';
import { palFromSeed, normalizePal, type PalConfig } from '../avatar/palConfig';
import { RootStackParamList } from '../navigation/types';
import {
  isFirebaseConfigured, createRoom, inviteFriendToRoom, joinRoom, leaveRoom, subscribeRoom, setPlayerConnected, getAuthUid,
  startRoomGame,
  getCachedHostGame,
  type RoomState, type RoomPlayer,
} from '../services/firebase';
import { captureError } from '../services/telemetry';
import { DEFAULT_GAME_SETTINGS, normalizeSettings, roomSettingsJson, withOwnDevicePreferences } from '../game/settings';
import { GAME_MODE_LABELS } from '../game/gameMode';
import { pinCosmetics } from '../game/cosmetics';
import { shouldLeaveRoomOnLobbyUnmount } from '../game/lobbyRoom';
import type { GameSettings } from '../game/settings';

type Props = NativeStackScreenProps<RootStackParamList, 'Lobby'>;

/** A Pal carried on a room player, or nothing if it is missing or malformed. */
const parseRoomPal = (palJson?: string): PalConfig | undefined => {
  if (!palJson) return undefined;
  try {
    return normalizePal(JSON.parse(palJson) as Partial<PalConfig>);
  } catch {
    return undefined;
  }
};

export function LobbyScreen({ navigation, route }: Props) {
  const { roomCode, host, settings: hostSettings } = route.params;
  const { profile, friends, cosmetics } = useApp();
  const online = isFirebaseConfigured();

  const me: RoomPlayer = useMemo(() => ({
    id: profile.id,
    name: profile.name,
    palSeed: profile.id,
    // Carried into the room so everyone at the table draws the Pal this
    // player actually designed, rather than a doodle derived from their id.
    // Dressed in the equipped outfit, so the rest of the table sees what was
    // bought: the outfit is part of the Pal, not a local decoration.
    palJson: JSON.stringify(applyOutfit(profile.pal, cosmetics.equippedByCategory.outfits)),
    seatIndex: 0,
    // The table's buy-in, not the app default. Hardcoding the default meant
    // the lobby advertised one stack and the host dealt another.
    chips: (hostSettings ?? DEFAULT_GAME_SETTINGS).startingStack,
    connected: true,
    isHost: host,
  }), [profile.id, profile.name, profile.pal, host, hostSettings, cosmetics.equippedByCategory.outfits]);

  /**
   * Players are stored under their Firebase `auth.uid`, because that is what the
   * database rules scope writes to, not the local `profile.id`. Own-row checks
   * below must therefore compare against the uid, falling back to the local id
   * when running offline where no uid exists.
   */
  const myRoomId = getAuthUid() ?? profile.id;

  const [room, setRoom] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<string>(online ? 'Connecting…' : 'Offline');
  const [connected, setConnected] = useState(false);
  const navigatedRef = useRef(false);
  const preserveRoomOnUnmountRef = useRef(false);

  /**
   * The table's rules come from the room, not from this device.
   *
   * The host chose them in Game Setup and they were written into the room, so
   * reading them back is what makes every seat agree: a joiner used to be sent
   * to the table with the built-in defaults while the engine ran the host's
   * blinds, so the screen showed one game and the pot played another.
   */
  const goToTable = (current: RoomState | null) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    let tableSettings = hostSettings ?? DEFAULT_GAME_SETTINGS;
    if (current?.settingsJson) {
      try {
        const published = normalizeSettings(JSON.parse(current.settingsJson) as Partial<typeof tableSettings>);
        /*
         * The room's terms, but this phone's preferences. Taking the payload
         * wholesale handed the host's sound, animation speed and text size to
         * everyone who sat down, so a host playing muted muted the table.
         */
        tableSettings = withOwnDevicePreferences(published, hostSettings ?? DEFAULT_GAME_SETTINGS);
      } catch {
        // A corrupt room falls back to whatever this device already had.
      }
    }
    navigation.replace('Table', {
      settings: tableSettings,
      seed: Date.now(),
      roomCode,
    });
  };

  useEffect(() => {
    if (!online) {
      setStatus('Online play needs Firebase Realtime Database rules enabled (see docs/FIREBASE_SETUP.md).');
      return;
    }
    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const res = host
        ? await createRoom(roomCode, me, roomSettingsJson(pinCosmetics(hostSettings ?? DEFAULT_GAME_SETTINGS, cosmetics)), {
            visibility: (hostSettings ?? DEFAULT_GAME_SETTINGS).roomVisibility,
          })
        : await joinRoom(roomCode, me);
      if (cancelled) return;
      if (!res.ok) {
        setStatus(res.reason || 'Could not connect to the room.');
        return;
      }
      setConnected(true);
      setStatus('Waiting for players…');
      await setPlayerConnected(roomCode, me.id, true);
      if (cancelled) return;
      const u = subscribeRoom(roomCode, (r) => {
        if (cancelled) return;
        setRoom(r);
        if (r?.status === 'playing' && r.publicState) {
          // The host must not leave for the table until their own
          // authoritative game exists. startRoomGame caches it only after its
          // write lands, and that same write is what fires this listener, so
          // the listener otherwise wins the race: the table mounts with no
          // host game, the host never subscribes to actions, and every call a
          // guest makes is written to the database and read by nobody. The
          // table then sits on the guest's turn forever. Guests have no such
          // state and can go straight through.
          if (!host || getCachedHostGame(roomCode)) goToTable(r);
        } else if (r?.status === 'ended') {
          /*
           * The host left, so there is no table to wait at.
           *
           * This used to set a line of text and leave everybody sitting in a
           * lobby that could never start, watching a roster of players who
           * were also stuck. Nothing about that room can progress without its
           * host, so take people out of it instead of telling them about it.
           * Guests only: the host is already on their way somewhere.
           */
          if (host || navigatedRef.current) return;
          navigatedRef.current = true;
          setStatus(r.endedReason || 'The host left, so this room has closed.');
          showAlert(
            'Room closed',
            r.endedReason || 'The host left before the game started.',
            [{ text: 'Back to menu', onPress: () => navigation.replace('Home') }],
          );
        }
      });
      if (cancelled) { u(); return; }
      unsub = u;
    })();
    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (shouldLeaveRoomOnLobbyUnmount({
        online,
        preservingRoom: navigatedRef.current || preserveRoomOnUnmountRef.current,
      })) {
        leaveRoom(roomCode, me.id).catch((error) => {
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'leave-room-cleanup' } });
        });
      }
    };
  }, [online, host, roomCode, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const players: RoomPlayer[] = useMemo(() => {
    /*
     * Everyone seated, whether or not their socket is up this second.
     *
     * This filtered on `connected`, and iOS closes the socket within seconds
     * of an app being backgrounded, so a host who switched apps to send
     * someone the code vanished from the lobby: the person who just joined
     * opened it to an empty table and no idea anyone was there. Taking a call
     * is not leaving. The dot beside each name already shows who is actually
     * attentive, and a table nobody returns to is swept after ten minutes.
     */
    if (room?.players) return Object.values(room.players);
    // Only stand in for the roster once the room genuinely exists. Showing
    // yourself regardless meant a refused write still rendered a seated host
    // and a green dot directly above its own error, which read as a working
    // table that simply had nobody else in it.
    return connected ? [me] : [];
  }, [room, me, connected]);

  /**
   * The settings the table will actually use.
   *
   * Read from the room rather than from this device, so a joiner sees the
   * host's blinds instead of their own leftover preferences. Falls back to
   * what the host picked in Game Setup for the moment before the room lands.
   */
  const tableSettings = useMemo(() => {
    if (room?.settingsJson) {
      try {
        return normalizeSettings(JSON.parse(room.settingsJson) as Partial<GameSettings>);
      } catch {
        // A corrupt payload should not blank the panel.
      }
    }
    return hostSettings ?? DEFAULT_GAME_SETTINGS;
  }, [room?.settingsJson, hostSettings]);

  const canStart = host && connected && players.length >= 2;

  const share = async () => {
    try { await Share.share({ message: `Join my LocalPoker table! Room code: ${roomCode}` }); } catch {}
  };

  const [invited, setInvited] = useState<Record<string, boolean>>({});

  /*
   * Creating the room is silent. This button is the deliberate per-person
   * invite, and it writes the in-app invite list instead of opening the share
   * sheet and hoping the friend sees a separate message.
   */
  const invitableFriends = useMemo(() => {
    // Someone already at the table is not someone to invite to it. They were
    // listed anyway, so the host appeared twice: once in the roster and once
    // as a person to ask along.
    const seated = new Set(Object.keys(room?.players ?? {}));
    return friends
      .filter((f) => !(f.uid && seated.has(f.uid)))
      .sort((a, b) => Number(!!b.online) - Number(!!a.online) || a.name.localeCompare(b.name));
  }, [friends, room?.players]);

  const inviteFriend = async (id: string, name: string) => {
    setInvited((prev) => ({ ...prev, [id]: true }));
    const res = await inviteFriendToRoom(roomCode, id);
    if (!res.ok) {
      setInvited((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showAlert('Could not invite', res.reason || 'Try again in a moment.');
      return;
    }
    showAlert('Invite sent', `${name} will see it in LocalPoker.`);
  };

  /**
   * Re-open Game Setup for a room that already exists.
   *
   * Coming back replaces this screen, which runs `createRoom` again. That now
   * recognises the host returning to their own lobby and refreshes the
   * settings in place rather than reporting a collision, so the players who
   * have already joined keep their seats.
   */
  const editSettings = () => {
    /*
     * Game Setup is still part of hosting this lobby. Running the normal
     * unmount cleanup here ends the room, withdraws invites, and makes the
     * return trip look like a duplicate create.
     */
    preserveRoomOnUnmountRef.current = true;
    navigation.replace('GameSetup', { mode: 'friends', roomCode });
  };

  const startGame = async () => {
    setStatus('Starting hand…');
    const res = await startRoomGame(roomCode);
    if (!res.ok) {
      setStatus(res.reason || 'Could not start the game.');
      showAlert('Could not start', res.reason || 'Try again in a moment.');
      return;
    }
    goToTable(room);
  };

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="Friends Lobby" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {host ? (
          <WiiButton
            label={canStart ? 'Start Game' : 'Waiting for players…'}
            variant={canStart ? 'green' : 'white'}
            size="lg"
            fullWidth
            disabled={!canStart}
            onPress={startGame}
          />
        ) : (
          <Text style={styles.waitHost}>Waiting for the host to start…</Text>
        )}

        {/* The code used to be a full panel with 34pt type across the screen,
            which is a lot of room for four characters you read once and then
            never look at again. It sits inline with Share now, leaving the
            space for the roster and the table rules, which are what you are
            actually waiting on. */}
        <WiiPanel padding={14}>
          <View style={styles.codeRow}>
            <View style={styles.codeChip}><Text style={styles.code}>{roomCode}</Text></View>
            <View style={{ flex: 1 }} />
            <WiiButton label="Share invite" variant="blue" size="sm" onPress={share} />
          </View>
        </WiiPanel>

        <WiiPanel padding={16}>
          <Text style={styles.section}>Invite friends</Text>
          {invitableFriends.length === 0 ? (
            <Text style={styles.note}>Add friends first, then invite them from here.</Text>
          ) : (
            invitableFriends.map((f) => (
              <View key={f.id} style={styles.inviteRow}>
                <AnimatedPal config={f.pal ?? palFromSeed(f.palSeed || f.id)} size={36} alive={!!f.online} />
                <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
                  <Text style={styles.playerName} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.playerMeta}>{f.online ? 'online' : 'offline'}</Text>
                </View>
                <WiiButton
                  label={invited[f.id] ? 'Invited' : 'Invite'}
                  variant={invited[f.id] ? 'white' : 'blue'}
                  size="sm"
                  disabled={invited[f.id]}
                  onPress={() => inviteFriend(f.uid ?? f.id, f.name)}
                />
              </View>
            ))
          )}
        </WiiPanel>

        <WiiPanel>
          <View style={styles.playersHeader}>
            <Text style={styles.section}>Players</Text>
            <Text style={styles.count}>{players.length} here{online ? '' : ' (offline)'}</Text>
          </View>
          {players.map((p) => (
            <View key={p.id} style={styles.playerRow}>
              <AnimatedPal config={p.id === myRoomId ? profile.pal : (parseRoomPal(p.palJson) ?? palFromSeed(p.palSeed || p.id))} size={40} alive={p.connected} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.playerName}>{p.name}{p.id === myRoomId ? ' (you)' : ''}</Text>
                <Text style={styles.playerMeta}>{p.isHost ? 'Host' : 'Player'} · {p.connected ? 'online' : 'away'}</Text>
              </View>
              <View style={[styles.dot, { backgroundColor: p.connected ? colors.online : colors.offline }]} />
            </View>
          ))}
          <Text style={styles.status}>{status}</Text>
        </WiiPanel>

        <WiiPanel>
          <View style={styles.playersHeader}>
            <Text style={styles.section}>Table rules</Text>
            {host ? (
              <WiiButton label="Change" variant="white" size="sm" onPress={editSettings} />
            ) : null}
          </View>
          <View style={styles.settingsGrid}>
            {[
              ['Mode', GAME_MODE_LABELS[tableSettings.gameMode]],
              ['Blinds', `${tableSettings.smallBlind} / ${tableSettings.bigBlind}`],
              ['Ante', tableSettings.ante > 0 ? String(tableSettings.ante) : 'None'],
              ['Starting stack', String(tableSettings.startingStack)],
              ['Max players', String(tableSettings.maxPlayers)],
              ['Table', tableSettings.roomVisibility === 'public' ? 'Public' : 'Private'],
            ].map(([k, v]) => (
              <View key={k} style={styles.settingsRow}>
                <Text style={styles.settingsKey}>{k}</Text>
                <Text style={styles.settingsValue}>{v}</Text>
              </View>
            ))}
          </View>
          {host ? (
            <Text style={styles.settingsHint}>Change these until the first hand is dealt.</Text>
          ) : null}
        </WiiPanel>


        {!online && (
          <WiiPanel padding={16}>
            <Text style={styles.noteTitle}>Enable live play</Text>
            <Text style={styles.note}>
              Firebase config is wired. Set the Realtime Database rules from `database.rules.json` in the
              Firebase console (or use test mode), then reopen this room, real friends will appear here.
              No bots are ever added to friends games.
            </Text>
          </WiiPanel>
        )}

        <AdBanner />
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft, marginBottom: 8 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  settingsGrid: { gap: 2 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  settingsKey: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft, flexShrink: 1, marginRight: spacing.md },
  settingsValue: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  settingsHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted, marginTop: 10 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  codeChip: { backgroundColor: colors.panelAlt, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 16 },
  code: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: 3, color: colors.blueDeep },
  playersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  section: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  count: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkMuted },
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.panelAlt },
  playerName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  playerMeta: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted, marginTop: spacing.md, textAlign: 'center' },
  waitHost: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft, textAlign: 'center' },
  noteTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink, marginBottom: 4 },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkSoft, lineHeight: 18 },
});
