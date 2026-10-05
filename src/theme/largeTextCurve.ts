export const LARGE_TEXT_TARGET_FLOOR = 16;
export const LARGE_TEXT_FLOOR_STRENGTH = 0.65;

export interface LargeTextCurveOptions {
  floor?: number;
  strength?: number;
}

const cleanFloor = (floor: number | undefined): number =>
  typeof floor === 'number' && Number.isFinite(floor) && floor > 0 ? floor : LARGE_TEXT_TARGET_FLOOR;

const cleanStrength = (strength: number | undefined): number => {
  if (typeof strength !== 'number' || !Number.isFinite(strength)) return LARGE_TEXT_FLOOR_STRENGTH;
  return Math.max(0, Math.min(1, strength));
};

/**
 * Lift tiny labels toward a readable floor instead of multiplying everything.
 *
 * A flat multiplier makes already-large headings biggest, which is exactly
 * where the layout has the least spare room. This curve gives sizes below the
 * floor a fraction of their missing headroom, then clamps at the original
 * size so nothing shrinks. It is monotonic because the below-floor segment is
 * linear and the above-floor segment is identity.
 */
export function scaleLargeTextSize(size: number, options: LargeTextCurveOptions = {}): number {
  if (!Number.isFinite(size) || size <= 0) return size;
  const floor = cleanFloor(options.floor);
  const strength = cleanStrength(options.strength);
  if (size >= floor || strength <= 0) return size;
  return Math.max(size, size + (floor - size) * strength);
}
