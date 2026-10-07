import assert from 'node:assert/strict';
import test from 'node:test';
import { Timeline } from '../../src/trace/Timeline.js';
import type { ActionBackend, ActionOutcome, ActionStep } from '../../src/testing/ActionContract.js';
import { parseExploratoryProfile } from '../../src/testing/ExploratoryProfileParser.js';
import { generateExploratoryPlan } from '../../src/testing/ExploratoryGenerator.js';
import { runExploratoryProfile } from '../../src/testing/ExploratoryRunner.js';

const profile = parseExploratoryProfile({ schemaVersion: 1, profileId: 'runner-test', target: { pageUrl: 'http://127.0.0.1/app', scope: { kind: 'PAGE' } },
  bounds: { maxActions: 3, maxDurationMs: 1000 }, candidates: [{ candidateId: 'safe-click', operation: 'click', selector: '#safe' }] });
const auth = { mode: 'TEST' as const, backend: 'PLAYWRIGHT' as const, targetId: 'PAGE-1', fixtureId: profile.profileId, approvalReference: 'approved-for-test' };

function fakeBackend(failAt?: number): { backend: ActionBackend; calls: ActionStep[] } {
  const calls: ActionStep[] = [];
  return { calls, backend: { backend: 'PLAYWRIGHT', targetId: 'PAGE-1', async execute(step): Promise<ActionOutcome> {
    calls.push(step); return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: calls.length !== failAt, ...(calls.length === failAt ? { errorCode: 'ACTION_FAILED' as const } : {}) };
  }, async assert(step) { return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: true }; } } };
}

test('records each planned action before execution and completes a replayable plan', async () => {
  const f = fakeBackend(); const timeline = new Timeline({ runId: 'explore-pass' }); let now = 10; let guards = 0;
  const result = await runExploratoryProfile({ backend: f.backend, profile, artifact: generateExploratoryPlan(profile, 9), timeline, authorization: auth,
    assertTargetEnvelope() { guards += 1; }, now: () => now++ });
  assert.equal(result.status, 'PASS'); assert.equal(result.generatedCount, 3); assert.equal(result.executedCount, 3); assert.equal(guards, 6);
  const events = timeline.snapshot();
  for (let index = 0; index < 3; index += 1) assert.ok(events.findIndex((event) => event.type === 'EXPLORATORY_ACTION_PLANNED' && (event.data as Record<string, unknown> | undefined)?.stepId === f.calls[index].stepId) < events.findIndex((event) => event.type === 'ACTION_STARTED' && (event.data as Record<string, unknown> | undefined)?.stepId === f.calls[index].stepId));
  assert.equal(events.at(-1)?.type, 'EXPLORATORY_RUN_COMPLETED');
  assert.equal(JSON.stringify(events).includes('#safe'), false);
  assert.equal(JSON.stringify(events).includes('approved-for-test'), false);
});

test('stops on first failed action and never invokes a later generated action', async () => {
  const f = fakeBackend(2); const timeline = new Timeline({ runId: 'explore-fail' }); let now = 0;
  const result = await runExploratoryProfile({ backend: f.backend, profile, artifact: generateExploratoryPlan(profile, 9), timeline, authorization: auth, assertTargetEnvelope() {}, now: () => now++ });
  assert.equal(result.status, 'FAIL'); assert.equal(result.executedCount, 2); assert.equal(f.calls.length, 2);
  assert.equal(timeline.snapshot().at(-1)?.type, 'EXPLORATORY_RUN_FAILED');
});

test('fails closed on target-envelope violation and on altered replay plan', async () => {
  const f = fakeBackend(); const timeline = new Timeline({ runId: 'explore-envelope' });
  const escaped = await runExploratoryProfile({ backend: f.backend, profile, artifact: generateExploratoryPlan(profile, 9), timeline, authorization: auth,
    assertTargetEnvelope() { throw new Error('TARGET_ENVELOPE_VIOLATION'); } });
  assert.equal(escaped.status, 'FAIL'); assert.equal(escaped.stopReason, 'TARGET_ENVELOPE_VIOLATION'); assert.equal(f.calls.length, 0);
  const artifact = generateExploratoryPlan(profile, 9); artifact.plan[0].selector = '#tampered';
  const altered = await runExploratoryProfile({ backend: f.backend, profile, artifact, timeline: new Timeline(), authorization: auth, assertTargetEnvelope() {} });
  assert.equal(altered.stopReason, 'REPLAY_PLAN_MISMATCH'); assert.equal(f.calls.length, 0);
});

test('duration bound terminates cleanly before a later action', async () => {
  const f = fakeBackend(); const timeline = new Timeline({ runId: 'explore-bound' }); let now = 0;
  const result = await runExploratoryProfile({ backend: f.backend, profile, artifact: generateExploratoryPlan(profile, 9), timeline, authorization: auth, assertTargetEnvelope() {}, now: () => now++ });
  assert.equal(result.status, 'PASS');
  const early = parseExploratoryProfile({ ...profile, bounds: { maxActions: 3, maxDurationMs: 1 } });
  const ticks = [0, 0, 1];
  const bounded = await runExploratoryProfile({ backend: f.backend, profile: early, artifact: generateExploratoryPlan(early, 9), timeline: new Timeline(), authorization: auth, assertTargetEnvelope() {}, now: () => ticks.shift() ?? 1 });
  assert.equal(bounded.status, 'BOUND_REACHED'); assert.equal(bounded.executedCount, 1);
});

test('caps backend action timeout to the exact injected remaining duration with a one millisecond floor', async () => {
  const boundedProfile = parseExploratoryProfile({ schemaVersion: 1, profileId: 'timeout-cap', target: { pageUrl: 'http://127.0.0.1/app', scope: { kind: 'PAGE' } },
    bounds: { maxActions: 1, maxDurationMs: 1000 }, candidates: [{ candidateId: 'slow-action', operation: 'click', selector: '#safe', timeoutMs: 9000 }] });
  const calls: ActionStep[] = [];
  const backend: ActionBackend = { backend: 'PLAYWRIGHT', targetId: 'PAGE-1', async execute(step) { calls.push(step); return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: true }; }, async assert(step) { return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: true }; } };
  const ticks = [100, 425];
  const result = await runExploratoryProfile({ backend, profile: boundedProfile, artifact: generateExploratoryPlan(boundedProfile, 3), timeline: new Timeline(), authorization: auth, assertTargetEnvelope() {}, now: () => ticks.shift() ?? 425 });
  assert.equal(result.status, 'PASS');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeoutMs, 675);
  assert.equal(ticks.length, 0);

  calls.length = 0;
  const minimumProfile = parseExploratoryProfile({ schemaVersion: 1, profileId: 'timeout-minimum', target: { pageUrl: 'http://127.0.0.1/app', scope: { kind: 'PAGE' } },
    bounds: { maxActions: 1, maxDurationMs: 1 }, candidates: [{ candidateId: 'minimum-action', operation: 'click', selector: '#safe', timeoutMs: 9000 }] });
  const minimumTicks = [0, 0.5];
  const minimum = await runExploratoryProfile({ backend, profile: minimumProfile, artifact: generateExploratoryPlan(minimumProfile, 3), timeline: new Timeline(), authorization: auth, assertTargetEnvelope() {}, now: () => minimumTicks.shift() ?? 0.5 });
  assert.equal(minimum.status, 'PASS');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeoutMs, 1);
  assert.equal(minimumTicks.length, 0);
});
