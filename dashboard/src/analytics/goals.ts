import { shift, validDate, type Period } from './dates.ts';

export type GoalMetric = 'distance' | 'duration' | 'sessions' | 'race_time';
export type GoalUnit = 'm' | 's' | 'sessions';
export type CoverageState = 'available' | 'partial' | 'unknown' | 'invalid';
export type GoalDefinition = {
  metric: GoalMetric;
  target: number;
  unit: GoalUnit;
};
export type GoalObservation = {
  actual: number | null;
  coverage: CoverageState;
  /** True only when the complete activity window has verified success_empty evidence. */
  zeroAttested?: boolean;
  periodOpen?: boolean;
  plannedToDate?: number | null;
  manualCompletedSessions?: number;
};
export type GoalProgress = {
  status: CoverageState;
  actual: number | null;
  target: number | null;
  unit: GoalUnit;
  gap: number | null;
  progressPct: number | null;
  plannedToDate: number | null;
  actualToDateGap: number | null;
  manualCompletedSessions: number;
};

const maxExactQuantity = Number.MAX_SAFE_INTEGER;
const expectedUnit: Record<GoalMetric, GoalUnit> = {
  distance: 'm', duration: 's', sessions: 'sessions', race_time: 's',
};
const quantity = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= maxExactQuantity;

export function validateGoalDefinition(value: GoalDefinition): boolean {
  if (!value || !Object.hasOwn(expectedUnit, value.metric) || value.unit !== expectedUnit[value.metric]) return false;
  if (!Number.isFinite(value.target) || value.target < 0 || value.target > maxExactQuantity) return false;
  if (value.metric === 'sessions') return Number.isSafeInteger(value.target);
  return value.target > 0;
}

/**
 * Progress is available only for a fully covered observation. An observed partial
 * sum may be displayed, but it cannot produce a gap/percentage. Zero is retained
 * only when the caller can prove an all-days, reconciled success_empty window.
 */
export function calculateGoalProgress(goal: GoalDefinition, observation: GoalObservation): GoalProgress {
  const manualCountProvided = observation.manualCompletedSessions !== undefined;
  const manualCountValid = !manualCountProvided || (Number.isSafeInteger(observation.manualCompletedSessions) &&
    (observation.manualCompletedSessions ?? -1) >= 0);
  const manualCompletedSessions = manualCountValid ? observation.manualCompletedSessions ?? 0 : 0;
  const unavailable: GoalProgress = {
    status: 'invalid', actual: null, target: null, unit: goal?.unit ?? 'm', gap: null,
    progressPct: null, plannedToDate: null, actualToDateGap: null, manualCompletedSessions,
  };
  if (!validateGoalDefinition(goal) || !manualCountValid || !['available', 'partial', 'unknown', 'invalid'].includes(observation.coverage)) return unavailable;
  if (observation.coverage === 'invalid') return { ...unavailable, unit: goal.unit };

  const actualProvided = observation.actual !== null;
  const actualValid = observation.actual !== null && quantity(observation.actual) &&
    (goal.metric !== 'sessions' || Number.isSafeInteger(observation.actual));
  if (actualProvided && !actualValid) return { ...unavailable, unit: goal.unit };
  const zeroIsVerified = observation.actual !== 0 || observation.zeroAttested === true;
  const actual = actualValid && zeroIsVerified ? observation.actual : null;
  const canCalculate = observation.coverage === 'available' && actual !== null;
  const plannedProvided = observation.plannedToDate !== null && observation.plannedToDate !== undefined;
  const plannedValid = !plannedProvided || (quantity(observation.plannedToDate!) &&
    (goal.metric !== 'sessions' || Number.isSafeInteger(observation.plannedToDate)));
  if (!plannedValid) return { ...unavailable, unit: goal.unit };
  const planned = observation.periodOpen && observation.plannedToDate !== null &&
    observation.plannedToDate !== undefined && quantity(observation.plannedToDate) &&
    (goal.metric !== 'sessions' || Number.isSafeInteger(observation.plannedToDate))
    ? observation.plannedToDate : null;
  const rawGap = canCalculate ? actual! - goal.target : null;
  const rawPct = canCalculate && goal.metric !== 'race_time' && goal.target > 0 ? actual! / goal.target * 100 : null;
  const planGap = canCalculate && planned !== null ? actual! - planned : null;
  if ([rawGap, rawPct, planGap].some(value => value !== null && !Number.isFinite(value))) {
    return { ...unavailable, unit: goal.unit };
  }
  const status: CoverageState = canCalculate ? 'available'
    : actual !== null ? 'partial' : observation.coverage === 'available' ? 'unknown' : observation.coverage;
  return {
    status,
    actual,
    target: goal.target,
    unit: goal.unit,
    gap: rawGap,
    progressPct: rawPct,
    plannedToDate: planned,
    actualToDateGap: planGap,
    manualCompletedSessions,
  };
}

export type ActivityCoverageEvidence = {
  day: string;
  source?: 'activities';
  attempt_state: string;
  evidence: string | null;
  item_count: number | null;
  reconciliation: string | null;
};
export type ActivityCoverageAssessment = {
  state: CoverageState;
  expectedDays: number;
  verifiedDays: number;
  zeroAttested: boolean;
};

function activityEvidenceIsVerified(row: ActivityCoverageEvidence): boolean {
  if (row.reconciliation !== 'verified') return false;
  if (row.attempt_state === 'success_empty') {
    return row.evidence === 'success_empty' && row.item_count === 0;
  }
  return row.attempt_state === 'success_with_data' && row.evidence === 'success_with_data' &&
    Number.isSafeInteger(row.item_count) && (row.item_count ?? 0) > 0;
}

/** Coverage is complete only when every civil day has a reconciled activities row. */
export function assessActivityCoverage(period: Period, rows: ActivityCoverageEvidence[]): ActivityCoverageAssessment {
  const invalid: ActivityCoverageAssessment = { state: 'invalid', expectedDays: 0, verifiedDays: 0, zeroAttested: false };
  if (!validDate(period.start) || !validDate(period.end) || period.start > period.end) return invalid;
  const days: string[] = [];
  for (let day = period.start; day <= period.end && days.length <= 3660; day = shift(day, 1)) days.push(day);
  if (days.length > 3660) return invalid;
  const byDay = new Map<string, ActivityCoverageEvidence>();
  for (const row of rows) {
    if (row.source && row.source !== 'activities') continue;
    if (!validDate(row.day) || row.day < period.start || row.day > period.end) continue;
    if (byDay.has(row.day)) return invalid;
    byDay.set(row.day, row);
  }
  const evidence = days.map(day => byDay.get(day));
  if (evidence.some(row => row?.reconciliation === 'conflict' || row?.reconciliation === 'invalidated')) {
    return { ...invalid, expectedDays: days.length };
  }
  const verified = evidence.filter((row): row is ActivityCoverageEvidence => !!row && activityEvidenceIsVerified(row));
  const allVerified = verified.length === days.length;
  const zeroAttested = allVerified && verified.every(row => row.attempt_state === 'success_empty');
  return {
    state: allVerified ? 'available' : verified.length ? 'partial' : 'unknown',
    expectedDays: days.length,
    verifiedDays: verified.length,
    zeroAttested,
  };
}

export type ActivityMetricRow = {
  id: string;
  date: string | null;
  distance_m: number | null;
  duration_s: number | null;
};
export type ActivityAggregate = {
  value: number | null;
  activityCount: number;
  duplicateCount: number;
  invalidCount: number;
  partial: boolean;
};

const validActivityId = (id: string): boolean => {
  if (!/^[1-9][0-9]{0,18}$/.test(id)) return false;
  try { return BigInt(id) <= 9223372036854775807n; } catch { return false; }
};

/** Aggregate unique Garmin source IDs in the inclusive local-date range. */
export function aggregateActivityMetric(
  rows: ActivityMetricRow[], metric: 'distance' | 'duration', period: Period,
): ActivityAggregate {
  if (!validDate(period.start) || !validDate(period.end) || period.start > period.end) {
    return { value: null, activityCount: 0, duplicateCount: 0, invalidCount: rows.length, partial: true };
  }
  const field = metric === 'distance' ? 'distance_m' : 'duration_s';
  const unique = new Map<string, { date: string; value: number }>();
  const conflicted = new Set<string>();
  let duplicateCount = 0;
  let invalidCount = 0;
  let partial = false;
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !validActivityId(row.id)) { invalidCount++; partial = true; continue; }
    if (row.date === null || !validDate(row.date)) { invalidCount++; partial = true; continue; }
    if (row.date < period.start || row.date > period.end) continue;
    const value = row[field];
    if (value === null || !quantity(value)) { invalidCount++; partial = true; continue; }
    if (conflicted.has(row.id)) { duplicateCount++; partial = true; continue; }
    const prior = unique.get(row.id);
    if (!prior) { unique.set(row.id, { date: row.date, value }); continue; }
    duplicateCount++;
    if (prior.date !== row.date || prior.value !== value) {
      unique.delete(row.id);
      conflicted.add(row.id);
      invalidCount++;
      partial = true;
    }
  }
  const value = [...unique.values()].reduce((sum, row) => sum + row.value, 0);
  if (!Number.isFinite(value) || value > maxExactQuantity) {
    return { value: null, activityCount: 0, duplicateCount, invalidCount: invalidCount + unique.size, partial: true };
  }
  return { value, activityCount: unique.size, duplicateCount, invalidCount, partial };
}

export type SessionCompletion = { id: string; status: string; completion: 'verified' | 'manual' | null };
export type SessionCompletionCounts = { verified: number; manual: number; ambiguous: number };

/** Manual completion is reported separately and never increments verified sessions. */
export function countCompletedSessions(rows: SessionCompletion[]): SessionCompletionCounts {
  const byId = new Map<string, 'verified' | 'manual'>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id || row.status !== 'completed' || !row.completion) continue;
    const prior = byId.get(row.id);
    if (prior && prior !== row.completion) { byId.delete(row.id); ambiguous.add(row.id); }
    else if (!ambiguous.has(row.id)) byId.set(row.id, row.completion);
  }
  return {
    verified: [...byId.values()].filter(value => value === 'verified').length,
    manual: [...byId.values()].filter(value => value === 'manual').length,
    ambiguous: ambiguous.size,
  };
}

/** Civil calendar helper: independent of host timezone and DST transitions. */
export function isoWeekStart(date: string): string | null {
  if (!validDate(date)) return null;
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return shift(date, -((weekday + 6) % 7));
}

export function civilDateRange(period: Period): string[] | null {
  if (!validDate(period.start) || !validDate(period.end) || period.start > period.end) return null;
  const result: string[] = [];
  for (let day = period.start; day <= period.end && result.length <= 3660; day = shift(day, 1)) result.push(day);
  return result.length > 3660 ? null : result;
}
