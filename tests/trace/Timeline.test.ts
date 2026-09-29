import assert from 'node:assert/strict';
import test from 'node:test';
import { Timeline } from '../../src/trace/Timeline.js';
import { emitSessionEvent } from '../../src/trace/DiscoveryEvents.js';

test('assigns deterministic unique event IDs and strictly increasing sequences', () => {
  const timeline = new Timeline({ runId: 'RUN-TEST-001' });
  const first = timeline.create({ source: 'CORE', category: 'SESSION', type: 'START', data: {} });
  const second = timeline.create({ source: 'CORE', category: 'SESSION', type: 'END', data: {} });
  assert.deepEqual([first.eventId, second.eventId], ['EVENT-000001', 'EVENT-000002']);
  assert.deepEqual([first.sequence, second.sequence], [1, 2]);
  assert.deepEqual([first.runId, second.runId, timeline.runId], ['RUN-TEST-001', 'RUN-TEST-001', 'RUN-TEST-001']);
  assert.notEqual(first.eventId, second.eventId);
  timeline.append(first);
  timeline.append(second);
  assert.throws(() => timeline.append(first), /strictly increasing/);
  assert.equal(Reflect.set(timeline, 'runId', 'RUN-CHANGED'), false);
  assert.equal(timeline.runId, 'RUN-TEST-001');
});

test('independent timelines retain per-run event IDs and receive distinct default run IDs', () => {
  const first = new Timeline();
  const second = new Timeline();
  const firstEvent = first.create({ source: 'CORE', category: 'SESSION', type: 'EVENT', data: {} });
  const secondEvent = second.create({ source: 'CORE', category: 'SESSION', type: 'EVENT', data: {} });
  assert.equal(firstEvent.eventId, 'EVENT-000001');
  assert.equal(secondEvent.eventId, 'EVENT-000001');
  assert.notEqual(first.runId, second.runId);
  assert.notDeepEqual([firstEvent.runId, firstEvent.eventId], [secondEvent.runId, secondEvent.eventId]);
  assert.throws(() => first.append(secondEvent), /runId/);
});

test('session start and end events share the timeline run identity', () => {
  const timeline = new Timeline({ runId: 'RUN-SESSION-1' });
  const started = emitSessionEvent(timeline, 'SESSION_STARTED');
  const ended = emitSessionEvent(timeline, 'SESSION_ENDED');
  assert.deepEqual([started.runId, ended.runId], [timeline.runId, timeline.runId]);
  assert.deepEqual([started.eventId, ended.eventId], ['EVENT-000001', 'EVENT-000002']);
});

test('preserves supplied native monotonic timestamps and does not invent them', () => {
  const timeline = new Timeline();
  const withNative = timeline.create({ source: 'CDP', category: 'RUNTIME', type: 'OBSERVED', monotonicTimestamp: 12.5, data: {} });
  const withoutNative = timeline.create({ source: 'GAS', category: 'RUNTIME', type: 'OBSERVED', data: {} });
  assert.equal(withNative.monotonicTimestamp, 12.5);
  assert.equal(Object.hasOwn(withoutNative, 'monotonicTimestamp'), false);
  assert.match(withNative.timestamp, /^\d{4}-\d\d-\d\dT/);
});
