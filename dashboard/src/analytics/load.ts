import { inside, isRun, positive, shift, validDate, windowEnding, type ActivityRow, type Period } from './dates.ts';
import { distanceBand, distanceLabels, runPace } from './efficiency.ts';

export const coverageNote = 'Dati registrati; completezza import non verificabile.';

export function loadTotals(rows: ActivityRow[], period: Period) {
  const runs = rows.filter(row => isRun(row) && validDate(row.date) && inside(row.date, period));
  const distances = runs.map(row => row.distance_m).filter(positive);
  const durations = runs.map(row => row.duration_s).filter(positive);
  const km = distances.reduce((sum, value) => sum + value / 1000, 0);
  const hours = durations.reduce((sum, value) => sum + value / 3600, 0);
  return {
    runs: runs.length, active: new Set(runs.map(row => row.date)).size,
    km: Number.isFinite(km) && (distances.length || !runs.length) ? km : null,
    hours: Number.isFinite(hours) && (durations.length || !runs.length) ? hours : null,
    distanceCount: distances.length, durationCount: durations.length,
  };
}

export function advancedLoad(rows: ActivityRow[], period: Period, observed: Period) {
  const last7 = windowEnding(period.end, 7);
  const last28 = windowEnding(period.end, 28);
  const preceding = windowEnding(shift(last7.start, -1), 28);
  const totals7 = loadTotals(rows, last7);
  const totals28 = loadTotals(rows, last28);
  const historical = observed.start <= preceding.start && observed.end >= period.end ? loadTotals(rows, preceding) : null;
  const baseline = historical?.km != null ? historical.km / 4 : null;
  const ratio = positive(baseline) && totals7.km !== null ? totals7.km / baseline : null;
  return { last7, last28, preceding, totals7, totals28, baseline, historical,
    ratio: Number.isFinite(ratio) ? ratio : null, selected: loadTotals(rows, period) };
}

export function loadDistribution(rows: ActivityRow[], period: Period) {
  const paceLabels = ['<4 min/km', '4–<5 min/km', '5–<6 min/km', '6–<7 min/km', '≥7 min/km'];
  const distances = distanceLabels.map(label => ({ label, count: 0 }));
  const paces = paceLabels.map(label => ({ label, count: 0 }));
  for (const row of rows) {
    if (!isRun(row) || !validDate(row.date) || !inside(row.date, period)) continue;
    if (positive(row.distance_m)) distances[distanceBand(row.distance_m / 1000)].count++;
    const pace = runPace(row);
    if (positive(pace)) paces[[240, 300, 360, 420, Infinity].findIndex(limit => pace < limit)].count++;
  }
  return { distances, paces };
}
