import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';

import { AppProvider, SAVED_GAME_KEY, useApp } from './src/state/AppContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { InviteBanner } from './src/components/InviteBanner';
import { AppAlertHost } from './src/components/AppAlertHost';
import { colors } from './src/theme/theme';
import { sound } from './src/services/sound';
import { ensureSignedIn } from './src/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureError, initTelemetry } from './src/services/telemetry';
import { configureNotificationHandler, useNotificationTaps } from './src/services/pushSetup';
import { RootStackParamList } from './src/navigation/types';

import { HomeScreen } from './src/screens/HomeScreen';
import { CreateJoinScreen } from './src/screens/CreateJoinScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TableScreen } from './src/screens/TableScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { PalDesignerScreen } from './src/screens/PalDesignerScreen';
import { GameSetupScreen } from './src/screens/GameSetupScreen';
import { StoreScreen } from './src/screens/StoreScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AgeGateScreen } from './src/screens/AgeGateScreen';

initTelemetry();

// Without this a notification arriving while the app is open is delivered
// silently, so the one moment it matters most, a friend inviting you while
// you are already looking at the app, shows nothing at all.
configureNotificationHandler();

SplashScreen.preventAutoHideAsync().catch((error) => {
  captureError(error, { tags: { area: 'startup', operation: 'splash-prevent-auto-hide' } });
});

const Stack = createNativeStackNavigator<RootStackParamList>();

// Tapping a notification has to navigate from outside React, so the ref is
// how the tap handler reaches the navigator.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Hiding the splash used to hang off NavigationContainer's onReady, which is
// only fired once a navigator mounts inside it. RootNavigator renders a plain
// View while app state hydrates and renders the age gate before that, so on a
// fresh install no navigator ever mounted, onReady never fired, and the native
// splash stayed up forever with the age gate stranded behind it. The app was
// unusable on first launch. Expo Go never showed this because it does not use
// the app's own splash screen.
//
// Readiness is now expressed directly: fonts are loaded and app state has
// hydrated. The timeout is a deliberate backstop rather than belt and braces.
// A splash that never lifts is unrecoverable for the user, so it must not be
// possible for any single stalled promise to wedge it again; falling through
// to the app's own loading view keeps the failure visible in testing instead
// of fatal in production.
function SplashGate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready } = useApp();

  useEffect(() => {
    let done = false;
    const hide = (reason: string) => {
      if (done) return;
      done = true;
      SplashScreen.hideAsync().catch((error) => {
        captureError(error, { tags: { area: 'startup', operation: 'splash-hide', reason } });
      });
    };
    if (fontsLoaded && ready) hide('ready');
    const bail = setTimeout(() => hide('timeout'), 5000);
    return () => clearTimeout(bail);
  }, [fontsLoaded, ready]);

  return null;
}

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.blue },
};

function RootNavigator() {
  const { auth, ready, ageVerified } = useApp();
  // Only route a tap once the navigator can actually accept one, and only for
  // a signed-in player: a notification for someone who just signed out should
  // open the app, not jump to a room they can no longer join.
  useNotificationTaps(navigationRef, ready && ageVerified && auth.loggedIn);
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!ageVerified) return <AgeGateScreen />;
  return (
    <>
    {/* Above every screen, because an invite is worth seeing wherever you
        happen to be, and nowhere else in the app is watching for one. Not
        shown at a table: you are already playing. */}
    <InviteBanner
      enabled={ready && ageVerified && auth.loggedIn}
      onJoin={(code) => navigationRef.navigate('Lobby', { roomCode: code, host: false })}
    />
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {!auth.loggedIn ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="GameSetup" component={GameSetupScreen} />
          <Stack.Screen name="CreateJoin" component={CreateJoinScreen} />
          <Stack.Screen name="Lobby" component={LobbyScreen} />
          <Stack.Screen name="Friends" component={FriendsScreen} />
          <Stack.Screen name="Stats" component={StatsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="PalDesigner" component={PalDesignerScreen} />
          <Stack.Screen name="Store" component={StoreScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Table" component={TableScreen} options={{ animation: 'fade' }} />
        </>
      )}
    </Stack.Navigator>
    </>
  );
}

/**
 * What the error screen throws away before letting the tree rebuild.
 *
 * Only the saved table, never the profile, stats or coins. A resumable table
 * is the one piece of stored state that can crash the app the instant it
 * reopens, so it is the one piece worth discarding; losing a hand is a fair
 * price for getting back to the menu, losing a bankroll is not.
 */
const discardSavedTable = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SAVED_GAME_KEY);
  } catch (error) {
    captureError(error, { tags: { area: 'saved-game', operation: 'discard-after-crash' } });
  }
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  useEffect(() => {
    sound.prepare();
    ensureSignedIn().catch((error) => {
      captureError(error, { tags: { area: 'startup', operation: 'ensure-signed-in' } });
    });
  }, []);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <ErrorBoundary onDiscardSession={discardSavedTable}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppProvider>
            <SplashGate fontsLoaded={fontsLoaded} />
            <NavigationContainer theme={navTheme} ref={navigationRef}>
              <StatusBar style="dark" />
              <RootNavigator />
            </NavigationContainer>
            {/* Outside the navigator, because an alert belongs to the app
                rather than to whichever screen happened to raise it, and the
                eviction flow navigates away while its own alert is still up. */}
            <AppAlertHost />
          </AppProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
