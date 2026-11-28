import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTraining, COACHING_RULESET_VERSION } from '../src/analytics/coaching.ts';

const referenceDate = '2026-11-28';
const cycle = { id: 'cycle-1', start: '2026-11-01', end: '2026-12-31', provenance: 'synthetic fixture' };
const workouts = [
  { id: 'easy-1', date: '2026-11-23', title: 'Easy', kind: 'easy', durationMinutes: 35, intensity: 'easy', status: 'planned' },
  { id: 'quality-1', date: '2026-11-25', title: 'Intervals', kind: 'quality', durationMinutes: 45, intensity: 'hard', status: 'planned' },
  { id: 'future-quality', date: '2026-11-30', title: 'Tempo', kind: 'quality', durationMinutes: 50, intensity: 'hard', status: 'planned' },
];
const activity = (id, date, plannedWorkoutId) => ({ id, date, type: 'running', name: 'Run', distance_m: 7000, duration_s: 2400, average_hr: 140, plannedWorkoutId });
const coveredDays = ['2026-11-23', '2026-11-25'].map(date => ({ date, status: 'available', source: 'synthetic' }));
const base = { goal: null, cycle, workouts, activities: [], daily: [], coverage: coveredDays, referenceDate };

test('maintains a fully evaluated plan using explicit activity links and complete day coverage', () => {
  const result = assessTraining({ ...base, activities: [activity('a1', '2026-11-23', 'easy-1'), activity('a2', '2026-11-25', 'quality-1')] });
  assert.equal(result.proposals[0].decision, 'maintain');
  assert.deepEqual(result.sessions, { eligible: 2, completed: 2, missedVerified: 0, uncertain: 0 });
  assert.equal(result.proposals[0].reason_codes.includes('PLAN_ADHERENCE_OBSERVED'), true);
});

test('an explicit matching activity is evidence of completion even when daily discovery coverage is absent', () => {
  const result = assessTraining({ ...base, coverage: [], activities: [activity('a1', '2026-11-23', 'easy-1'), activity('a2', '2026-11-25', 'quality-1')] });
  assert.equal(result.proposals[0].decision, 'maintain');
  assert.equal(result.sessions.completed, 2);
  assert.equal(result.sessions.uncertain, 0);
});

test('proposes one conservative future change after repeated verified deviations; never catches sessions up', () => {
  const input = { ...base, referenceDate: '2026-11-28' };
  const first = assessTraining(input);
  const second = assessTraining(structuredClone(input));
  const proposal = first.proposals[0];
  assert.equal(proposal.decision, 'modify');
  assert.equal(proposal.change.before.id, 'future-quality');
  assert.equal(proposal.change.before.intensity, 'hard');
  assert.equal(proposal.change.after.intensity, 'easy');
  assert.equal(proposal.change.after.date, proposal.change.before.date);
  assert.deepEqual(first, second, 'same inputs produce byte-equivalent decision data');
  assert.equal(proposal.id, `${COACHING_RULESET_VERSION}:modify:future-quality:2026-11-30`);
  assert.ok(proposal.reason_codes.includes('NO_AUTOMATIC_CATCH_UP'));
  assert.equal(proposal.requiresHumanApproval, true);
});

test('abstains when a planned date has partial coverage rather than calling it missed', () => {
  const result = assessTraining({ ...base, coverage: [coveredDays[0], { ...coveredDays[1], status: 'partial' }] });
  assert.equal(result.proposals[0].decision, 'abstain');
  assert.equal(result.sessions.missedVerified, 1);
  assert.equal(result.sessions.uncertain, 1);
  assert.ok(result.proposals[0].reason_codes.includes('ACTIVITY_COVERAGE_INCOMPLETE'));
});

test('does not infer a plan association from matching dates alone', () => {
  const result = assessTraining({ ...base, activities: [activity('unlinked', '2026-11-23', null)] });
  assert.equal(result.sessions.completed, 0);
  assert.equal(result.proposals[0].decision, 'modify');
  assert.match(result.limitations[1], /plannedWorkoutId/);
});

test('rejects duplicate conflicting plan identifiers and dangling or date-conflicting activity links', () => {
  const duplicate = assessTraining({ ...base, workouts: [workouts[0], { ...workouts[0], title: 'Different' }] });
  assert.equal(duplicate.proposals[0].decision, 'abstain');
  assert.equal(duplicate.status, 'invalid');
  const dangling = assessTraining({ ...base, activities: [activity('dangling', '2026-11-23', 'missing')] });
  assert.equal(dangling.proposals[0].reason_codes[0], 'INPUT_INVALID_OR_CONFLICTING');
  const mismatch = assessTraining({ ...base, activities: [activity('mismatch', '2026-11-24', 'easy-1')] });
  assert.equal(mismatch.status, 'invalid');
});

test('duplicate activities for one planned session remain uncertain; no automatic completion count', () => {
  const result = assessTraining({ ...base, activities: [activity('a1', '2026-11-23', 'easy-1'), activity('a2', '2026-11-23', 'easy-1')] });
  assert.equal(result.sessions.completed, 0);
  assert.equal(result.proposals[0].decision, 'abstain');
  assert.ok(result.sessions.uncertain > 0);
});

test('duplicate identical identifiers and invalid rule bounds fail closed without throwing', () => {
  const duplicate = assessTraining({ ...base, activities: [activity('same-id', '2026-11-23', 'easy-1'), activity('same-id', '2026-11-23', 'easy-1')] });
  assert.equal(duplicate.status, 'invalid');
  const invalidRules = assessTraining({ ...base, rules: { proposalHorizonDays: Number.POSITIVE_INFINITY } });
  assert.equal(invalidRules.proposals[0].decision, 'abstain');
  assert.equal(invalidRules.status, 'invalid');
  const invalidTitle = assessTraining({ ...base, workouts: [{ ...workouts[0], title: null }] });
  assert.equal(invalidTitle.status, 'invalid');
  const invalidDate = assessTraining({ ...base, referenceDate: '2026-02-30' });
  assert.equal(invalidDate.status, 'invalid');
  assert.equal(invalidDate.proposals[0].decision, 'abstain');
});

test('completed-but-unlinked sessions and activities linked to cancelled sessions remain unresolved', () => {
  const manual = assessTraining({ ...base, workouts: [
    { ...workouts[0], status: 'completed' }, workouts[1], workouts[2],
  ], coverage: coveredDays });
  assert.equal(manual.proposals[0].decision, 'abstain');
  assert.equal(manual.sessions.uncertain, 1);
  const cancelled = assessTraining({ ...base, workouts: [
    { ...workouts[0], status: 'cancelled' }, workouts[1], workouts[2],
  ], activities: [activity('cancelled-link', '2026-11-23', 'easy-1')] });
  assert.equal(cancelled.status, 'invalid');
});

test('equivalent coverage rows do not depend on object property order', () => {
  const left = { date: '2026-11-23', status: 'available', source: 'synthetic', reason: 'verified' };
  const right = { reason: 'verified', source: 'synthetic', status: 'available', date: '2026-11-23' };
  const result = assessTraining({ ...base, coverage: [left, right], activities: [activity('a1', '2026-11-23', 'easy-1'), activity('a2', '2026-11-25', 'quality-1')] });
  assert.equal(result.proposals[0].decision, 'maintain');
});

test('civil-day windows stay stable through DST and candidates outside configured horizon are not changed', () => {
  const input = { ...base, referenceDate: '2026-03-29', cycle: { ...cycle, start: '2026-03-01', end: '2026-04-30' },
    workouts: [{ ...workouts[0], date: '2026-03-25' }, { ...workouts[1], date: '2026-03-27' }, { ...workouts[2], date: '2026-04-06' }],
    coverage: [{ date: '2026-03-25', status: 'available', source: 'synthetic' }, { date: '2026-03-27', status: 'available', source: 'synthetic' }] };
  assert.equal(assessTraining(input).proposals[0].decision, 'abstain');
  assert.equal(assessTraining({ ...input, referenceDate: '2026-03-28' }).referenceDate, '2026-03-28');
});

test('invalid or contradictory coverage fails closed and recovery stays contextual, not prescriptive', () => {
  const result = assessTraining({ ...base, coverage: [coveredDays[0], coveredDays[1], { ...coveredDays[1], status: 'unknown' }] });
  assert.equal(result.status, 'invalid');
  assert.equal(result.proposals[0].decision, 'abstain');
  assert.equal(result.proposals[0].change, null);
  assert.ok(result.limitations.some(line => /non determinano da sole/.test(line)));
});

test('future target proposals exclude cancelled, past, and easy sessions', () => {
  const input = { ...base, workouts: [
    ...workouts.slice(0, 2),
    { ...workouts[2], date: '2026-11-28', status: 'cancelled' },
    { ...workouts[2], id: 'past-quality', date: '2026-11-20' },
  ] };
  const result = assessTraining(input);
  assert.equal(result.proposals[0].decision, 'abstain');
  assert.equal(result.proposals[0].change, null);
});

test('a user-supplied race within the proposal horizon blocks unmodeled taper changes', () => {
  const result = assessTraining({ ...base, goal: { id: 'race-1', kind: 'race', target: 6000, targetDate: '2026-11-30', unit: 's', provenance: 'synthetic goal' } });
  assert.equal(result.proposals[0].decision, 'abstain');
  assert.equal(result.proposals[0].change, null);
  assert.ok(result.proposals[0].reason_codes.includes('EVENT_CONTEXT_UNMODELED'));
});

test('unusual volume and discordant recovery readings remain contextual, never a hidden physiological rule', () => {
  const huge = { id: 'unplanned-large', date: '2026-11-27', type: 'running', name: 'Synthetic', distance_m: 80000, duration_s: 28000, average_hr: 145, plannedWorkoutId: null };
  const result = assessTraining({ ...base, activities: [activity('a1', '2026-11-23', 'easy-1'), activity('a2', '2026-11-25', 'quality-1'), huge],
    daily: [
      { date: '2026-11-27', hrv: 20, sleep_h: 4, resting_hr: 90, stress: 90, bb_charged: null, bb_drained: null, steps: null },
      { date: '2026-11-28', hrv: 90, sleep_h: 10, resting_hr: 40, stress: 5, bb_charged: null, bb_drained: null, steps: null },
    ] });
  assert.equal(result.proposals[0].decision, 'maintain');
  assert.equal(result.proposals[0].change, null);
  assert.equal(result.recovery.find(signal => signal.metric === 'hrv')?.baseline, null);
  assert.equal(result.recovery.find(signal => signal.metric === 'hrv')?.baselineSampleCount, 0);
});

test('missing performance baseline stays unknown or partial instead of producing a score', () => {
  const result = assessTraining({ ...base, activities: [activity('a1', '2026-11-23', 'easy-1')] });
  assert.equal(result.performance.changePercent, null);
  assert.ok(['unknown', 'partial'].includes(result.performance.status));
});
