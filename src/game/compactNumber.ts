/** 1250 -> "1.3k", 2000000 -> "2M". Tick labels have a narrow gutter, not room for "1,250,000". */
export function compactNumber(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const fmt = (n: number, unit: string) => `${sign}${Number(n.toFixed(n < 10 ? 1 : 0))}${unit}`;
  if (abs >= 1_000_000) return fmt(abs / 1_000_000, 'M');
  if (abs >= 1_000) return fmt(abs / 1_000, 'k');
  return `${Math.round(v)}`;
}
