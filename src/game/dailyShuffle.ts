/**
 * The order the GIF tray is shown in, reshuffled once a day.
 *
 * A fixed list means the same six GIFs are always the ones in reach and the
 * rest may as well not be there. Reshuffling on every open is worse: the tray
 * is muscle memory within a session, and a grid that moves under your thumb
 * while you are reaching for something is actively annoying.
 *
 * Once a day is the compromise. It is stable for as long as anyone is
 * playing, so the tray stays learnable, and it is different tomorrow, so the
 * whole library gets a turn near the front.
 *
 * Seeded from the date rather than randomised, so every device shows the same
 * order on the same day. Nothing depends on that, but a shared order is one
 * less thing that can look broken when two people compare screens.
 */

/** Days since the epoch, in local time, which is what "today" means to a player. */
export function dayNumber(now: Date = new Date()): number {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

/**
 * A small deterministic generator.
 *
 * `mulberry32` rather than anything from the engine's shuffler: this picks the
 * order of a cosmetic tray, and borrowing the card shuffler for it would tie
 * a visual nicety to the one piece of randomness in the app that has to stay
 * above suspicion.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates, so every ordering is equally likely and nothing is dropped or
 * duplicated. Returns a new array: the library itself is a module constant and
 * shuffling it in place would reorder it for everyone who imports it.
 */
export function shuffleForDay<T>(items: readonly T[], day: number = dayNumber()): T[] {
  const out = items.slice();
  const rand = mulberry32(day * 2654435761);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
