/**
 * Props equality for the table's leaf components, by value rather than by
 * reference.
 *
 * The table screen rebuilds its whole tree on every update, a turn timer tick
 * included, and it hands its seats and cards fresh object literals each time
 * (`player={{ ...p, currentBet }}`, `dealFrom={{ x, y }}`, a new
 * `shownCards` array). So `React.memo` on its own never skips anything. This
 * compares plain objects and arrays by their contents, a few levels deep,
 * which is enough for a seat's props and cheap next to redrawing a seat.
 *
 * Anything that is not a plain object or array, a function, an animated
 * style, a class instance, is compared by reference, so nothing exotic is
 * ever walked.
 */
const isPlain = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === Array.prototype || proto === null;
};

export function sameValue(a: unknown, b: unknown, depth = 4): boolean {
  if (Object.is(a, b)) return true;
  if (depth <= 0 || !isPlain(a) || !isPlain(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!sameValue(a[key], b[key], depth - 1)) return false;
  }
  return true;
}

export function propsEqual<P extends object>(prev: Readonly<P>, next: Readonly<P>): boolean {
  return sameValue(prev, next, 5);
}
