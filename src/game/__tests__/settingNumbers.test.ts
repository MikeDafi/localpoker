import { describe, expect, it } from 'vitest';

import { offeredNumberValues, type NumberSettingOptionField } from '../settingNumbers';

describe('offeredNumberValues', () => {
  it('inserts the current value in sorted order when presets do not contain it', () => {
    const field: NumberSettingOptionField = {
      min: 1,
      max: 10,
      step: 1,
      presets: [1, 2, 5, 10],
    };

    expect(offeredNumberValues(field, 3)).toEqual([1, 2, 3, 5, 10]);
  });

  it('drops preset values outside min and max', () => {
    const field: NumberSettingOptionField = {
      min: 1,
      max: 10,
      step: 1,
      presets: [0, 1, 5, 10, 20],
    };

    expect(offeredNumberValues(field, 5)).toEqual([1, 5, 10]);
  });

  it('builds a usable ladder when a field has no presets', () => {
    const field: NumberSettingOptionField = {
      min: 5,
      max: 60,
      step: 5,
    };

    const values = offeredNumberValues(field, 20);

    expect(values.length).toBeGreaterThan(0);
    expect(values.length).toBeLessThanOrEqual(9);
    expect(values).toContain(5);
    expect(values).toContain(20);
    expect(values).toContain(60);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});
