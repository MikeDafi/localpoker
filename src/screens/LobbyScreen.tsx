import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Share, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenBackground } from '../components/ScreenBackground';
import { ScreenHeader } from '../components/ScreenHeader';
import { WiiPanel } from '../components/WiiPanel';
import { WiiButton } from '../components/WiiButton';
import { AnimatedPal } from '../components/AnimatedPal';
import { AdBanner } from '../components/AdBanner';
import { colors, fonts, radii, spacing } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { palFromSeed } from '../avatar/palConfig';
import { RootStackParamList } from '../navigation/types';
import {
  isFirebaseConfigured, createRoom, joinRoom, leaveRoom, subscribeRoom, setPlayerConnected, getAuthUid,
  startRoomGame,
  type RoomState, type RoomPlayer,
} from '../services/firebase';
import { captureError } from '../services/telemetry';
import { DEFAULT_GAME_SETTINGS, normalizeSettings, roomSettingsJson } from '../game/settings';
import type { GameSettings } from '../game/settings';

type Props = NativeStackScreenProps<RootStackParamList, 'Lobby'>;

export function LobbyScreen({ navigation, route }: Props) {
  const { roomCode, host, settings: hostSettings } = route.params;
  const { profile, friends } = useApp();
  const online = isFirebaseConfigured();

  const me: RoomPlayer = useMemo(() => ({
    id: profile.id,
    name: profile.name,
    palSeed: profile.id,
    seatIndex: 0,
    chips: DEFAULT_GAME_SETTINGS.startingStack,
    connected: true,
    isHost: host,
  }), [profile.id, profile.name, host]);

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
        tableSettings = normalizeSettings(JSON.parse(current.settingsJson) as Partial<typeof tableSettings>);
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
        ? await createRoom(roomCode, me, roomSettingsJson(hostSettings ?? DEFAULT_GAME_SETTINGS), {
            visibility: (hostSettings ?? DEFAULT_GAME_SETTINGS).roomVisibility,
            // Friends are told about the table whether it is public or private;
            // private means hidden from strangers, not from them.
            friendUids: friends.map((f) => f.uid).filter((uid): uid is string => !!uid),
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
          goToTable(r);
        } else if (r?.status === 'ended') {
          setStatus('Room ended because the host disconnected or left.');
        }
      });
      if (cancelled) { u(); return; }
      unsub = u;
    })();
    return () => {
      cancelled = true;
      if (unsub) unsub();
      if (online && !navigatedRef.current) {
        leaveRoom(roomCode, me.id).catch((error) => {
          captureError(error, { tags: { area: 'firebase-room-sync', operation: 'leave-room-cleanup' } });
        });
      }
    };
  }, [online, host, roomCode, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const players: RoomPlayer[] = useMemo(() => {
    if (room?.players) return Object.values(room.players).filter((p) => p.connected);
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

  /**
   * Re-open Game Setup for a room that already exists.
   *
   * Coming back replaces this screen, which runs `createRoom` again. That now
   * recognises the host returning to their own lobby and refreshes the
   * settings in place rather than reporting a collision, so the players who
   * have already joined keep their seats.
   */
  const editSettings = () => {
    navigation.replace('GameSetup', { mode: 'friends', roomCode });
  };

  const startGame = async () => {
    setStatus('Starting hand…');
    const res = await startRoomGame(roomCode);
    if (!res.ok) {
      setStatus(res.reason || 'Could not start the game.');
      Alert.alert('Could not start', res.reason || 'Try again in a moment.');
      return;
    }
    goToTable(room);
  };

  return (
    <ScreenBackground variant="menu">
      <ScreenHeader title="Friends Lobby" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <WiiPanel padding={20}>
          <Text style={styles.label}>Room code</Text>
          <View style={styles.codeBox}><Text style={styles.code}>{roomCode}</Text></View>
          <WiiButton label="Share invite" variant="blue" size="md" fullWidth onPress={share} />
        </WiiPanel>

        <WiiPanel>
          <View style={styles.playersHeader}>
            <Text style={styles.section}>Players</Text>
            <Text style={styles.count}>{players.length} here{online ? '' : ' (offline)'}</Text>
          </View>
          {players.map((p) => (
            <View key={p.id} style={styles.playerRow}>
              <AnimatedPal config={p.id === myRoomId ? profile.pal : palFromSeed(p.palSeed || p.id)} size={40} alive={p.connected} />
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
  settingsGrid: { gap: 2 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  settingsKey: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft, flexShrink: 1, marginRight: spacing.md },
  settingsValue: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  settingsHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted, marginTop: 10 },
  codeBox: { backgroundColor: colors.panelAlt, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 16, alignItems: 'center', marginBottom: spacing.md },
  code: { fontFamily: fonts.bold, fontSize: 34, letterSpacing: 6, color: colors.blueDeep },
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
