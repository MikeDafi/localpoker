import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
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

import { AppProvider, useApp } from './src/state/AppContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { colors } from './src/theme/theme';
import { sound } from './src/services/sound';
import { ensureSignedIn } from './src/services/firebase';
import { captureError, initTelemetry } from './src/services/telemetry';
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

SplashScreen.preventAutoHideAsync().catch((error) => {
  captureError(error, { tags: { area: 'startup', operation: 'splash-prevent-auto-hide' } });
});

const Stack = createNativeStackNavigator<RootStackParamList>();

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
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!ageVerified) return <AgeGateScreen />;
  return (
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
  );
}

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
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppProvider>
            <SplashGate fontsLoaded={fontsLoaded} />
            <NavigationContainer theme={navTheme}>
              <StatusBar style="dark" />
              <RootNavigator />
            </NavigationContainer>
          </AppProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
