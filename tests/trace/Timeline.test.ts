import assert from 'node:assert/strict';
import test from 'node:test';
import { Timeline } from '../../src/trace/Timeline.js';

test('assigns deterministic unique event IDs and strictly increasing sequences', () => {
  const timeline = new Timeline();
  const first = timeline.create({ source: 'CORE', category: 'SESSION', type: 'START', data: {} });
  const second = timeline.create({ source: 'CORE', category: 'SESSION', type: 'END', data: {} });
  assert.deepEqual([first.eventId, second.eventId], ['EVENT-000001', 'EVENT-000002']);
  assert.deepEqual([first.sequence, second.sequence], [1, 2]);
  assert.notEqual(first.eventId, second.eventId);
  timeline.append(first);
  timeline.append(second);
  assert.throws(() => timeline.append(first), /strictly increasing/);
});

test('preserves supplied native monotonic timestamps and does not invent them', () => {
  const timeline = new Timeline();
  const withNative = timeline.create({ source: 'CDP', category: 'RUNTIME', type: 'OBSERVED', monotonicTimestamp: 12.5, data: {} });
  const withoutNative = timeline.create({ source: 'GAS', category: 'RUNTIME', type: 'OBSERVED', data: {} });
  assert.equal(withNative.monotonicTimestamp, 12.5);
  assert.equal(Object.hasOwn(withoutNative, 'monotonicTimestamp'), false);
  assert.match(withNative.timestamp, /^\d{4}-\d\d-\d\dT/);
});
