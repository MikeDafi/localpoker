import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_SETTINGS, SETTINGS_SCHEMA } from '../settings';

/**
 * Guards the fix for a label that broke mid-word.
 *
 * "Animation Speed" rendered as "Animatio" / "n Speed" in Settings. iOS wraps
 * text on word boundaries right up until a single word cannot fit the line, and
 * then it breaks the word instead. The label column was sharing a row with a
 * fixed-width control slot, so on a 430 to 440pt phone it was squeezed below
 * the width of "Animation" and the fallback kicked in.
 *
 * The fix gives that column a minimum width. This test is what stops a future
 * label quietly reintroducing the bug: add a longer word than the column can
 * hold and it fails here rather than on a device.
 */

/** Matches `settingCopy.minWidth` in SettingsScreen and GameSetupScreen. */
const LABEL_COLUMN_MIN_WIDTH = 150;

/** `settingLabel.fontSize`. */
const LABEL_FONT_SIZE = 16;

/**
 * Width of one character of Fredoka SemiBold/Bold as a fraction of font size.
 *
 * Deliberately pessimistic. Real average advance is nearer 0.55em, so measuring
 * every character as a wide one means a label that passes here has margin on a
 * real device rather than sitting exactly on the limit.
 */
const WIDEST_CHAR_EM = 0.68;

const wordWidth = (word: string): number => word.length * LABEL_FONT_SIZE * WIDEST_CHAR_EM;

const everyLabelWord = (): { label: string; word: string }[] =>
  SETTINGS_SCHEMA.flatMap((section) =>
    section.fields.flatMap((field) =>
      field.label.split(/\s+/).map((word) => ({ label: field.label, word })),
    ),
  );

describe('settings labels fit their column', () => {
  it('has labels to check', () => {
    expect(everyLabelWord().length).toBeGreaterThan(20);
  });

  it('never needs a word wider than the label column can be', () => {
    const tooWide = everyLabelWord()
      .filter(({ word }) => wordWidth(word) > LABEL_COLUMN_MIN_WIDTH)
      .map(({ label, word }) => `"${label}" contains "${word}" (${Math.round(wordWidth(word))}pt)`);
    expect(tooWide, `these would break mid-word at ${LABEL_COLUMN_MIN_WIDTH}pt`).toEqual([]);
  });

  it('still catches a word that is too long', () => {
    // The guard is only worth having if it fails when it should. At this font
    // size the column holds about 13 characters, so a 15-character label word
    // is the kind of addition that must be caught here.
    expect(wordWidth('Personalization')).toBeGreaterThan(LABEL_COLUMN_MIN_WIDTH);
  });

  it('leaves room for Large Text to enlarge the label', () => {
    // Large Text multiplies font size, so the longest word has to survive it.
    const longest = everyLabelWord().reduce((a, b) => (b.word.length > a.word.length ? b : a));
    expect(wordWidth(longest.word) * 1.15).toBeLessThanOrEqual(LABEL_COLUMN_MIN_WIDTH);
  });
});

/**
 * Guards against settings drifting back into fiction.
 *
 * `GameSettings` once carried 96 keys while only 23 had a control and were
 * wired to anything. The other 71 were persisted, looked like configuration,
 * and did nothing, which is worse than not having them: a contributor reads
 * `bountyMode` and reasonably assumes bounties exist.
 */
describe('every setting is real', () => {
  /**
   * Keys with no control on purpose, because code sets them rather than the
   * player. Anything else without a control is dead weight.
   */
  const INTERNAL_ONLY = new Set(['cardFace', 'maxPlayers']);

  const schemaKeys = new Set(
    SETTINGS_SCHEMA.flatMap((section) => section.fields.map((field) => String(field.key))),
  );

  it('exposes a control for every setting that is not internal', () => {
    const orphaned = Object.keys(DEFAULT_GAME_SETTINGS)
      .filter((key) => !schemaKeys.has(key) && !INTERNAL_ONLY.has(key));
    expect(orphaned, 'these are persisted as settings but nothing can change them').toEqual([]);
  });

  it('has a default for every setting it offers a control for', () => {
    const missing = [...schemaKeys].filter((key) => !(key in DEFAULT_GAME_SETTINGS));
    expect(missing, 'these have a control but no default').toEqual([]);
  });

  it('keeps the internal list honest', () => {
    // If one of these gains a control, it is no longer internal.
    const contradictory = [...INTERNAL_ONLY].filter((key) => schemaKeys.has(key));
    expect(contradictory).toEqual([]);
  });
});
