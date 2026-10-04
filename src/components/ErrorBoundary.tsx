import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { captureError } from '../services/telemetry';

declare const __DEV__: boolean | undefined;

const isDev = (): boolean => (typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : false);

interface Props {
  children: React.ReactNode;
  /**
   * Throws away whatever could crash the tree again the moment it remounts,
   * which in practice means a saved table. Without it "try again" rebuilds the
   * same broken screen from the same bad data and fails in the same place, so
   * the player is stuck in a loop with no way back.
   */
  onDiscardSession?: () => void | Promise<void>;
}
interface State { error: Error | null }

/**
 * App-level error boundary. Prevents a white-screen crash by catching render
 * errors and offering a recovery action.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    /*
     * Lift the native splash before anything else.
     *
     * SplashGate lives inside this boundary, so a failure during startup
     * unmounts the one thing that would have hidden the splash, including its
     * timeout backstop. The fallback below then renders underneath an opaque
     * native image and the app looks frozen rather than broken, which is the
     * worse of the two: there is nothing to read and nothing to tap.
     */
    SplashScreen.hideAsync().catch(() => {});
    captureError(error, {
      tags: { area: 'react', source: 'ErrorBoundary' },
      extra: { componentStack: info.componentStack },
    });
    console.error('Uncaught error:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  backToMenu = () => {
    /*
     * Discard first, then remount. The navigator lives inside this boundary,
     * so it is already unmounted here and cannot be navigated; clearing the
     * saved table and letting the tree rebuild is what actually lands the
     * player back on the menu.
     */
    void Promise.resolve(this.props.onDiscardSession?.()).finally(() => {
      this.setState({ error: null });
    });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.emoji}>🃏</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.msg}>
            The hand could not be finished. Your chips and stats are safe.
          </Text>
          {/*
            * The raw message is for whoever is debugging, not for the player.
            * This used to print engine text like "At least two seated players
            * with chips are required to start a hand" in red monospace, which
            * reads as the app being broken rather than as a table ending.
            */}
          {isDev() ? (
            <ScrollView style={styles.box}>
              <Text style={styles.err}>{this.state.error.message}</Text>
            </ScrollView>
          ) : null}
          <Pressable style={styles.btn} onPress={this.reset}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={this.backToMenu}>
            <Text style={styles.secondaryText}>Back to menu</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#E9F1F6', alignItems: 'center', justifyContent: 'center', padding: 24 },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#2B3A45', marginBottom: 8 },
  msg: { fontSize: 15, color: '#53656F', textAlign: 'center', marginBottom: 16 },
  box: { maxHeight: 120, alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#CBD9E2', padding: 12, marginBottom: 20 },
  err: { fontSize: 12, color: '#C63A26', fontFamily: 'Courier' },
  btn: { backgroundColor: '#22ABE4', borderRadius: 999, paddingHorizontal: 28, paddingVertical: 14 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { marginTop: 12, paddingHorizontal: 28, paddingVertical: 12 },
  secondaryText: { color: '#53656F', fontSize: 15, fontWeight: '600' },
});
