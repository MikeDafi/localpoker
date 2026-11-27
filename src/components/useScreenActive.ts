import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

/**
 * Whether anything this component draws can actually be seen.
 *
 * The native stack keeps every screen below the current one mounted, so the
 * Home, room list and Lobby Pals went on breathing underneath the table for
 * the whole game: about a dozen animations nobody could see, each one asking
 * for a frame at the display's refresh rate. Measured on the simulator, one
 * idle Pal took the app from about 1% CPU and 68 idle wakeups to 5-13% and
 * roughly 24,000. Paused here when the screen loses focus or the app leaves
 * the foreground, and resumed the moment either comes back, so nothing on
 * screen ever looks different.
 *
 * Outside a navigator (a modal, a preview) there is no focus to lose, so
 * only the app state counts.
 */
export function useScreenActive(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused?.() ?? true);
  const [foreground, setForeground] = useState(() => AppState.currentState !== 'background');

  useEffect(() => {
    if (!navigation) return undefined;
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setForeground(next !== 'background'));
    return () => sub.remove();
  }, []);

  return focused && foreground;
}
