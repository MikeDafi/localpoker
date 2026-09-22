import React, { useCallback, useEffect } from 'react';
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

  const onReady = useCallback(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch((error) => {
        captureError(error, { tags: { area: 'startup', operation: 'splash-hide' } });
      });
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppProvider>
            <NavigationContainer theme={navTheme} onReady={onReady}>
              <StatusBar style="dark" />
              <RootNavigator />
            </NavigationContainer>
          </AppProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
