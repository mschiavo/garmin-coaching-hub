import test from 'node:test';
import assert from 'node:assert/strict';
import { readArchive } from '../src/dataApi.ts';
import { indexCoverage, coverageState } from '../src/analytics/coverage.ts';
import { extendedFields } from '../src/analytics/dates.ts';
import { advancedLoad } from '../src/analytics/load.ts';

const today = '2026-03-15';
const date = '2026-03-14';
const signal = () => new AbortController().signal;
const activities = Array.from({ length: 2501 }, (_, i) => ({
  id: String(9007199254740993n + BigInt(i)), date, type: 'running', name: null,
  distance_m: 5000, duration_s: 1800, average_hr: 150,
  ...Object.fromEntries(extendedFields.map(([key]) => [key,null])),
}));
const empty = { min: null, max: null, count: 0 };
const meta = {
  api_version: 2, schema_version: 34, revision: '1', coverage_status: 'unknown', anomalies: { activities: 0, daily: 0 }, updated_at: null,
  activities: { min: date, max: date, count: activities.length }, daily: empty, coverage: empty,
};
const success = data => ({ data, error: null, status: 200 });
const error = (code, status) => ({ data: null, error: { code }, status });
function mock(kind, args) {
  if (kind === 'dashboard_metadata_v2') return success(meta);
  const source = kind === 'dashboard_activities_v2' ? activities : [];
  const start = args.p_after_key ? source.findIndex(row => row.id === args.p_after_key) + 1 : 0;
  const rows = source.slice(start, start + 250);
  const has_more = start + rows.length < source.length;
  return success({ rows, has_more, revision: '1', count: rows.length, limit: 250,
    next_cursor: has_more ? { date, key: rows.at(-1).id } : null });
}

test('reads bigint keysets over 2000 and reconciles the final count', async () => {
  const counters = [];
  const archive = await readArchive(mock, '90', today, signal(), (...args) => counters.push(args));
  assert.deepEqual(archive.activities.map(row => row.id), activities.map(row => row.id));
  assert.deepEqual(counters.at(-1), [2501, 2501]);
  assert.equal(archive.requested.end, today);
  assert.ok(archive.acquired.start < archive.requested.start);
});

test('falls back on missing metadata only', async () => {
  for (const [code, status, expected] of [['PGRST202',404,true], ['42501',403,false],
    ['PGRST202',401,false], ['PGRST202',500,false], ['ETIMEDOUT',504,false]]) {
    let fallback = 0;
    const rpc = name => {
      if (name === 'dashboard_metadata_v2') return error(code,status);
      fallback++;
      return success({ activities: [], daily: [], updated_at: null });
    };
    if (expected) assert.equal((await readArchive(rpc,'all',today,signal())).metadata,null);
    else await assert.rejects(() => readArchive(rpc,'all',today,signal()));
    assert.equal(fallback, Number(expected));
  }
  await assert.rejects(() => readArchive(() => success({}), 'all', today, signal()), { code: 'schema' });
});

test('rejects duplicate, reordered, missing, stalled or unavailable pages', async () => {
  for (const mode of ['duplicate','reordered','missing','stalled','not found']) {
    const rpc = (name,args) => {
      const result = mock(name,args);
      if (name !== 'dashboard_activities_v2' || !args.p_after_key) return result;
      if (mode === 'not found') return error('PGRST202',404);
      const p = result.data;
      if (mode === 'duplicate') p.rows[0] = activities[0];
      if (mode === 'reordered') p.rows.reverse();
      if (mode === 'missing') return success({ ...p, rows: [], count: 0, has_more: false, next_cursor: null });
      if (mode === 'stalled') p.next_cursor.key = args.p_after_key;
      return result;
    };
    await assert.rejects(() => readArchive(rpc,'all',today,signal()), { code: mode === 'not found' ? 'missing' : 'page' });
  }
});

test('restarts only once for changed revisions and discards aborted responses', async () => {
  for (const times of [1,2]) {
    let changes = 0;
    const rpc = (name,args) => name === 'dashboard_activities_v2' && args.p_after_key && changes < times
      ? (++changes, error('40001',409)) : mock(name,args);
    if (times === 1) assert.equal((await readArchive(rpc,'all',today,signal())).activities.length,2501);
    else await assert.rejects(() => readArchive(rpc,'all',today,signal()), { code: 'revision' });
    assert.equal(changes,times);
  }
  const controller = new AbortController();
  let release;
  const waiting = readArchive(() => new Promise(resolve => { release = resolve; }), 'all', today, controller.signal);
  controller.abort();
  release(success(meta));
  await assert.rejects(waiting, { name:'AbortError' });
});

test('concluded activity coverage preserves last evidence after failure and requires matching data', () => {
  const period = { start: date, end: date };
  const blank = { activities: [], daily: [], acquired: period, metadata: meta, coverage: [] };
  assert.equal(coverageState(undefined),'unknown');
  assert.equal(indexCoverage(blank,today)(period),false);
  const sample = { date, source:'activities', attempt_state:'failed', evidence:'success_empty', item_count:0 };
  const archive = { ...blank, coverage:[sample] };
  assert.equal(coverageState(sample), 'failed');
  assert.equal(indexCoverage(archive,today)(period),true);
  assert.equal(indexCoverage({ ...archive, activities:[activities[0]] },today)(period),false);
  assert.equal(indexCoverage(archive,date)(period),false);
  assert.equal(indexCoverage({ ...archive, coverage:[{ ...sample, evidence:null, attempt_state:'partial' }] },today)(period),false);
  assert.equal(indexCoverage({ ...archive, metadata:null },today)(period),false);
});

test('load suppresses ratios for partial transfers and missing distances', () => {
  const period = { start: '2026-03-01', end: date };
  const runs = [activities[0], { ...activities[1], date:'2026-03-01' }, { ...activities[2], distance_m:null }];
  assert.equal(advancedLoad(runs,period,()=>true).ratio,null);
  assert.equal(advancedLoad(runs,period,()=>true).totals7.distanceCount,1);
  assert.equal(advancedLoad(runs.slice(0,2),period,()=>true).ratio,4);
  assert.equal(advancedLoad(runs.slice(0,2),period).ratio,null);
});
