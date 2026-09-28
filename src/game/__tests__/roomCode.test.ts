import { describe, expect, it, vi } from 'vitest';
import {
  CODE_ALPHABET,
  CODE_ATTEMPTS,
  CODE_LENGTH,
  isRoomCodeShaped,
  makeAvailableRoomCode,
  makeRoomCode,
  normalizeRoomCode,
  filterToCodeAlphabet,
} from '../roomCode';

/**
 * Codes were shortened from ten characters to four so they are bearable to
 * read aloud. That trade is only safe because collisions are handled, so these
 * tests pin both the shape and the retry behaviour.
 */

const bytesOf = (...values: number[]) => () => Uint8Array.from(values);

describe('makeRoomCode', () => {
  it('is four characters from the safe alphabet', () => {
    const code = makeRoomCode(bytesOf(0, 1, 2, 3));
    expect(code).toHaveLength(CODE_LENGTH);
    expect(CODE_LENGTH).toBe(4);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
  });

  it('omits characters that are misread aloud or in print', () => {
    for (const ambiguous of ['I', 'O', '0', '1']) {
      expect(CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it('maps bytes onto the alphabet without bias', () => {
    // 256 divided by the alphabet size must be exact, or `% length` would
    // favour the first characters. This is the property that makes the cheap
    // modulo acceptable instead of rejection sampling.
    expect(256 % CODE_ALPHABET.length).toBe(0);
  });

  it('uses every byte it asks for', () => {
    const random = vi.fn(bytesOf(0, 0, 0, 31));
    expect(makeRoomCode(random)).toBe('AAA9');
    expect(random).toHaveBeenCalledWith(CODE_LENGTH);
  });

  it('wraps byte values larger than the alphabet', () => {
    // 32 wraps to index 0, 33 to index 1.
    expect(makeRoomCode(bytesOf(32, 33, 64, 65))).toBe('ABAB');
  });
});

describe('isRoomCodeShaped', () => {
  it('accepts a well formed code, case and padding insensitive', () => {
    expect(isRoomCodeShaped('AB24')).toBe(true);
    expect(isRoomCodeShaped('  ab24 ')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isRoomCodeShaped('AB2')).toBe(false);
    expect(isRoomCodeShaped('AB245')).toBe(false);
    expect(isRoomCodeShaped('')).toBe(false);
  });

  it('rejects characters outside the alphabet, including the ambiguous ones', () => {
    expect(isRoomCodeShaped('AB2O')).toBe(false);
    expect(isRoomCodeShaped('AB21')).toBe(false);
    expect(isRoomCodeShaped('AB-2')).toBe(false);
  });
});

describe('normalizeRoomCode', () => {
  it('upper cases and trims what the player typed', () => {
    expect(normalizeRoomCode('  ab24 ')).toBe('AB24');
  });
});

describe('makeAvailableRoomCode', () => {
  it('keeps the first code when nothing is using it', async () => {
    const isTaken = vi.fn(async () => false);
    const code = await makeAvailableRoomCode(isTaken, bytesOf(0, 0, 0, 0));
    expect(code).toBe('AAAA');
    expect(isTaken).toHaveBeenCalledTimes(1);
  });

  it('draws again when the code is already live', async () => {
    let draw = 0;
    const random = () => Uint8Array.from([draw, draw, draw, draw++]);
    const isTaken = vi.fn(async (code: string) => code === 'AAAA');
    const code = await makeAvailableRoomCode(isTaken, random);
    expect(code).not.toBe('AAAA');
    expect(isTaken).toHaveBeenCalledTimes(2);
  });

  it('gives up after a bounded number of attempts rather than looping forever', async () => {
    const isTaken = vi.fn(async () => true);
    const code = await makeAvailableRoomCode(isTaken, bytesOf(0, 0, 0, 0));
    expect(isTaken).toHaveBeenCalledTimes(CODE_ATTEMPTS);
    expect(code).toHaveLength(CODE_LENGTH);
  });

  it('still hands back a code when the check cannot reach the network', async () => {
    // Hosting should not be blocked by a failed lookup: createRoom refuses to
    // overwrite a live room, so it remains the real guard.
    const isTaken = vi.fn(async () => { throw new Error('offline'); });
    const code = await makeAvailableRoomCode(isTaken, bytesOf(0, 0, 0, 0));
    expect(code).toBe('AAAA');
  });
});


/**
 * The alphabet omits I, O, 0 and 1 so a code cannot be misread. Typing one of
 * them used to produce a code that matched no room, with an error that did not
 * explain why, so they are dropped as the player types instead.
 */
describe('filterToCodeAlphabet', () => {
  it('drops the characters the alphabet deliberately excludes', () => {
    expect(filterToCodeAlphabet('IO01')).toBe('');
    expect(filterToCodeAlphabet('A0B1')).toBe('AB');
  });

  it('uppercases, so a lowercase code still works', () => {
    expect(filterToCodeAlphabet('ab24')).toBe('AB24');
  });

  it('strips spaces and punctuation people paste in', () => {
    expect(filterToCodeAlphabet(' AB-24 ')).toBe('AB24');
  });

  it('never exceeds one code length, however much is pasted', () => {
    expect(filterToCodeAlphabet('ABCDEFGH')).toHaveLength(CODE_LENGTH);
  });

  it('leaves a already valid code untouched', () => {
    expect(filterToCodeAlphabet('AB24')).toBe('AB24');
    expect(isRoomCodeShaped(filterToCodeAlphabet('AB24'))).toBe(true);
  });
});
