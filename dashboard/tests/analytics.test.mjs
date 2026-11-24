import test from 'node:test';
import assert from 'node:assert/strict';
import { validDate, shift, weeks, horizon, lastCompleteWeek } from '../src/analytics/dates.ts';
import { efficiency, weeklyEfficiency, efficiencyChange, cohortKey } from '../src/analytics/efficiency.ts';
import { bestActivities, projectRace } from '../src/analytics/performance.ts';
import { metrics, recovery, recoveryTrend } from '../src/analytics/recovery.ts';
import { advancedLoad, loadDistribution } from '../src/analytics/load.ts';
import { weeklyReport, reportMarkdown } from '../src/analytics/weeklyReport.ts';

const activity = (date, overrides = {}) => ({ id: 1, date, type: 'running', name: 'Sintetica', distance_m: 10000, duration_s: 3600, average_hr: 150, ...overrides });
const day = (date, overrides = {}) => ({ date, hrv: 50, resting_hr: 56, sleep_h: 7, stress: 0, bb_charged: 0, bb_drained: 0, steps: null, ...overrides });

test('calendar validates dates, crosses year boundaries and orders the observed horizon', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2100-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(shift('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(weeks({ start: '2026-12-31', end: '2027-01-04' }), ['2026-12-28', '2027-01-04']);
  assert.deepEqual(weeks({ start: '2027-01-02', end: '2027-01-01' }), []);
  assert.equal(horizon([], [], '2027-01-02'), null);
  assert.deepEqual(horizon([activity('2027-02-01'), activity('2027-01-01')], [day('2026-12-02')], '2027-01-02'),
    { start: '2026-12-02', end: '2027-01-01' });
  assert.equal(lastCompleteWeek('2026-02-08', '2026-02-08'), '2026-01-26');
  assert.equal(lastCompleteWeek('2026-02-08', '2026-02-09'), '2026-02-02');
});

test('efficiency validates inputs, separates cohorts and preserves gaps', () => {
  const reference = activity('2026-01-05');
  const runs = efficiency([
    reference, activity('2026-01-08', { duration_s: 3000 }), activity('2026-01-19'),
    activity('2026-01-05', { type: 'trail_running' }), activity('2026-01-05', { distance_m: 9999 }),
    activity('2026-01-05', { average_hr: 149.9 }), activity('2026-01-05', { average_hr: null }),
    activity('2026-01-05', { type: 'walking' }), activity('2026-01-05', { duration_s: Infinity }),
  ]);
  assert.equal(runs.length, 6);
  assert.equal(runs[0].index, 10 / 150);
  const key = cohortKey(runs[0].cohort);
  const same = runs.filter(run => cohortKey(run.cohort) === key);
  const weekly = weeklyEfficiency(same, { start: reference.date, end: '2026-01-19' });
  assert.deepEqual(weekly.map(row => row.count), [2, 0, 1]);
  assert.deepEqual(weekly.map(row => row.pace), [330, null, 360]);
});

test('efficiency comparison uses two disjoint four-week samples with a minimum of three each', () => {
  const runs = efficiency([
    ...[0, 1, 2].map(i => activity(shift('2026-01-05', i))),
    ...[0, 1, 2].map(i => activity(shift('2026-02-02', i), { duration_s: 3000 })),
    activity('2026-03-02', { duration_s: 1000 }),
  ]);
  const result = efficiencyChange(runs, '2026-02-23');
  assert.equal(result.previous, 3);
  assert.equal(result.recent, 3);
  assert.ok(Math.abs(result.change - 20) < 1e-9);
  assert.equal(efficiencyChange(runs.slice(1), '2026-02-23').change, null);
});

test('Riegel uses the selected full activity and rejects invalid distances and extrapolation', () => {
  const row = activity('2026-01-05');
  assert.equal(projectRace(undefined, 5), null);
  assert.equal(projectRace(row, 10), 3600);
  assert.ok(Math.abs(projectRace(row, 5) - 1727) < 1);
  assert.equal(projectRace(row, 25.001), null);
  assert.equal(projectRace(row, 3.999), null);
  assert.equal(projectRace(row, -1), null);
  assert.equal(projectRace({ ...row, duration_s: 0 }, 10), null);
  assert.equal(projectRace({ ...row, date: '2026-02-30' }, 10), null);
  assert.equal(bestActivities([row, activity('2026-01-06', { distance_m: 20000 })]).longest.value, 20000);
});

test('recovery uses 14 previous days, retains eligible zero and resolves duplicate rows by metric', () => {
  const previous = Array.from({ length: 14 }, (_, i) => day(shift('2026-01-01', i), { hrv: 40 + i }));
  const latest = day('2026-01-15', { hrv: 60 });
  const period = { start: '2026-01-01', end: '2026-01-20' };
  const result = recovery([...previous, latest, day(latest.date, { hrv: 62 }), day(latest.date, { hrv: null }), day('2026-01-21')], period);
  assert.equal(result[0].latest.date, latest.date);
  assert.equal(result[0].baseline, 46.5);
  assert.equal(result[0].delta, 15.5);
  assert.equal(result[0].baselineCount, 14);
  assert.equal(result[3].latest.value, 0);
  assert.equal(result[3].delta, 0);
  assert.equal(result[3].percent, null);
  const fromZero = recovery([...previous, day(latest.date, { stress: 10 })], period)[3];
  assert.equal(fromZero.delta, 10);
  assert.equal(fromZero.percent, null);
  assert.equal(recovery([...previous.slice(1), latest], period)[0].baseline, null);
  const trend = recoveryTrend(previous.slice(0, 4), metrics[0], { start: '2026-01-03', end: '2026-01-08' });
  assert.deepEqual(trend.map(row => row.count), [3, 4, 4, 4, 4, 3]);
  assert.deepEqual(trend.map(row => row.value), [null, 41.5, 41.5, 41.5, 41.5, null]);
});

test('advanced load handles inclusive windows, history outside the selected period and zero reference', () => {
  const end = '2026-02-08';
  const period = { start: '2026-02-04', end };
  const observed = { start: '2026-01-01', end };
  const rows = ['2026-01-04', '2026-01-05', '2026-02-01', '2026-02-02', '2026-02-08', '2026-02-09'].map(date => activity(date));
  const covered = ({start, end}) => start >= observed.start && end <= observed.end;
  const result = advancedLoad(rows, period, covered);
  assert.equal(result.last7.start, '2026-02-02');
  assert.equal(result.last28.start, '2026-01-12');
  assert.deepEqual(result.preceding, { start: '2026-01-05', end: '2026-02-01' });
  assert.equal(result.selected.km, 10);
  assert.equal(result.totals7.hours, 2);
  assert.equal(result.totals28.active, 3);
  assert.equal(result.baseline, 5);
  assert.equal(result.ratio, 4);
  assert.equal(advancedLoad([], period, covered).ratio, null);
  assert.equal(advancedLoad(rows, period, ({ start }) => start >= '2026-01-06').baseline, null);
  assert.equal(loadDistribution(rows, period).distances[3].count, 1);
});

test('weekly report is reproducible and exposes partial and empty weeks', () => {
  const week = '2026-02-02';
  const observed = { start: '2026-01-05', end: '2026-02-08' };
  const rows = [activity(week), activity('2026-01-26', { distance_m: 5000 })];
  const daily = [day(week)];
  const runs = efficiency(rows);
  const report = weeklyReport(rows, daily, runs, week, observed, observed, '2026-02-09', cohortKey(runs[0].cohort), ({start,end}) => start >= observed.start && end <= observed.end);
  assert.equal(report.partial, false);
  assert.equal(report.prior.km, 5);
  assert.equal(report.fourKm, 1.25);
  const markdown = reportMarkdown(report, 'Coorte sintetica');
  assert.equal(markdown, reportMarkdown(report, 'Coorte sintetica'));
  assert.match(markdown, /10 km/);
  assert.match(markdown, /50 ms/);
  assert.match(markdown, /Coorte sintetica/);
  const empty = weeklyReport([], [], [], week, { ...observed, end: week }, observed, week, '');
  assert.equal(empty.partial, true);
  assert.match(reportMarkdown(empty, 'Indisponibile'), /Nessuna corsa registrata/);
  assert.doesNotMatch(reportMarkdown(empty, 'Indisponibile'), /NaN|Infinity/);
});
