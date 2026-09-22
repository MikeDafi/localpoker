import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { captureError } from '../services/telemetry';

interface Props { children: React.ReactNode }
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
    captureError(error, {
      tags: { area: 'react', source: 'ErrorBoundary' },
      extra: { componentStack: info.componentStack },
    });
    console.error('Uncaught error:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.emoji}>🃏</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.msg}>The app hit an unexpected error. You can try to continue.</Text>
          <ScrollView style={styles.box}>
            <Text style={styles.err}>{this.state.error.message}</Text>
          </ScrollView>
          <Pressable style={styles.btn} onPress={this.reset}>
            <Text style={styles.btnText}>Try again</Text>
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
});
