import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingLoad } from '../src/trainingLoad.ts';
const run=(date,km,seconds=3600)=>({date,distance_m:km===null?null:km*1000,duration_s:seconds});
test('Monday grouping, units, missing weeks and baseline',()=>{
 const weeks=buildTrainingLoad([run('2026-01-05',10),run('2026-01-11',5,1800),run('2026-01-12',20),run('2026-01-26',5),run('2026-02-02',20)],'2026-01-05','2026-02-08', ({start,end})=>start>='2026-01-05'&&end<='2026-02-08');
 assert.deepEqual(weeks.map(w=>w.km),[15,20,0,5,20]);
 assert.equal(weeks[0].hours,1.5);assert.equal(weeks[0].runs,2);
 assert.deepEqual(weeks.slice(0,4).map(w=>w.baselineKm),[null,null,null,null]);
 assert.equal(weeks[4].baselineKm,10);assert.equal(weeks[4].ratio,2);assert.equal(weeks[4].deltaPct,300);
 assert.equal(weeks[3].deltaPct,null);assert.equal(weeks[2].deltaPct,-100);
});
test('zero baseline, invalid measurements, future activities',()=>{
 const weeks=buildTrainingLoad([run('2026-02-02',null,null),run('2026-02-03',-1,-10),run('2026-02-09',80)],'2026-01-05','2026-02-04');
 assert.equal(weeks.length,5);assert.equal(weeks[4].km,null);assert.equal(weeks[4].hours,null);assert.equal(weeks[4].runs,2);assert.equal(weeks[4].baselineKm,null);assert.equal(weeks[4].ratio,null);
});
test('invalid or reversed date range',()=>{
 assert.deepEqual(buildTrainingLoad([], 'bad','2026-01-05'),[]);
 assert.deepEqual(buildTrainingLoad([], '2026-02-01','2026-01-05'),[]);
});
test('calendar year boundary and partial final week',()=>{
 const weeks=buildTrainingLoad([run('2025-12-28',40),run('2025-12-31',8),run('2026-01-01',2),run('2026-01-05',5)],'2025-12-29','2026-01-06');
 assert.deepEqual(weeks.map(w=>[w.week,w.km]),[['2025-12-29',10],['2026-01-05',5]]);
 const clipped=buildTrainingLoad([run('2026-01-05',10),run('2026-01-06',5)],'2026-01-06','2026-01-11');
 assert.equal(clipped[0].km,5);
});

test('rejects impossible dates and keeps every week of a long series',()=>{
 const period=buildTrainingLoad([run('2020-02-30',30)],'2010-01-04','2021-01-04');
 assert.ok(period.length>550);
 assert.equal(period.at(-1).week,'2021-01-04');
 assert.equal(period.reduce((total,week)=>total+week.runs,0),0);
 assert.deepEqual(buildTrainingLoad([],'2026-02-30','2026-03-02'),[]);
});
