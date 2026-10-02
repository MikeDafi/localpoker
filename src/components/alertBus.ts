/**
 * The queue behind LocalPoker's own alert.
 *
 * `Alert.alert` draws the system dialog: a white iOS card with blue system
 * text, dropped on top of a dark felt table drawn in Fredoka. It is the one
 * surface in the app that looks like it belongs to a different app, and it
 * turns up at the loudest moments, busting out, being blocked, leaving a
 * table, so it is the version of the app a player remembers.
 *
 * `showAlert` is a drop-in for `Alert.alert`, same arguments in the same
 * order, so every call site is a one word change and none of them has to grow
 * its own modal state.
 *
 * The queue lives outside React for two reasons. Alerts are raised from
 * effects, callbacks and promise handlers rather than from render, and iOS
 * queues a second alert behind the first rather than dropping it, which the
 * eviction flow depends on: "you ran out of time" must not be swallowed by
 * "table over".
 */

export type AppAlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AppAlertButton {
  text: string;
  style?: AppAlertButtonStyle;
  onPress?: () => void;
}

export interface AppAlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
}

/** How a choice is painted, in the app's own button vocabulary. */
export type AppAlertVariant = 'gold' | 'red' | 'white' | 'blue';

let queue: AppAlertRequest[] = [];
let nextId = 1;
const listeners = new Set<(top: AppAlertRequest | null) => void>();

function publish(): void {
  const top = queue[0] ?? null;
  for (const fn of listeners) fn(top);
}

/**
 * An alert with no buttons still has to be dismissable.
 *
 * `Alert.alert('Report sent', 'Thanks.')` is used in several places as a plain
 * acknowledgement; iOS gives it an OK, and without one here the modal would be
 * a dead end.
 */
export function normaliseButtons(buttons?: readonly AppAlertButton[]): AppAlertButton[] {
  if (!buttons || buttons.length === 0) return [{ text: 'OK' }];
  return buttons.map((b) => ({ ...b }));
}

/**
 * Which button, if any, is the one the player came here to press.
 *
 * Only a lone ordinary choice is promoted to gold. A confirmation reads as
 * "not that, this" and wants the eye pulled to its single affirmative, but a
 * menu of equals, the player options sheet, does not have an answer, and
 * painting one of them gold would invent a recommendation the code never made.
 * Returns -1 when nothing should be promoted.
 */
export function primaryButtonIndex(buttons: readonly AppAlertButton[]): number {
  let found = -1;
  for (let i = 0; i < buttons.length; i += 1) {
    if ((buttons[i]!.style ?? 'default') !== 'default') continue;
    if (found >= 0) return -1;
    found = i;
  }
  return found;
}

/** The variant a single choice is drawn with. */
export function buttonVariant(button: AppAlertButton, index: number, primary: number): AppAlertVariant {
  const style = button.style ?? 'default';
  if (style === 'destructive') return 'red';
  if (style === 'cancel') return 'white';
  return index === primary ? 'gold' : 'blue';
}

/**
 * Raise an alert. Signature matches `Alert.alert` so swapping is mechanical.
 */
export function showAlert(title: string, message?: string, buttons?: readonly AppAlertButton[]): number {
  const id = nextId;
  nextId += 1;
  queue = [...queue, { id, title, message, buttons: normaliseButtons(buttons) }];
  publish();
  return id;
}

/**
 * Close the alert on screen and let whatever queued behind it come forward.
 *
 * Takes the id it means to close rather than just popping, because the host
 * animates the modal out: a second dismissal arriving during that animation
 * would otherwise eat the alert underneath without ever showing it.
 */
export function dismissAlert(id: number): void {
  if (queue[0]?.id !== id) return;
  queue = queue.slice(1);
  publish();
}

export function currentAlert(): AppAlertRequest | null {
  return queue[0] ?? null;
}

export function subscribeAlerts(fn: (top: AppAlertRequest | null) => void): () => void {
  listeners.add(fn);
  fn(queue[0] ?? null);
  return () => {
    listeners.delete(fn);
  };
}

/** Test seam: drops anything queued. */
export function resetAlerts(): void {
  queue = [];
  nextId = 1;
  publish();
}
