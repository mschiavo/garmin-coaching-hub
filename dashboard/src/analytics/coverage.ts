import { shift, validDate, type Period } from './dates.ts';
import type { ActivityRow } from './dates.ts';
import type { Archive, Coverage } from '../dataApi.ts';

export type Covered = (period: Period) => boolean;

export function indexCoverage(archive: Archive | null, today: string) {
  const counts = new Map<string, number>();
  const activityDays = new Set<string>();
  for (const row of archive?.activities ?? []) counts.set(row.date, (counts.get(row.date) ?? 0) + 1);
  if (archive?.metadata && !archive.metadata.anomalies.activities) {
    for (const row of archive.coverage) {
      if (row.source === 'activities' && row.date < today && row.evidence && row.item_count === (counts.get(row.date) ?? 0)) {
        activityDays.add(row.date);
      }
    }
  }
  const covered: Covered = ({ start, end }) => {
    if (!validDate(start) || !validDate(end) || start > end || end >= today ||
        !archive?.acquired || start < archive.acquired.start || end > archive.acquired.end) return false;
    for (let day = start; day <= end; day = shift(day, 1)) {
      if (!activityDays.has(day)) return false;
    }
    return true;
  };
  return covered;
}

export function coverageState(row: Coverage | undefined) {
  return row?.attempt_state ?? 'unknown';
}

export function activityMeasureCounts(rows: ActivityRow[]) {
  return {
    distance: rows.filter(row => row.distance_m !== null && Number.isFinite(row.distance_m) && row.distance_m > 0).length,
    duration: rows.filter(row => row.duration_s !== null && Number.isFinite(row.duration_s) && row.duration_s > 0).length,
    heartRate: rows.filter(row => row.average_hr !== null && Number.isFinite(row.average_hr) && row.average_hr > 0).length,
  };
}
