import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateActivityMetric, assessActivityCoverage, calculateGoalProgress, civilDateRange,
  countCompletedSessions, isoWeekStart, validateGoalDefinition,
} from '../src/analytics/goals.ts';

const distanceGoal = { metric: 'distance', target: 40000, unit: 'm' };
const complete = { coverage: 'available', zeroAttested: false };
const evidence = (day, empty = false) => ({ day, source: 'activities',
  attempt_state: empty ? 'success_empty' : 'success_with_data',
  evidence: empty ? 'success_empty' : 'success_with_data', item_count: empty ? 0 : 1, reconciliation: 'verified' });
const activity = (id, date, distance_m, duration_s = 1800) => ({ id, date, distance_m, duration_s });

test('goal contracts accept only supported metrics, exact units and positive safe targets', () => {
  assert.equal(validateGoalDefinition(distanceGoal), true);
  assert.equal(validateGoalDefinition({ metric: 'duration', target: 1800, unit: 's' }), true);
  assert.equal(validateGoalDefinition({ metric: 'sessions', target: 4, unit: 'sessions' }), true);
  assert.equal(validateGoalDefinition({ metric: 'sessions', target: 0, unit: 'sessions' }), true);
  assert.equal(validateGoalDefinition({ metric: 'race_time', target: 9000, unit: 's' }), true);
  for (const goal of [
    { ...distanceGoal, target: 0 }, { ...distanceGoal, target: -1 },
    { ...distanceGoal, target: Infinity }, { ...distanceGoal, unit: 'km' },
    { metric: 'sessions', target: 1.5, unit: 'sessions' },
    { metric: 'days_active', target: 3, unit: 'sessions' },
  ]) assert.equal(validateGoalDefinition(goal), false);
});

test('zero session target is representable but has no progress percentage', () => {
  const result = calculateGoalProgress({ metric: 'sessions', target: 0, unit: 'sessions' }, {
    actual: 0, coverage: 'available', zeroAttested: true,
  });
  assert.equal(result.status, 'available');
  assert.equal(result.gap, 0);
  assert.equal(result.progressPct, null);
});

test('coverage gates zero: null, unverified zero, and verified empty are distinct', () => {
  const missing = calculateGoalProgress(distanceGoal, { actual: null, coverage: 'unknown' });
  assert.equal(missing.status, 'unknown');
  assert.equal(missing.actual, null);
  assert.equal(missing.progressPct, null);
  const unverifiedZero = calculateGoalProgress(distanceGoal, { actual: 0, coverage: 'available' });
  assert.equal(unverifiedZero.actual, null);
  assert.equal(unverifiedZero.gap, null);
  const empty = calculateGoalProgress(distanceGoal, { actual: 0, coverage: 'available', zeroAttested: true });
  assert.equal(empty.actual, 0);
  assert.equal(empty.progressPct, 0);
  assert.equal(empty.gap, -40000);
});

test('partial observed amounts stay visible but cannot claim a goal percentage or gap', () => {
  const progress = calculateGoalProgress(distanceGoal, { actual: 12000, coverage: 'partial' });
  assert.equal(progress.status, 'partial');
  assert.equal(progress.actual, 12000);
  assert.equal(progress.progressPct, null);
  assert.equal(progress.gap, null);
});

test('over-target percentage remains above 100 and manual sessions stay separate', () => {
  const progress = calculateGoalProgress(distanceGoal, { actual: 45000, ...complete, manualCompletedSessions: 2 });
  assert.equal(progress.progressPct, 112.5);
  assert.equal(progress.gap, 5000);
  assert.equal(progress.manualCompletedSessions, 2);
});

test('mismatched units, invalid targets and non-finite arithmetic fail closed', () => {
  for (const goal of [{ ...distanceGoal, unit: 's' }, { ...distanceGoal, target: Number.MIN_VALUE }]) {
    const result = calculateGoalProgress(goal, { actual: 1, ...complete });
    assert.equal(result.status, 'invalid');
    assert.equal(result.target, null);
    assert.equal(result.progressPct, null);
  }
  assert.equal(calculateGoalProgress(distanceGoal, { actual: -1, ...complete }).actual, null);
  assert.equal(calculateGoalProgress(distanceGoal, { actual: 1, ...complete, manualCompletedSessions: -1 }).status, 'invalid');
  assert.equal(calculateGoalProgress(distanceGoal, { actual: 1, ...complete, plannedToDate: Infinity, periodOpen: true }).status, 'invalid');
});

test('race time is lower-is-better gap in seconds and never a percentage', () => {
  const goal = { metric: 'race_time', target: 13500, unit: 's' };
  const slower = calculateGoalProgress(goal, { actual: 13800, ...complete });
  const faster = calculateGoalProgress(goal, { actual: 13200, ...complete });
  assert.equal(slower.gap, 300);
  assert.equal(faster.gap, -300);
  assert.equal(slower.progressPct, null);
  assert.equal(faster.progressPct, null);
});

test('open periods compare actual to explicit planned-to-date only', () => {
  const progress = calculateGoalProgress(distanceGoal, {
    actual: 18000, coverage: 'available', periodOpen: true, plannedToDate: 25000,
  });
  assert.equal(progress.progressPct, 45);
  assert.equal(progress.plannedToDate, 25000);
  assert.equal(progress.actualToDateGap, -7000);
  const withoutPlan = calculateGoalProgress(distanceGoal, {
    actual: 18000, coverage: 'available', periodOpen: true, plannedToDate: null,
  });
  assert.equal(withoutPlan.actualToDateGap, null);
});

test('activity coverage requires every local day to have reconciled evidence', () => {
  const period = { start: '2026-03-28', end: '2026-03-30' };
  const allEmpty = assessActivityCoverage(period, [evidence('2026-03-28', true), evidence('2026-03-29', true), evidence('2026-03-30', true)]);
  assert.deepEqual(allEmpty, { state: 'available', expectedDays: 3, verifiedDays: 3, zeroAttested: true });
  assert.equal(assessActivityCoverage(period, [evidence('2026-03-28', true)]).state, 'partial');
  assert.equal(assessActivityCoverage(period, []).state, 'unknown');
  assert.equal(assessActivityCoverage(period, [
    evidence('2026-03-28', true), { ...evidence('2026-03-29'), reconciliation: null }, evidence('2026-03-30', true),
  ]).zeroAttested, false);
  assert.equal(assessActivityCoverage(period, [
    evidence('2026-03-28', true), { ...evidence('2026-03-29'), reconciliation: 'invalidated' }, evidence('2026-03-30', true),
  ]).state, 'invalid');
  assert.equal(assessActivityCoverage(period, [evidence('2026-03-28', true), evidence('2026-03-28', true)]).state, 'invalid');
});

test('unique bigint activity IDs are deduplicated and conflicting duplicates excluded', () => {
  const id = '9007199254740993';
  const rows = [activity(id, '2026-01-05', 10000), activity(id, '2026-01-05', 10000), activity('42', '2026-01-06', 5000)];
  assert.deepEqual(aggregateActivityMetric(rows, 'distance', { start: '2026-01-05', end: '2026-01-07' }), {
    value: 15000, activityCount: 2, duplicateCount: 1, invalidCount: 0, partial: false,
  });
  const conflict = aggregateActivityMetric([activity(id, '2026-01-05', 10000), activity(id, '2026-01-05', 12000)], 'distance', { start: '2026-01-05', end: '2026-01-05' });
  assert.equal(conflict.value, 0);
  assert.equal(conflict.activityCount, 0);
  assert.equal(conflict.partial, true);
});

test('manual-only completion is reported separately from verified sessions', () => {
  const counts = countCompletedSessions([
    { id: 'a', status: 'completed', completion: 'manual' },
    { id: 'b', status: 'completed', completion: 'verified' },
    { id: 'c', status: 'planned', completion: null },
    { id: 'd', status: 'completed', completion: 'manual' },
  ]);
  assert.deepEqual(counts, { verified: 1, manual: 2, ambiguous: 0 });
  assert.equal(calculateGoalProgress({ metric: 'sessions', target: 4, unit: 'sessions' }, {
    actual: counts.verified, coverage: 'available', manualCompletedSessions: counts.manual,
  }).actual, 1);
});

test('civil dates and ISO weeks remain stable across a DST transition', () => {
  assert.deepEqual(civilDateRange({ start: '2026-03-28', end: '2026-03-30' }), ['2026-03-28', '2026-03-29', '2026-03-30']);
  assert.equal(isoWeekStart('2026-03-29'), '2026-03-23');
  assert.equal(isoWeekStart('2026-03-30'), '2026-03-30');
  assert.equal(civilDateRange({ start: '2026-03-30', end: '2026-03-29' }), null);
});
