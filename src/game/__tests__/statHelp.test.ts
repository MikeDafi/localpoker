import { describe, expect, it } from 'vitest';
import {
  LIVE_STAT_KEYS,
  OPPONENT_STAT_KEYS,
  PROFILE_STAT_KEYS,
  STAT_HELP,
  statHelpText,
  type StatHelp,
  type StatKey,
} from '../statHelp';

const ALL_SURFACES: [string, StatKey[]][] = [
  ['live stats overlay', LIVE_STAT_KEYS],
  ['profile stats screen', PROFILE_STAT_KEYS],
  ['opponent read', OPPONENT_STAT_KEYS],
];

describe('stat explanations', () => {
  it.each(ALL_SURFACES)('explains every stat shown on the %s', (_surface, keys) => {
    for (const key of keys) {
      expect(STAT_HELP[key], `no help for ${key}`).toBeDefined();
      const text = statHelpText(key);
      // Long enough to actually say something, and a real sentence.
      expect(text.length, `help for ${key} is too thin`).toBeGreaterThan(40);
      expect(text.trim().endsWith('.'), `help for ${key} should be a sentence`).toBe(true);
    }
  });

  it('spells out every acronym it uses', () => {
    for (const key of Object.keys(STAT_HELP) as StatKey[]) {
      const { label, expands }: StatHelp = STAT_HELP[key];
      // A label that is all capitals is an acronym and has to be expanded.
      if (/^[A-Z]{2,}$/.test(label)) {
        expect(expands, `${label} is an acronym with no expansion`).toBeTruthy();
        expect(statHelpText(key).startsWith(`${expands}.`)).toBe(true);
      }
    }
  });

  it('shows no stat without listing it somewhere', () => {
    const shown = new Set([...LIVE_STAT_KEYS, ...PROFILE_STAT_KEYS, ...OPPONENT_STAT_KEYS, 'winChance']);
    for (const key of Object.keys(STAT_HELP)) {
      expect(shown.has(key as StatKey), `${key} has help but is never displayed`).toBe(true);
    }
  });

  it('keeps each surface free of duplicates', () => {
    for (const [surface, keys] of ALL_SURFACES) {
      expect(new Set(keys).size, `${surface} lists a stat twice`).toBe(keys.length);
    }
  });
});
