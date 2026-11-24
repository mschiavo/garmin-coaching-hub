import type { Covered } from './analytics/coverage.ts';
import { positive, validDate } from './analytics/dates.ts';
export type RunLoadInput = { date: string; distance_m: number | null; duration_s: number | null };
export type TrainingLoadWeek = { week: string; label: string; km: number | null; hours: number | null; runs: number; distanceCount: number; durationCount: number; baselineKm: number | null; ratio: number | null; deltaPct: number | null };
const day = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = day(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const monday = (s: string) => { const d = day(s); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); };
/** Weekly distance is a descriptive workload proxy, not a physiological training-load score. */
export function buildTrainingLoad(runs: RunLoadInput[], startDate: string, endDate: string, covered: Covered = () => false): TrainingLoadWeek[] {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) return [];
  const empty = { km: 0, hours: 0, runs: 0, distanceCount: 0, durationCount: 0 };
  const byWeek = new Map<string, typeof empty>();
  const first = monday(startDate), last = monday(endDate);
  const firstSelected = { ...empty };
  function add(total: typeof empty, run: RunLoadInput) {
    if (positive(run.distance_m)) { total.km += run.distance_m / 1000; total.distanceCount++; }
    if (positive(run.duration_s)) { total.hours += run.duration_s / 3600; total.durationCount++; }
    total.runs++;
  }
  for (const run of runs) {
    if (!validDate(run.date) || run.date > endDate) continue;
    const w = monday(run.date);
    const current = byWeek.get(w) ?? { ...empty };
    add(current, run);
    if (w === first && run.date >= startDate) add(firstSelected, run);
    byWeek.set(w, current);
  }
  const weeks: TrainingLoadWeek[] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) {
    const start = w < startDate ? startDate : w;
    const sunday = addDays(w, 6);
    const end = sunday > endDate ? endDate : sunday;
    const full = start === w && end === sunday && covered({ start, end });
    const current = w === first ? firstSelected : byWeek.get(w) ?? empty;
    const historical = (week: string) => {
      const total = byWeek.get(week) ?? empty;
      return covered({ start: week, end: addDays(week, 6) }) && total.distanceCount === total.runs ? total.km : null;
    };
    const history = [1,2,3,4].map(i => historical(addDays(w, -7 * i)));
    const comparable = full && current.distanceCount === current.runs;
    const baselineKm = comparable && history.every(km => km !== null)
      ? history.reduce<number>((sum, km) => sum + (km ?? 0), 0) / 4 : null;
    const prev = historical(addDays(w, -7));
    weeks.push({ week: w, label: w.slice(5),
      km: current.distanceCount || (full && !current.runs) ? +current.km.toFixed(2) : null,
      hours: current.durationCount || (full && !current.runs) ? +current.hours.toFixed(2) : null,
      runs: current.runs, distanceCount: current.distanceCount, durationCount: current.durationCount,
      baselineKm: baselineKm == null ? null : +baselineKm.toFixed(2),
      ratio: positive(baselineKm) ? +(current.km / baselineKm).toFixed(2) : null,
      deltaPct: comparable && positive(prev) ? +((current.km - prev) / prev * 100).toFixed(1) : null });
  }
  return weeks;
}
