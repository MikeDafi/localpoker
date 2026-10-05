import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_SETTINGS,
  DEVICE_ONLY_SETTINGS,
  SETTINGS_SCHEMA,
  availableSettingOptions,
  gameSetupSectionsForMode,
  normalizeSettings,
  resolveSettingSelection,
  settingsForModeDefaults,
  tableMenuRuleFields,
} from '../settings';

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

  it('drops the retired show names setting from saved data', () => {
    const normalized = normalizeSettings({ showAvatarNames: false } as never);
    expect('showAvatarNames' in normalized).toBe(false);
  });
});

describe('what Game Setup is allowed to show', () => {
  /*
   * Game Setup configures a table. Anything that belongs to the phone rather
   * than to the game has to be filtered out of it, and "Notify me" was not:
   * it turns push on for this device and publishes a token, but it appeared
   * while setting up a game as though it were a property of the table.
   *
   * This mirrors the filter in GameSetupScreen so that adding another
   * device-only setting cannot quietly put it back on that screen.
   */
  const setupKeys = (mode: 'cash' | 'tournament' | 'turbo', isFriends = false) =>
    gameSetupSectionsForMode(mode, isFriends).flatMap((s) => s.fields.map((f) => String(f.key)));

  it('shows no device-only setting', () => {
    for (const mode of ['cash', 'tournament', 'turbo'] as const) {
      for (const deviceOnly of DEVICE_ONLY_SETTINGS) {
        expect(setupKeys(mode), `${deviceOnly} belongs in Settings, not Game Setup`).not.toContain(deviceOnly);
      }
    }
  });

  it('leaves no empty tab behind', () => {
    // Friends held nothing but that one toggle, so filtering the field has to
    // take the section with it rather than leave a tab with nothing in it.
    for (const mode of ['cash', 'tournament', 'turbo'] as const) {
      for (const section of gameSetupSectionsForMode(mode)) {
        expect(section.fields.length, `${section.id} is an empty tab`).toBeGreaterThan(0);
      }
    }
  });

  it('still offers the table settings worth setting per game', () => {
    const ids = gameSetupSectionsForMode('cash').map((s) => s.id);
    expect(ids).toContain('table');
    expect(ids).toContain('bots');
  });

  it('keeps cash setup to buy-in and fixed blind controls', () => {
    const keys = setupKeys('cash');
    expect(keys).toEqual(expect.arrayContaining(['gameMode', 'smallBlind', 'bigBlind', 'startingStack']));
    expect(keys).not.toContain('ante');
    expect(keys).not.toContain('blindLevelLengthHands');
  });

  /*
   * Level length deliberately left out of setup, see `setupHidden`. It is
   * asked for in the table's own menu instead, which is the only place the
   * question means anything: before the first hand nobody knows how long a
   * level should be, and after a few they do. Every mode still carries a
   * sensible default, which is what the schedule test below pins.
   */
  it('adds blind schedule controls for tournament modes', () => {
    for (const mode of ['tournament', 'turbo'] as const) {
      const keys = setupKeys(mode);
      expect(keys).not.toContain('blindLevelLengthHands');
      expect(keys).toContain('ante');
      expect(tableMenuRuleFields(mode).map((f) => String(f.key))).toContain('blindLevelLengthHands');
    }
  });

  it('never offers a blind schedule for a cash table, in setup or at the table', () => {
    expect(setupKeys('cash')).not.toContain('blindLevelLengthHands');
    expect(tableMenuRuleFields('cash').map((f) => String(f.key))).not.toContain('blindLevelLengthHands');
  });

  /*
   * The table menu draws the felt, the card back and the chips as their own
   * rows, listing only what the player owns. Leaving them in the rule list
   * too drew each of them twice, and the second copy cycled every cosmetic
   * in the game rather than the owned ones.
   */
  it('leaves the cosmetics out of the table menu rule list', () => {
    for (const mode of ['cash', 'tournament', 'turbo'] as const) {
      const keys = tableMenuRuleFields(mode).map((f) => String(f.key));
      for (const cosmetic of ['feltStyle', 'cardBack', 'chipStyle']) {
        expect(keys, `${cosmetic} is drawn by its own row`).not.toContain(cosmetic);
      }
      for (const deviceOnly of DEVICE_ONLY_SETTINGS) {
        expect(keys).not.toContain(deviceOnly);
      }
    }
  });

  it('uses a faster hand schedule for turbo defaults', () => {
    const tournament = settingsForModeDefaults(DEFAULT_GAME_SETTINGS, 'tournament');
    const turbo = settingsForModeDefaults(DEFAULT_GAME_SETTINGS, 'turbo');
    const cash = settingsForModeDefaults({ ...DEFAULT_GAME_SETTINGS, ante: 10 }, 'cash');
    expect(tournament.blindLevelLengthHands).toBeGreaterThan(turbo.blindLevelLengthHands);
    expect(cash.blindLevelLengthHands).toBe(0);
    expect(cash.ante).toBe(0);
  });

  it('defaults old tournament saves to a playable schedule', () => {
    expect(normalizeSettings({ gameMode: 'tournament' }).blindLevelLengthHands).toBe(10);
    expect(normalizeSettings({ gameMode: 'turbo' }).blindLevelLengthHands).toBe(4);
  });

  it('keeps every device-only setting reachable in full Settings', () => {
    const all = SETTINGS_SCHEMA.flatMap((s) => s.fields.map((f) => String(f.key)));
    for (const deviceOnly of DEVICE_ONLY_SETTINGS) {
      expect(all, `${deviceOnly} must still be changeable somewhere`).toContain(deviceOnly);
    }
  });

  describe('appearance selections', () => {
    const fields = SETTINGS_SCHEMA.find((section) => section.id === 'appearance')?.fields ?? [];

    it('falls back for saved profiles that predate an appearance option', () => {
      expect(fields.map((field) => field.key)).toEqual(['cardBack', 'feltStyle', 'chipStyle']);
      for (const field of fields) {
        const selected = resolveSettingSelection(field, undefined, []);
        expect(selected, `${String(field.key)} selection`).not.toBeNull();
        expect(selected, `${String(field.key)} selection`).not.toBeUndefined();
      }
    });

    it('falls back when a saved appearance is not currently available', () => {
      for (const field of fields) {
        const selected = resolveSettingSelection(field, 'retired-cosmetic', []);
        const options = availableSettingOptions(field, []);
        expect(options.map((option) => option.value)).toContain(selected);
      }
    });

    it('normalizes retired appearance ids to defaults', () => {
      const normalized = normalizeSettings({
        cardBack: 'equipped',
        feltStyle: 'equipped',
        chipStyle: 'equipped',
      } as never);
      expect(normalized.cardBack).toBe(DEFAULT_GAME_SETTINGS.cardBack);
      expect(normalized.feltStyle).toBe(DEFAULT_GAME_SETTINGS.feltStyle);
      expect(normalized.chipStyle).toBe(DEFAULT_GAME_SETTINGS.chipStyle);
    });
  });
});

describe('cosmetic setting options', () => {
  const field = (key: string) => {
    const found = SETTINGS_SCHEMA
      .flatMap((section) => section.fields)
      .find((candidate) => String(candidate.key) === key);
    expect(found, `${key} field`).toBeDefined();
    return found!;
  };
  const values = (key: string, owned: readonly string[] = []) =>
    availableSettingOptions(field(key), owned).map((option) => option.value);

  /*
   * "Equipped" used to head each of these lists, following whatever was worn
   * in the Store. It was one indirection too many: the setting said Equipped
   * and you had to open another screen to find out what that meant. The
   * pickers now name real felts, backs and chip sets.
   */
  it('starts players with one felt, two backs, and one chip set', () => {
    expect(values('feltStyle')).toEqual(['classic']);
    expect(values('cardBack')).toEqual(['blue', 'red']);
    expect(values('chipStyle')).toEqual(['classic']);
  });

  it('adds bought card backs to Settings without offering unowned ones', () => {
    expect(values('cardBack', ['black', 'card-midnight'])).toEqual([
      'blue',
      'red',
      'black',
      'card-midnight',
    ]);
  });

  it('adds only owned table and chip styles', () => {
    expect(values('feltStyle', ['table-miami', 'table-lunar'])).toEqual([
      'classic',
      'table-miami',
      'table-lunar',
    ]);
    expect(values('chipStyle', ['chips-candy'])).toEqual(['classic', 'chips-candy']);
  });
});
