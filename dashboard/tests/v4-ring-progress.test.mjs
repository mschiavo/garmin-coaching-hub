import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRingProgress } from '../src/components/v4/ringProgress.ts';

test('ring progress preserves above-target percentage and caps only the visual arc', () => {
  assert.deepEqual(calculateRingProgress(120, 100), { percentage: 120, visualPercentage: 100 });
  assert.deepEqual(calculateRingProgress(25, 100), { percentage: 25, visualPercentage: 25 });
  assert.deepEqual(calculateRingProgress(0, 100), { percentage: 0, visualPercentage: 0 });
});

test('ring demo progress is consistent with weekly distance fixture', () => {
  const progress = calculateRingProgress(36.3, 42);
  assert.ok(progress);
  assert.ok(Math.abs(progress.percentage - 86.43) < 0.01);
  assert.equal(progress.visualPercentage, progress.percentage);
});

test('ring progress rejects missing, negative, non-finite, and non-positive target inputs', () => {
  for (const [actual, target] of [[null, 10], [Number.NaN, 10], [Number.POSITIVE_INFINITY, 10], [-1, 10], [5, null], [5, 0], [5, -1], [5, Number.NaN]]) {
    assert.equal(calculateRingProgress(actual, target), null, `${actual} / ${target} should be unavailable`);
  }
});
