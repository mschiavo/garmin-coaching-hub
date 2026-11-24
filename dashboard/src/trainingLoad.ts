import { validDate } from './analytics/dates.ts';
export type RunLoadInput = { date: string; distance_m: number | null; duration_s: number | null };
export type TrainingLoadWeek = { week: string; label: string; km: number; hours: number; runs: number; baselineKm: number | null; ratio: number | null; deltaPct: number | null };
const day = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = day(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const monday = (s: string) => { const d = day(s); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); };
/** Weekly distance is a descriptive workload proxy, not a physiological training-load score. */
export function buildTrainingLoad(runs: RunLoadInput[], startDate: string, endDate: string): TrainingLoadWeek[] {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) return [];
  const byWeek = new Map<string, { km: number; hours: number; runs: number }>();
  for (const run of runs) {
    if (!validDate(run.date) || run.date > endDate) continue;
    const w = monday(run.date);
    const current = byWeek.get(w) ?? { km: 0, hours: 0, runs: 0 };
    current.km += typeof run.distance_m === 'number' && Number.isFinite(run.distance_m) && run.distance_m > 0 ? run.distance_m / 1000 : 0;
    current.hours += typeof run.duration_s === 'number' && Number.isFinite(run.duration_s) && run.duration_s > 0 ? run.duration_s / 3600 : 0;
    current.runs++;
    byWeek.set(w, current);
  }
  const first = monday(startDate), last = monday(endDate);
  const weeks: TrainingLoadWeek[] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) {
    const current = byWeek.get(w) ?? { km: 0, hours: 0, runs: 0 };
    const history = [1, 2, 3, 4].map(i => byWeek.get(addDays(w, -7 * i))?.km ?? 0);
    // A baseline is shown only when all four preceding weeks fall within the known data horizon.
    const hasHistory = addDays(w, -28) >= monday(startDate);
    const baselineKm = hasHistory ? history.reduce((a, b) => a + b, 0) / 4 : null;
    const prev = byWeek.get(addDays(w, -7))?.km ?? 0;
    weeks.push({ week: w, label: w.slice(5), km: +current.km.toFixed(2), hours: +current.hours.toFixed(2), runs: current.runs,
      baselineKm: baselineKm == null ? null : +baselineKm.toFixed(2),
      ratio: baselineKm != null && baselineKm > 0 ? +(current.km / baselineKm).toFixed(2) : null,
      deltaPct: w === first || prev <= 0 ? null : +((current.km - prev) / prev * 100).toFixed(1) });
  }
  return weeks;
}
