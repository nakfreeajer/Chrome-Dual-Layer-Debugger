import assert from 'node:assert/strict';
import test from 'node:test';
import { Timeline } from '../../src/trace/Timeline.js';
import type { ActionBackend, ActionOutcome, ActionStep, TestTargetAuthorization } from '../../src/testing/ActionContract.js';
import { parseSmokeScenario } from '../../src/testing/SmokeScenarioParser.js';
import { runSmokeScenario } from '../../src/testing/SmokeRunner.js';

const scenario = parseSmokeScenario({
  schemaVersion: 1, scenarioId: 'runner-fixture',
  target: { pageUrl: 'http://127.0.0.1/app', scope: { kind: 'PAGE' } },
  steps: [
    { stepId: 'first', kind: 'action', operation: 'fill', selector: '#private-input', value: 'sensitive-synthetic-value' },
    { stepId: 'second', kind: 'assert', operation: 'readText', selector: '#private-result', predicate: 'equals', expected: 'expected' },
    { stepId: 'third', kind: 'action', operation: 'click', selector: '#button' }
  ]
});

function backend(failStep?: string, events: string[] = []): ActionBackend {
  return {
    backend: 'PLAYWRIGHT', targetId: 'runner-page-1',
    async execute(step: ActionStep, _authorization?: TestTargetAuthorization): Promise<ActionOutcome> {
      events.push(`execute:${step.stepId}`);
      return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: step.stepId !== failStep, ...(step.operation === 'readText' ? { value: step.stepId === 'second' ? 'expected' : 'wrong' } : {}), ...(step.stepId === failStep ? { errorCode: 'ACTION_FAILED' as const } : {}) };
    },
    async assert(step, predicate, expected) {
      events.push(`assert:${step.stepId}:${predicate}:${String(expected)}`);
      return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: step.stepId !== failStep, ...(step.operation === 'readText' ? { value: 'wrong' } : {}), ...(step.stepId === failStep ? { errorCode: 'ACTION_FAILED' as const } : {}) };
    }
  };
}

const authorization = { mode: 'TEST' as const, backend: 'PLAYWRIGHT' as const, targetId: 'runner-page-1', fixtureId: 'runner-fixture', approvalReference: 'private-approval-reference' };

test('executes actions and assertions in declared order and emits scenario PASS lifecycle', async () => {
  const events: string[] = [];
  const timeline = new Timeline({ runId: 'smoke-pass-test' });
  const result = await runSmokeScenario({ backend: backend(undefined, events), scenario, timeline, authorization });
  assert.equal(result.status, 'PASS');
  assert.equal(result.runId, timeline.runId);
  assert.deepEqual(events, ['execute:first', 'execute:second', 'execute:third']);
  assert.equal(timeline.snapshot()[0].type, 'SCENARIO_STARTED');
  assert.equal(timeline.snapshot().at(-1)?.type, 'SCENARIO_PASSED');
});

test('stops at first failed step and returns stable FAIL result with failedStepId', async () => {
  const events: string[] = [];
  const timeline = new Timeline({ runId: 'smoke-fail-test' });
  const result = await runSmokeScenario({ backend: backend('second', events), scenario, timeline, authorization });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.failedStepId, 'second');
  assert.equal(result.stepResults.length, 2);
  assert.deepEqual(events, ['execute:first', 'execute:second']);
  assert.equal(timeline.snapshot().at(-1)?.type, 'SCENARIO_FAILED');
});

test('starts optional V1 observer before steps and always stops it after success or failure', async () => {
  const events: string[] = [];
  const observer = { async start() { events.push('observer:start'); }, async stop() { events.push('observer:stop'); return {}; } };
  const timeline = new Timeline({ runId: 'smoke-observer-test' });
  const result = await runSmokeScenario({ backend: backend(undefined, events), scenario, timeline, authorization, observer });
  assert.equal(result.status, 'PASS');
  assert.equal(events[0], 'observer:start');
  assert.equal(events.at(-1), 'observer:stop');
});

test('observer cleanup is attempted after a failed step and cleanup errors fail the scenario', async () => {
  let stopCalls = 0;
  const timeline = new Timeline({ runId: 'smoke-observer-cleanup-test' });
  const result = await runSmokeScenario({
    backend: backend('first'), scenario, timeline, authorization,
    observer: { async start() {}, async stop() { stopCalls += 1; throw new Error('private details'); } }
  });
  assert.equal(stopCalls, 1);
  assert.equal(result.status, 'FAIL');
  assert.equal(timeline.snapshot().at(-1)?.type, 'SCENARIO_FAILED');
});

test('Timeline omits selectors, input/expected values, approval reference and runtime errors', async () => {
  const timeline = new Timeline({ runId: 'smoke-privacy-test' });
  await runSmokeScenario({ backend: backend('second'), scenario, timeline, authorization });
  const serialized = JSON.stringify(timeline.snapshot());
  for (const secret of ['#private-input', '#private-result', 'sensitive-synthetic-value', 'private-approval-reference', 'private details']) assert.equal(serialized.includes(secret), false);
  assert.ok(serialized.includes('runner-fixture'));
});

test('normalized assertion event preserves identity and type metadata without values', async () => {
  const timeline = new Timeline({ runId: 'assertion-identity' });
  const base = backend();
  const wrongValueBackend: ActionBackend = { ...base, async execute(step) {
    return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: true, ...(step.operation === 'readText' ? { value: 'wrong-value' } : {}) };
  } };
  const result = await runSmokeScenario({ backend: wrongValueBackend, scenario, timeline, authorization });
  const failed = timeline.snapshot().find((event) => event.type === 'ASSERTION_FAILED')!;
  const data = failed.data as Record<string, unknown>;
  const resultRef = result.stepResults.find((step) => step.stepId === 'second')?.assertionEvent;
  assert.equal(failed.runId, timeline.runId);
  assert.deepEqual(resultRef, { runId: failed.runId, eventId: failed.eventId });
  assert.equal(data.scenarioId, scenario.scenarioId);
  assert.equal(data.stepId, 'second');
  assert.equal(data.operation, 'readText');
  assert.equal(data.predicate, 'equals');
  assert.equal(data.actualType, 'string');
  assert.equal(data.expectedType, 'string');
  assert.equal(data.errorCode, 'ASSERTION_FAILED');
  assert.equal(JSON.stringify(data).includes('wrong'), false);
  assert.equal(data.actual, undefined);
  assert.equal(data.expected, undefined);
});
