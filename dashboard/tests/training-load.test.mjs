import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Transpile only the pure calculation module; no browser or real account required.
const source = readFileSync(new URL('../src/trainingLoad.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const { buildTrainingLoad } = await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const run=(date,km,seconds=3600)=>({date,distance_m:km===null?null:km*1000,duration_s:seconds});
test('Monday grouping, units, missing weeks and baseline',()=>{
 const weeks=buildTrainingLoad([run('2026-01-05',10),run('2026-01-11',5,1800),run('2026-01-12',20),run('2026-01-26',5),run('2026-02-02',20)],'2026-01-05','2026-02-08');
 assert.deepEqual(weeks.map(w=>w.km),[15,20,0,5,20]);
 assert.equal(weeks[0].hours,1.5);assert.equal(weeks[0].runs,2);
 assert.deepEqual(weeks.slice(0,4).map(w=>w.baselineKm),[null,null,null,null]);
 assert.equal(weeks[4].baselineKm,10);assert.equal(weeks[4].ratio,2);assert.equal(weeks[4].deltaPct,300);
 assert.equal(weeks[3].deltaPct,null);assert.equal(weeks[2].deltaPct,-100);
});
test('zero baseline, invalid measurements, future activities',()=>{
 const weeks=buildTrainingLoad([run('2026-02-02',null,null),run('2026-02-03',-1,-10),run('2026-02-09',80)],'2026-01-05','2026-02-04');
 assert.equal(weeks.length,5);assert.equal(weeks[4].km,0);assert.equal(weeks[4].hours,0);assert.equal(weeks[4].runs,2);assert.equal(weeks[4].baselineKm,0);assert.equal(weeks[4].ratio,null);
});
test('invalid or reversed date range',()=>{
 assert.deepEqual(buildTrainingLoad([], 'bad','2026-01-05'),[]);
 assert.deepEqual(buildTrainingLoad([], '2026-02-01','2026-01-05'),[]);
});
test('calendar year boundary and partial final week',()=>{
 const weeks=buildTrainingLoad([run('2025-12-31',8),run('2026-01-01',2),run('2026-01-05',5)],'2025-12-29','2026-01-06');
 assert.deepEqual(weeks.map(w=>[w.week,w.km]),[['2025-12-29',10],['2026-01-05',5]]);
});
