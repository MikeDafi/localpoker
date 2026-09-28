/**
 * Room codes.
 *
 * A code is a bearer token: anyone holding it can sit down. So it comes from a
 * real random source rather than `Math.random`, whose output is predictable
 * from prior draws.
 *
 * Four characters is a deliberate usability choice. People read these aloud and
 * retype them, and ten characters was long enough to be annoying at both ends.
 * The cost is a much smaller space, 32^4 or about 1.05 million, which is fine
 * for guessing (a wrong guess mostly lands on nothing, and rooms only accept
 * joins while they sit in the lobby) but *not* fine for collisions: by the
 * birthday bound, a few hundred rooms alive at once already make a clash
 * likely. Callers must therefore check availability rather than assume a fresh
 * code is free. `createRoom` refuses to overwrite a live room as the backstop.
 *
 * The alphabet drops characters that are misread aloud or in print (I, O, 0, 1)
 * because codes get shared by voice and screenshot.
 *
 * Pure module: the randomness is passed in rather than imported, so this stays
 * unit-testable without pulling React Native into the test environment.
 */

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const CODE_LENGTH = 4;

/** How many fresh codes to try before giving up on finding a free one. */
export const CODE_ATTEMPTS = 8;

export type RandomBytes = (count: number) => Uint8Array;

/**
 * A single candidate code.
 *
 * `% CODE_ALPHABET.length` is unbiased here only because the alphabet is 32
 * characters, which divides 256 exactly. Changing the alphabet to a length that
 * does not divide 256 would skew the distribution toward its first characters,
 * so the test suite pins that relationship.
 */
export function makeRoomCode(random: RandomBytes): string {
  const bytes = random(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Keep only characters a room code can actually contain.
 *
 * The alphabet deliberately omits I, O, 0 and 1 so a code read aloud or off a
 * screen cannot be mistyped into a different one. Without filtering, typing
 * the letter O produced a code that could never match any room and an error
 * that did not explain why, so the character is dropped as it is typed.
 */
export function filterToCodeAlphabet(input: string): string {
  return [...input.toUpperCase()].filter((ch) => CODE_ALPHABET.includes(ch)).join('').slice(0, CODE_LENGTH);
}

/** True when `input` could be a room code, ignoring case and stray spaces. */
export function isRoomCodeShaped(input: string): boolean {
  const code = input.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((ch) => CODE_ALPHABET.includes(ch));
}

/** Normalise typed input into the form the database keys on. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * A code nobody is using, or the last candidate if every attempt was taken.
 *
 * `isTaken` failing is treated as "not taken": an availability check that
 * cannot reach the network should not block hosting, because `createRoom`
 * still refuses to overwrite a live room.
 */
export async function makeAvailableRoomCode(
  isTaken: (code: string) => Promise<boolean>,
  random: RandomBytes,
): Promise<string> {
  let code = makeRoomCode(random);
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    let taken = false;
    try {
      taken = await isTaken(code);
    } catch {
      return code;
    }
    if (!taken) return code;
    code = makeRoomCode(random);
  }
  return code;
}
