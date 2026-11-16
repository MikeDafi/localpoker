import { describe, expect, it } from 'vitest';
import { compactNumber } from '../compactNumber';

describe('compactNumber', () => {
  it('keeps small stacks exact and shortens large ones', () => {
    expect(compactNumber(950)).toBe('950');
    expect(compactNumber(1250)).toBe('1.3k');
    expect(compactNumber(25000)).toBe('25k');
    expect(compactNumber(2_000_000)).toBe('2M');
    expect(compactNumber(-1500)).toBe('-1.5k');
  });
});
