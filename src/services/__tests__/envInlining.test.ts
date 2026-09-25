import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the bug that made every TestFlight build offline while development
 * worked perfectly.
 *
 * `babel-preset-expo` implements `EXPO_PUBLIC_` variables by replacing the
 * literal text `process.env.EXPO_PUBLIC_SOMETHING` with the value at build
 * time. There is no `process.env` object left in a release bundle, so any
 * indirection, a `readEnv(key)` helper, a computed `process.env[key]` lookup,
 * or even optional chaining through `process.env?.`, leaves a lookup that
 * resolves to nothing once bundled. `isFirebaseConfigured()` then returned
 * false in production, silently disabling online play, friends and sign-in.
 *
 * Reading the source text is the point: this is a syntax requirement of the
 * bundler, so nothing at runtime can detect it.
 */

const SRC = join(__dirname, '..', '..');

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
};

describe('EXPO_PUBLIC env reads', () => {
  const files = sourceFiles(SRC);

  it('finds the app source', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never reads process.env through a computed key', () => {
    const offenders = files.filter((file) => /process\s*\.\s*env\s*(\?\.)?\[/.test(readFileSync(file, 'utf8')));
    expect(offenders, 'computed process.env lookups are not inlined into release bundles').toEqual([]);
  });

  it('never reaches EXPO_PUBLIC values through optional chaining on env', () => {
    const offenders = files.filter((file) => /process\s*\.\s*env\s*\?\./.test(readFileSync(file, 'utf8')));
    expect(offenders, 'process.env?.X may survive the babel inliner and read as unset in release').toEqual([]);
  });

  it('keeps every EXPO_PUBLIC name in a literal member expression', () => {
    const bad: string[] = [];
    const quote = /['"`]/;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) {
        const start = match.index;
        const end = start + match[0].length;
        const before = text.slice(Math.max(0, start - 12), start);
        if (/process\s*\.\s*env\s*\.\s*$/.test(before)) continue;

        // A name that fills a string literal by itself is a lookup key, which
        // is the broken pattern. A name inside a longer sentence is prose, such
        // as an error message telling the user which variables to set.
        if (quote.test(text[start - 1] ?? '') && quote.test(text[end] ?? '')) {
          bad.push(`${file}: ${match[0]}`);
        }
      }
    }
    expect(bad, 'EXPO_PUBLIC names must appear as process.env.NAME to be inlined').toEqual([]);
  });
});
