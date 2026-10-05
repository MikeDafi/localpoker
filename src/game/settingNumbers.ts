import type { SettingField } from './settings';

export type NumberSettingOptionField = Pick<SettingField, 'min' | 'max' | 'presets' | 'step'>;

const FALLBACK_VALUE_LIMIT = 8;

export function offeredNumberValues(field: NumberSettingOptionField, currentValue: number): number[] {
  const min = finiteNumber(field.min);
  const max = rangeMax(min, finiteNumber(field.max));
  const sourceValues = hasPresets(field.presets)
    ? [...field.presets]
    : fallbackValues(field, currentValue, min, max);

  if (Number.isFinite(currentValue)) {
    sourceValues.push(currentValue);
  }

  return uniqueSorted(
    sourceValues
      .filter(Number.isFinite)
      .map(cleanNumber)
      .filter((value) => inRange(value, min, max)),
  );
}

function fallbackValues(
  field: NumberSettingOptionField,
  currentValue: number,
  min: number | undefined,
  max: number | undefined,
): number[] {
  const step = positiveStep(field.step);

  if (min !== undefined && max !== undefined) {
    const wholeRangeCount = Math.floor((max - min) / step) + 1;
    if (wholeRangeCount <= FALLBACK_VALUE_LIMIT) {
      const values: number[] = [];
      for (let index = 0; index < wholeRangeCount; index += 1) {
        values.push(cleanNumber(min + index * step));
      }
      values.push(max);
      return values;
    }

    const values = Array.from({ length: FALLBACK_VALUE_LIMIT }, (_, index) => {
      const ratio = index / (FALLBACK_VALUE_LIMIT - 1);
      return clamp(roundToStep(min + (max - min) * ratio, min, step), min, max);
    });
    values.push(min, max);
    return values;
  }

  const center = Number.isFinite(currentValue) ? currentValue : min ?? max ?? 0;
  const base = min ?? center;
  return [-3, -2, -1, 0, 1, 2, 3].map((offset) => roundToStep(center + offset * step, base, step));
}

function hasPresets(presets: readonly number[] | undefined): presets is readonly number[] {
  return Array.isArray(presets) && presets.length > 0;
}

function finiteNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function rangeMax(min: number | undefined, max: number | undefined): number | undefined {
  if (min === undefined || max === undefined) return max;
  return max >= min ? max : undefined;
}

function positiveStep(step: number | undefined): number {
  return typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : 1;
}

function roundToStep(value: number, base: number, step: number): number {
  return cleanNumber(base + Math.round((value - base) / step) * step);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inRange(value: number, min: number | undefined, max: number | undefined): boolean {
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function cleanNumber(value: number): number {
  const cleaned = Number(value.toFixed(10));
  return Object.is(cleaned, -0) ? 0 : cleaned;
}
