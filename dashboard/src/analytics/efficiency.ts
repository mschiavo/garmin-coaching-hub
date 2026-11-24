import { inside, isRun, median, monday, positive, shift, validDate, weeks, type ActivityRow, type Period } from './dates.ts';

export const distanceLabels = ['<3 km', '3–<5 km', '5–<10 km', '10–<15 km', '15–<22 km', '≥22 km'];
export const distanceBand = (km: number) => [3, 5, 10, 15, 22, Infinity].findIndex(limit => km < limit);
export type Cohort = { type: string; distance: number; heart: number };

export function runPace(row: ActivityRow): number | null {
  if (!positive(row.distance_m) || !positive(row.duration_s)) return null;
  const pace = (row.duration_s / row.distance_m) * 1000;
  return positive(pace) ? pace : null;
}

export function efficiency(rows: ActivityRow[]) {
  return rows.flatMap(row => {
    const pace = runPace(row);
    if (!isRun(row) || !validDate(row.date) || !positive(pace) || !positive(row.average_hr) || !positive(row.distance_m) ||
        row.average_hr < 20 || row.average_hr > 250 || pace < 100 || pace > 3600) return [];
    const speed = 3600 / pace;
    const index = speed / row.average_hr;
    if (!positive(speed) || !positive(index)) return [];
    return [{ row, pace, speed, index, hr: row.average_hr, cohort: {
      type: row.type, distance: distanceBand(row.distance_m / 1000), heart: Math.floor(row.average_hr / 10) * 10,
    } }];
  });
}

export type EfficientRun = ReturnType<typeof efficiency>[number];
export const cohortKey = (cohort: Cohort) => [cohort.type, cohort.distance, cohort.heart].join('/');

export function weeklyEfficiency(runs: EfficientRun[], period: Period) {
  const grouped = new Map<string, EfficientRun[]>();
  for (const run of runs) {
    if (!inside(run.row.date, period)) continue;
    const week = monday(run.row.date);
    const sample = grouped.get(week);
    if (sample) sample.push(run);
    else grouped.set(week, [run]);
  }
  return weeks(period).map(week => {
    const sample = grouped.get(week) ?? [];
    return {
      date: week, count: sample.length, index: median(sample.map(run => run.index)),
      pace: median(sample.map(run => run.pace)), hr: median(sample.map(run => run.hr)),
    };
  });
}

export function efficiencyChange(runs: EfficientRun[], lastWeek: string) {
  const sample = (offset: number) => runs.filter(run => inside(run.row.date, {
    start: shift(lastWeek, offset - 21), end: shift(lastWeek, offset + 6),
  }));
  const recent = sample(0);
  const previous = sample(-28);
  const baseline = median(previous.map(run => run.index));
  const current = median(recent.map(run => run.index));
  const change = recent.length >= 3 && previous.length >= 3 && positive(baseline) && positive(current)
    ? 100 * (current / baseline - 1) : null;
  return { recent: recent.length, previous: previous.length, change: Number.isFinite(change) ? change : null };
}
