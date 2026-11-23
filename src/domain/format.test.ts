import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatDuration, formatPercent } from './format.ts';

test('formatBytes uses binary units', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1024 * 1024), '1 MB');
  assert.equal(formatBytes(5 * 1024 ** 3), '5 GB');
});

test('formatDuration switches units', () => {
  assert.equal(formatDuration(250), '250 ms');
  assert.equal(formatDuration(2500), '2.5 s');
  assert.equal(formatDuration(90_000), '1 min 30 s');
});

test('formatPercent guards zero total', () => {
  assert.equal(formatPercent(1, 0), '0%');
  assert.equal(formatPercent(1, 4), '25.0%');
});
