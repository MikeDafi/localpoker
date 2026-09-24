/**
 * The app's own motion preference, readable by components that are not screens.
 *
 * Reduce Motion is a global choice, but the components that need to obey it
 * (the animated Pal, most of all) are presentational and sit several levels
 * below any screen. Threading a prop through every one of them means a new
 * caller can silently forget it, which is exactly how the Pals ended up
 * breathing while the setting said they should not.
 *
 * `useSyncExternalStore` is what makes this safe: components re-render when the
 * preference changes, without importing app state.
 */

let reduceMotion = false;
const listeners = new Set<() => void>();

export function getAppReduceMotion(): boolean {
  return reduceMotion;
}

export function setAppReduceMotion(next: boolean): void {
  if (next === reduceMotion) return;
  reduceMotion = next;
  listeners.forEach((listener) => listener());
}

export function subscribeAppReduceMotion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
