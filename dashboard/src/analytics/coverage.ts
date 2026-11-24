import { shift, validDate, type Period } from './dates.ts';
import type { ActivityRow } from './dates.ts';
import type { Archive, Coverage } from '../dataApi.ts';

export type Covered = (period: Period) => boolean;
export type Reliability = 'verified' | 'historical' | 'conflict' | 'partial' | 'unknown';

export function reliability(
  row: Coverage | undefined, day: string, today: string, recorded: number, capable: boolean
): { state: Reliability; reason: string } {
  if (day >= today) return { state: 'partial', reason: 'Giornata in corso' };
  if (!row) return { state: 'unknown', reason: 'Nessun tentativo registrato' };
  if (capable && row.reconciliation === 'conflict') {
    return { state: 'conflict', reason: 'Attività archiviate assenti nella ricerca. Verifica mirata consigliata.' };
  }
  if (capable && row.reconciliation === 'invalidated') {
    return { state: 'conflict', reason: 'Archivio modificato. Ripeti la verifica per questa giornata.' };
  }
  if (row.evidence === null) {
    return { state: 'partial', reason: 'Manca un’acquisizione conclusa con evidenza' };
  }
  if (row.attempt_state !== row.evidence || row.succeeded_at == null) {
    return { state: 'historical', reason: 'L’ultimo tentativo è incompleto o fallito' };
  }
  if (!capable || row.reconciliation !== 'verified') {
    return { state: 'historical', reason: 'Concordanza con l’archivio da verificare' };
  }
  if (row.item_count !== recorded || row.observed_count !== recorded || row.missing_count !== 0) {
    return { state: 'conflict', reason: 'Conteggi incoerenti. Ripeti la verifica per questa giornata.' };
  }
  return { state: 'verified', reason: 'Acquisizione conclusa e archivio concordante' };
}

export function indexCoverage(archive: Archive | null, today: string) {
  const counts = new Map<string, number>();
  const activityDays = new Set<string>();
  for (const row of archive?.activities ?? []) counts.set(row.date, (counts.get(row.date) ?? 0) + 1);
  if (archive?.metadata && !archive.metadata.anomalies.activities) {
    for (const row of archive.coverage) {
      if (row.source === 'activities' &&
          reliability(row, row.date, today, counts.get(row.date) ?? 0, archive.metadata.reliability_version === 1).state === 'verified') {
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
