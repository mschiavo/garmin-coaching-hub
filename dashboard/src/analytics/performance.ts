import { isRun, positive, validDate, type ActivityRow } from './dates.ts';
import { runPace } from './efficiency.ts';

export const raceDistances = [5, 10, 21.0975];

export function projectRace(reference: ActivityRow | undefined, target: number): number | null {
  if (!reference || !isRun(reference) || !validDate(reference.date) ||
      !positive(reference.distance_m) || !positive(reference.duration_s) || !positive(target)) return null;
  const ratio = target / (reference.distance_m / 1000);
  if (ratio < 1 / 2.5 || ratio > 2.5) return null;
  const result = reference.duration_s * ratio ** 1.06;
  return positive(result) ? result : null;
}

export function bestActivities(rows: ActivityRow[]) {
  const runs = rows.filter(row => isRun(row) && validDate(row.date));
  const best = (value: (row: ActivityRow) => number | null, direction: number) =>
    runs.flatMap(row => {
      const result = value(row);
      return positive(result) ? [{ row, value: result }] : [];
    }).sort((a, b) => direction * (a.value - b.value) || a.row.date.localeCompare(b.row.date) || String(a.row.id).localeCompare(String(b.row.id), 'en', { numeric: true }))[0];
  return { longest: best(row => row.distance_m, -1), duration: best(row => row.duration_s, -1), fastest: best(runPace, 1) };
}
