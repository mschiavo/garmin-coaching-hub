import { inside, isRun, positive, shift, validDate, windowEnding, type ActivityRow, type Period } from './dates.ts';
import type { Covered } from './coverage.ts';
import { distanceBand, distanceLabels, runPace } from './efficiency.ts';

export const coverageNote = 'Le somme descrivono le registrazioni. I confronti richiedono acquisizione conclusa e archivio verificato.';

export function loadTotals(rows: ActivityRow[], period: Period, covered: Covered = () => false) {
  const runs = rows.filter(row => isRun(row) && validDate(row.date) && inside(row.date, period));
  const distances = runs.map(row => row.distance_m).filter(positive);
  const durations = runs.map(row => row.duration_s).filter(positive);
  const km = distances.reduce((sum, value) => sum + value / 1000, 0);
  const hours = durations.reduce((sum, value) => sum + value / 3600, 0);
  const complete = covered(period);
  return {
    complete, distanceComplete: complete && distances.length === runs.length,
    durationComplete: complete && durations.length === runs.length,
    runs: runs.length, active: new Set(runs.map(row => row.date)).size,
    km: Number.isFinite(km) && (distances.length || (complete && !runs.length)) ? km : null,
    hours: Number.isFinite(hours) && (durations.length || (complete && !runs.length)) ? hours : null,
    distanceCount: distances.length, durationCount: durations.length,
  };
}

export function advancedLoad(rows: ActivityRow[], period: Period, covered: Covered = () => false, today?: string) {
  const end = today && period.end >= today ? shift(today, -1) : period.end;
  const last7 = windowEnding(end, 7);
  const last28 = windowEnding(end, 28);
  const preceding = windowEnding(shift(last7.start, -1), 28);
  const totals7 = loadTotals(rows, last7, covered);
  const totals28 = loadTotals(rows, last28, covered);
  const historical = loadTotals(rows, preceding, covered);
  const baseline = historical.distanceComplete && historical.km !== null ? historical.km / 4 : null;
  const ratio = positive(baseline) && totals7.distanceComplete && totals7.km !== null ? totals7.km / baseline : null;
  const reason = !totals7.complete || !historical.complete ? 'Copertura attività insufficiente o giorni in corso' :
    !totals7.distanceComplete || !historical.distanceComplete ? 'Distanze mancanti' : 'Riferimento pari a zero';
  return { last7, last28, preceding, totals7, totals28, baseline, historical,
    ratio: Number.isFinite(ratio) ? ratio : null, reason: ratio === null ? reason : null, selected: loadTotals(rows, period, covered) };
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
