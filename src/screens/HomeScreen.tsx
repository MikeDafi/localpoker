import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { ScreenBackground } from '../components/ScreenBackground';
import { WiiChannelTile } from '../components/WiiChannelTile';
import { AnimatedPal } from '../components/AnimatedPal';
import { AdBanner, ADS_ENABLED } from '../components/AdBanner';
import { FriendsIcon, BotIcon, StatsIcon, ProfileIcon, CartIcon } from '../components/Icons';
import { SettingsIcon, PaletteIcon } from '../components/Icons';
import { colors, fonts, radii, shadows, spacing, easings } from '../theme/theme';
import { useApp } from '../state/AppContext';
import { isResumable } from '../game/savedGame';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { profile, savedGame, clearSavedGame } = useApp();
  const { width } = useWindowDimensions();
  const [gridH, setGridH] = React.useState(0);

  // A friends game abandoned for >15s is no longer resumable; clear it.
  React.useEffect(() => {
    if (savedGame && !isResumable(savedGame)) clearSavedGame();
  }, [savedGame, clearSavedGame]);
  const canResume = isResumable(savedGame);

  const gap = spacing.md;
  const cols = width > 520 ? 3 : 2;
  const pagePad = spacing.lg;
  const tileW = Math.floor((width - pagePad * 2 - gap * (cols - 1)) / cols);

  const tiles = [
    { key: 'friends', title: 'Play with Friends', subtitle: 'Private room', accent: colors.blue, icon: <FriendsIcon />, onPress: () => navigation.navigate('CreateJoin') },
    { key: 'quick', title: 'Quick Play', subtitle: 'vs. computer', accent: colors.felt, icon: <BotIcon />, onPress: () => navigation.navigate('GameSetup', { mode: 'quick' }) },
    { key: 'pal', title: 'My Pal', subtitle: 'Customize', accent: colors.accent, icon: <PaletteIcon />, onPress: () => navigation.navigate('PalDesigner') },
    { key: 'friendsList', title: 'Friends', subtitle: 'Your crew', accent: colors.accentPink, icon: <ProfileIcon />, onPress: () => navigation.navigate('Friends') },
    { key: 'stats', title: 'My Stats', subtitle: 'Track your game', accent: colors.blueDeep, icon: <StatsIcon />, onPress: () => navigation.navigate('Stats') },
    { key: 'store', title: 'Store', subtitle: 'Coins & style', accent: colors.gold, icon: <CartIcon />, onPress: () => navigation.navigate('Store') },
  ];

  const rows = Math.ceil(tiles.length / cols);
  const tileH = gridH > 0 ? Math.max(92, Math.floor((gridH - gap * (rows - 1)) / rows)) : undefined;

  return (
    <ScreenBackground variant="menu">
      <View style={styles.header}>
        <Pressable style={styles.profileChip} onPress={() => navigation.navigate('Profile')}>
          <AnimatedPal config={profile.pal} size={48} ring />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.hi}>Welcome back</Text>
            <Text style={styles.name} numberOfLines={1}>{profile.name}</Text>
          </View>
        </Pressable>
        <Pressable style={[styles.settingsBtn, shadows.soft]} onPress={() => navigation.navigate('Settings')} hitSlop={8}>
          <SettingsIcon color={colors.inkSoft} size={24} />
        </Pressable>
      </View>

      <Text style={styles.wordmark}>Local<Text style={{ color: colors.blue }}>Poker</Text></Text>
      <Text style={styles.tagline}>Poker with Friends</Text>

      <View style={styles.body}>
        {savedGame && canResume && (
          <Animated.View entering={FadeInDown.duration(360)}>
            <Pressable
              style={[styles.resumeCard, shadows.soft]}
              onPress={() => navigation.navigate('Table', { settings: savedGame.settings, seed: savedGame.seed, roomCode: savedGame.roomCode, resume: true })}
            >
              <View style={styles.resumeDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeTitle}>Resume game</Text>
                <Text style={styles.resumeSub}>Hand #{savedGame.handNumber}{savedGame.roomCode ? ` · room ${savedGame.roomCode}` : ''} — tap to continue</Text>
              </View>
              <Text style={styles.resumeArrow}>›</Text>
            </Pressable>
          </Animated.View>
        )}
        <View
          style={styles.gridArea}
          onLayout={(e) => setGridH(e.nativeEvent.layout.height)}
        >
          <View style={[styles.grid, { gap }]}>
            {tiles.map((t, i) => (
              <Animated.View key={t.key} entering={FadeInDown.delay(70 * i).duration(420).easing(Easing.bezier(...easings.out))}>
                <WiiChannelTile title={t.title} subtitle={t.subtitle} accent={t.accent} icon={t.icon} width={tileW} height={tileH} onPress={t.onPress} />
              </Animated.View>
            ))}
          </View>
        </View>
      </View>

      {ADS_ENABLED ? <View style={styles.bottomBar}><AdBanner /></View> : null}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  profileChip: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  hi: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  name: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink, maxWidth: 180 },
  settingsBtn: { width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontFamily: fonts.bold, fontSize: 34, color: colors.ink, textAlign: 'center', marginTop: spacing.sm },
  tagline: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkMuted, textAlign: 'center', marginTop: 2 },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  gridArea: { flex: 1, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  resumeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md, gap: spacing.md },
  resumeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green },
  resumeTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  resumeSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  resumeArrow: { fontFamily: fonts.bold, fontSize: 26, color: colors.blue },
  bottomBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
});
