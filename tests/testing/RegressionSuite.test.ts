import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareRegressionSuiteResults, validateRegressionSuiteResultArtifact, type NormalizedRegressionOutcome, type RegressionSuiteResultArtifact } from '../../src/testing/RegressionSuite.js';
import { parseRegressionSuite, regressionSuiteSha256 } from '../../src/testing/RegressionSuiteParser.js';

const suite = parseRegressionSuite(JSON.parse(readFileSync('tests/fixtures/testing/regression-suite-v1.json', 'utf8')) as unknown);

function expectedActual(index: number): NormalizedRegressionOutcome {
  const item = suite.cases[index];
  if (item.kind === 'SMOKE') {
    const steps = item.scenario.steps.map((step, stepIndex) => ({ stepId: step.stepId, operation: step.operation, state: item.expected.steps[stepIndex].state,
      ...(item.expected.steps[stepIndex].errorCode ? { errorCode: item.expected.steps[stepIndex].errorCode } : {}) }));
    return { status: item.expected.status, stopReason: item.expected.status === 'PASS' ? 'ALL_STEPS_COMPLETED' : item.expected.steps.find((step) => step.state === 'FAIL')?.errorCode ?? 'RUNNER_FAILED',
      generatedCount: steps.length, executedCount: steps.filter((step) => step.state !== 'NOT_RUN').length, steps };
  }
  return { status: item.expected.status, stopReason: item.expected.stopReason, generatedCount: item.expected.generatedCount, executedCount: item.expected.executedCount,
    steps: item.expected.steps.map((step) => ({ stepId: step.stepId, operation: step.operation, candidateId: step.candidateId, state: step.state, ...(step.errorCode ? { errorCode: step.errorCode } : {}) })) };
}

function result(backend: 'PLAYWRIGHT' | 'GAS_OOPIF', verified = false): RegressionSuiteResultArtifact {
  return { kind: 'CDLD_TEST1F_SUITE_RESULT', schemaVersion: 1, suiteId: suite.suiteId, suiteSha256: regressionSuiteSha256(suite), backend,
    suiteStatus: 'PASS', comparableFixtureState: verified ? 'VERIFIED' : 'NOT_PROVEN', caseResults: suite.cases.map((item, index) => ({ caseId: item.caseId,
      runId: `run-${backend}-${index}`, comparisonStatus: 'PASS', actual: expectedActual(index), fixtureCleanupStatus: verified ? 'VERIFIED' : 'NOT_REQUESTED' })) };
}

test('validates exact typed result artifacts and compares only normalized semantic outcome fields', () => {
  const left = result('PLAYWRIGHT', true), right = result('GAS_OOPIF', true);
  assert.equal(validateRegressionSuiteResultArtifact(left, suite).suiteStatus, 'PASS');
  assert.equal(compareRegressionSuiteResults(suite, left, right).status, 'PASS');
  assert.notEqual(left.caseResults[0].runId, right.caseResults[0].runId);
});

test('does not claim cross-backend parity without verified comparable fixture lifecycle evidence', () => {
  const comparison = compareRegressionSuiteResults(suite, result('PLAYWRIGHT'), result('GAS_OOPIF'));
  assert.equal(comparison.status, 'NOT_COMPARABLE');
  assert.equal(comparison.reason, 'COMPARABLE_SYNTHETIC_FIXTURE_STATE_NOT_PROVEN');
});

test('outcome differences, order differences, and expected-failure differences cannot normalize away', () => {
  const left = result('PLAYWRIGHT', true), right = result('GAS_OOPIF', true);
  const changedCaseIndex = right.caseResults.length - 1;
  const changedCase = right.caseResults[changedCaseIndex];
  const changedActual = { ...changedCase.actual!, status: 'FAIL' as const, stopReason: 'ACTION_FAILED', executedCount: 1,
    steps: changedCase.actual!.steps.map((step, index) => index === 0 ? { ...step, state: 'FAIL' as const, errorCode: 'ACTION_FAILED' } : { ...step, state: 'NOT_RUN' as const, errorCode: undefined }) };
  right.caseResults = right.caseResults.map((item, index) => index === changedCaseIndex ? { ...item, comparisonStatus: 'FAIL', actual: changedActual, errorCode: 'EXPECTED_OUTCOME_MISMATCH' } : item);
  right.suiteStatus = 'FAIL';
  assert.equal(compareRegressionSuiteResults(suite, left, right).status, 'FAIL');
  const reversed = result('GAS_OOPIF', true);
  reversed.caseResults = [...reversed.caseResults].reverse();
  assert.throws(() => validateRegressionSuiteResultArtifact(reversed, suite), /order\/identity mismatch/);
});

test('rejects corrupt schema, suite digest, missing coverage, duplicate fields, and unsafe raw values', () => {
  const valid = result('PLAYWRIGHT', true);
  assert.throws(() => validateRegressionSuiteResultArtifact({ ...valid, schemaVersion: 2 }, suite), /identity or digest/);
  assert.throws(() => validateRegressionSuiteResultArtifact({ ...valid, suiteSha256: '0'.repeat(64) }, suite), /identity or digest/);
  assert.throws(() => validateRegressionSuiteResultArtifact({ ...valid, caseResults: valid.caseResults.slice(1) }, suite), /coverage mismatch/);
  const raw = result('GAS_OOPIF', true);
  const unsafe = raw.caseResults[0];
  const unsafeArtifact = { ...raw, caseResults: [{ ...unsafe, actual: { ...unsafe.actual!, actualValue: 'private-dom-text' }, selector: '#private' }, ...raw.caseResults.slice(1)] } as unknown;
  assert.throws(() => validateRegressionSuiteResultArtifact(unsafeArtifact, suite), /unsupported or missing fields|unsafe fields/);
});

test('golden suite result projection contains no selector, expected assertion value, URL, or approval data', () => {
  const serialized = JSON.stringify(result('PLAYWRIGHT'));
  for (const forbidden of ['#synthetic-label', 'expected-synthetic-text', 'http://127.0.0.1', 'approvalReference', 'private-dom-text']) assert.equal(serialized.includes(forbidden), false);
});
