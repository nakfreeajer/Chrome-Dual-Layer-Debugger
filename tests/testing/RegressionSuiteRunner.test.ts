import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeRegressionOutcome, runRegressionSuite } from '../../src/testing/RegressionSuiteRunner.js';
import { parseRegressionSuite } from '../../src/testing/RegressionSuiteParser.js';
import type { NormalizedRegressionOutcome } from '../../src/testing/RegressionSuite.js';

const suite = parseRegressionSuite(JSON.parse(readFileSync('tests/fixtures/testing/regression-suite-v1.json', 'utf8')) as unknown);

function outcomeFor(index: number): NormalizedRegressionOutcome {
  const item = suite.cases[index];
  if (item.kind === 'SMOKE') return { status: item.expected.status, stopReason: item.expected.status === 'PASS' ? 'ALL_STEPS_COMPLETED' : item.expected.steps.find((step) => step.state === 'FAIL')?.errorCode ?? 'RUNNER_FAILED',
    generatedCount: item.scenario.steps.length, executedCount: item.expected.steps.filter((step) => step.state !== 'NOT_RUN').length,
    steps: item.scenario.steps.map((step, n) => ({ stepId: step.stepId, operation: step.operation, state: item.expected.steps[n].state, ...(item.expected.steps[n].errorCode ? { errorCode: item.expected.steps[n].errorCode } : {}) })) };
  return { status: item.expected.status, stopReason: item.expected.stopReason, generatedCount: item.expected.generatedCount, executedCount: item.expected.executedCount,
    steps: item.expected.steps.map((step) => ({ stepId: step.stepId, operation: step.operation, candidateId: step.candidateId, state: step.state, ...(step.errorCode ? { errorCode: step.errorCode } : {}) })) };
}

test('executes ordered smoke and seeded monkey cases, retaining expected failure as a passing regression case', async () => {
  const calls: string[] = [];
  const artifact = await runRegressionSuite({ suite, backend: 'PLAYWRIGHT', async executeCase(testCase) {
    calls.push(testCase.caseId);
    return { runId: `run-${testCase.caseId}`, outcome: outcomeFor(calls.length - 1) };
  } });
  assert.equal(artifact.suiteStatus, 'PASS');
  assert.deepEqual(calls, suite.cases.map((item) => item.caseId));
  assert.deepEqual(artifact.caseResults.map((item) => item.comparisonStatus), ['PASS', 'PASS', 'PASS']);
  assert.equal(artifact.comparableFixtureState, 'NOT_PROVEN');
});

test('fails fast and records all later cases as NOT_RUN when one normalized outcome mismatches', async () => {
  let calls = 0;
  const artifact = await runRegressionSuite({ suite, backend: 'PLAYWRIGHT', async executeCase(testCase) {
    const expected = outcomeFor(calls++);
    if (testCase.caseId === 'readiness-pass') expected.steps = expected.steps.map((step) => ({ ...step, state: 'FAIL' as const, errorCode: 'ACTION_FAILED' }));
    return { runId: `run-${testCase.caseId}`, outcome: expected };
  } });
  assert.equal(artifact.suiteStatus, 'FAIL');
  assert.deepEqual(artifact.caseResults.map((item) => item.comparisonStatus), ['FAIL', 'NOT_RUN', 'NOT_RUN']);
  assert.equal(calls, 1);
});

test('fixture cleanup UNKNOWN or failed case setup prevents suite PASS and later cases', async () => {
  const artifact = await runRegressionSuite({ suite, backend: 'PLAYWRIGHT', fixtureLifecycleRequested: true, async executeCase(_testCase, _backend) {
    return { runId: 'fixture-run', outcome: outcomeFor(0), fixtureCleanupStatus: 'UNKNOWN' };
  } });
  assert.equal(artifact.suiteStatus, 'FAIL');
  assert.equal(artifact.caseResults[0].errorCode, 'FIXTURE_CLEANUP_UNKNOWN');
  assert.equal(artifact.comparableFixtureState, 'NOT_PROVEN');
  await assert.rejects(runRegressionSuite({ suite: { ...suite, eligibleBackends: ['PLAYWRIGHT'] }, backend: 'GAS_OOPIF', async executeCase() { throw new Error('must not execute'); } }), /BACKEND_NOT_SUITE_ELIGIBLE/);
});

test('normalizes smoke and monkey actual outcomes without retaining raw assertion values', () => {
  const smoke = suite.cases[0];
  assert.equal(smoke.kind, 'SMOKE');
  const normalized = normalizeRegressionOutcome(smoke, { status: 'PASS', stepResults: [{ stepId: 'ready', operation: 'ready', ok: true, value: 'secret-page-value' } as never] });
  assert.equal(normalized.steps[0].state, 'PASS');
  assert.equal(JSON.stringify(normalized).includes('secret-page-value'), false);
  const monkey = suite.cases[2];
  assert.equal(monkey.kind, 'MONKEY');
  const replay = normalizeRegressionOutcome(monkey, { status: 'PASS', stopReason: 'ALL_ACTIONS_COMPLETED', generatedCount: 2, executedCount: 2,
    actionResults: [{ stepId: 'MONKEY-000001', candidateId: 'synthetic-click', operation: 'click', ok: true }, { stepId: 'MONKEY-000002', candidateId: 'synthetic-click', operation: 'click', ok: true }] });
  assert.deepEqual(replay.steps.map((step) => step.stepId), ['MONKEY-000001', 'MONKEY-000002']);
});

test('normalization rejects duplicated, reordered, and operation-mismatched runner evidence', () => {
  const smoke = suite.cases[0];
  assert.equal(smoke.kind, 'SMOKE');
  const expected = smoke.scenario.steps[0];
  const malformed = normalizeRegressionOutcome(smoke, { status: 'PASS', stepResults: [
    { stepId: expected.stepId, operation: 'click', ok: true }
  ] });
  assert.equal(malformed.status, 'FAIL');
  assert.equal(malformed.stopReason, 'RUNNER_FAILED');
  assert.equal(malformed.steps[0].state, 'NOT_RUN');

  const multi = suite.cases[1];
  assert.equal(multi.kind, 'SMOKE');
  const [first, second] = multi.scenario.steps;
  const reordered = normalizeRegressionOutcome(multi, { status: 'FAIL', stepResults: [
    { stepId: second.stepId, operation: second.operation, ok: false, errorCode: 'ACTION_FAILED' }
  ] });
  assert.equal(reordered.stopReason, 'RUNNER_FAILED');
  const duplicated = normalizeRegressionOutcome(multi, { status: 'FAIL', stepResults: [
    { stepId: first.stepId, operation: first.operation, ok: true },
    { stepId: first.stepId, operation: first.operation, ok: false, errorCode: 'ACTION_FAILED' }
  ] });
  assert.equal(duplicated.stopReason, 'RUNNER_FAILED');
});
