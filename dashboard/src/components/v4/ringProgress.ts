export type RingProgress = { percentage: number; visualPercentage: number };

/** Percent is informational; only the SVG arc is capped at a full circle. */
export function calculateRingProgress(actual: number | null, target: number | null): RingProgress | null {
  if (actual == null || !Number.isFinite(actual) || actual < 0 || target == null || !Number.isFinite(target) || target <= 0) return null;
  const percentage = actual / target * 100;
  if (!Number.isFinite(percentage)) return null;
  return { percentage, visualPercentage: Math.min(percentage, 100) };
}
