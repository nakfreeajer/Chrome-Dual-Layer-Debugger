import { safeRegressionErrorCode, regressionOutcomeMatches, type NormalizedRegressionOutcome, type RegressionSuite, type RegressionSuiteCase, type RegressionSuiteCaseResult, type RegressionSuiteResultArtifact, type RegressionTerminalStatus } from './RegressionSuite.js';
import { regressionSuiteSha256 } from './RegressionSuiteParser.js';
import type { TestingBackendId } from './ActionContract.js';

export interface RegressionCaseExecution {
  runId: string;
  outcome: NormalizedRegressionOutcome;
  fixtureCleanupStatus?: 'NOT_REQUESTED' | 'VERIFIED' | 'FAILED' | 'UNKNOWN';
}

export interface RegressionSuiteRunnerOptions {
  suite: RegressionSuite;
  backend: TestingBackendId;
  fixtureLifecycleRequested?: boolean;
  executeCase(testCase: RegressionSuiteCase, backend: TestingBackendId): Promise<RegressionCaseExecution>;
}

export function normalizeRegressionOutcome(testCase: RegressionSuiteCase, runnerResult: {
  status: RegressionTerminalStatus;
  stopReason?: string;
  generatedCount?: number;
  executedCount?: number;
  failedStepId?: string;
  stepResults?: readonly { stepId: string; operation?: string; ok: boolean; errorCode?: string; candidateId?: string }[];
  actionResults?: readonly { stepId: string; operation: string; ok: boolean; errorCode?: string; candidateId: string }[];
}): NormalizedRegressionOutcome {
  const actualSteps = testCase.kind === 'SMOKE' ? runnerResult.stepResults ?? [] : runnerResult.actionResults ?? [];
  const declared: Array<{ stepId: string; operation: import('./ActionContract.js').ActionOperation; candidateId?: string }> = testCase.kind === 'SMOKE' ? testCase.scenario.steps.map((step) => ({ stepId: step.stepId, operation: step.operation }))
    : testCase.expected.steps.map((step) => ({ stepId: step.stepId, operation: step.operation, candidateId: step.candidateId }));
  const orderedAndBounded = actualSteps.length <= declared.length && actualSteps.every((found, index) => {
    const expected = declared[index];
    return expected !== undefined && found.stepId === expected.stepId
      && found.operation === expected.operation
      && (expected.candidateId === undefined || found.candidateId === expected.candidateId);
  });
  const countEvidenceValid = testCase.kind === 'SMOKE'
    || (Number.isSafeInteger(runnerResult.generatedCount) && runnerResult.generatedCount === declared.length
      && Number.isSafeInteger(runnerResult.executedCount) && runnerResult.executedCount === actualSteps.length);
  if (!orderedAndBounded || !countEvidenceValid) {
    return { status: 'FAIL', stopReason: 'RUNNER_FAILED', generatedCount: declared.length, executedCount: 0,
      steps: declared.map((entry) => ({ stepId: entry.stepId, operation: entry.operation, state: 'NOT_RUN', ...(entry.candidateId ? { candidateId: entry.candidateId } : {}) })) };
  }
  const steps = declared.map((entry, index) => {
    const found = actualSteps[index];
    return { stepId: entry.stepId, operation: entry.operation, state: found ? found.ok ? 'PASS' as const : 'FAIL' as const : 'NOT_RUN' as const,
      ...(found && !found.ok ? { errorCode: safeRegressionErrorCode(found.errorCode) ?? 'RUNNER_FAILED' } : {}),
      ...(typeof entry.candidateId === 'string' ? { candidateId: entry.candidateId } : {}) };
  });
  const status = runnerResult.status;
  const failIndex = steps.findIndex((step) => step.state === 'FAIL');
  const stopReason = status === 'PASS' ? (testCase.kind === 'SMOKE' ? 'ALL_STEPS_COMPLETED' : runnerResult.stopReason ?? 'ALL_ACTIONS_COMPLETED')
    : status === 'BOUND_REACHED' ? 'DURATION_EXHAUSTED'
      : failIndex >= 0 ? steps[failIndex].errorCode ?? 'RUNNER_FAILED' : runnerResult.stopReason === 'TARGET_ENVELOPE_VIOLATION' ? 'TARGET_ENVELOPE_VIOLATION' : 'RUNNER_FAILED';
  return { status, stopReason, generatedCount: declared.length, executedCount: actualSteps.length, steps };
}

function matchesCase(testCase: RegressionSuiteCase, actual: NormalizedRegressionOutcome): boolean {
  return regressionOutcomeMatches(testCase.expected, actual);
}

export async function runRegressionSuite(options: RegressionSuiteRunnerOptions): Promise<RegressionSuiteResultArtifact> {
  const { suite, backend, executeCase } = options;
  if (!suite.eligibleBackends.includes(backend)) throw new Error(`BACKEND_NOT_SUITE_ELIGIBLE:${backend}`);
  const caseResults: RegressionSuiteCaseResult[] = [];
  let continueRun = true;
  for (const testCase of suite.cases) {
    if (!continueRun) {
      caseResults.push({ caseId: testCase.caseId, comparisonStatus: 'NOT_RUN', fixtureCleanupStatus: 'NOT_REQUESTED' });
      continue;
    }
    try {
      const execution = await executeCase(testCase, backend);
      const actual = execution.outcome;
      const cleanup = execution.fixtureCleanupStatus ?? (options.fixtureLifecycleRequested ? 'UNKNOWN' : 'NOT_REQUESTED');
      const expectedMatched = matchesCase(testCase, actual);
      const cleanupAllowsPass = cleanup === 'NOT_REQUESTED' || cleanup === 'VERIFIED';
      const matched = expectedMatched && cleanupAllowsPass;
      caseResults.push({ caseId: testCase.caseId, runId: execution.runId, comparisonStatus: matched ? 'PASS' : 'FAIL', actual,
        ...(matched ? {} : { errorCode: cleanupAllowsPass ? 'EXPECTED_OUTCOME_MISMATCH' : `FIXTURE_CLEANUP_${cleanup}` }), fixtureCleanupStatus: cleanup });
      if (!matched) continueRun = false;
    } catch (error) {
      const safeCode = error instanceof Error ? safeRegressionErrorCode(error.message) : undefined;
      caseResults.push({ caseId: testCase.caseId, comparisonStatus: 'FAIL', errorCode: safeCode ?? 'RUNNER_FAILED',
        fixtureCleanupStatus: options.fixtureLifecycleRequested ? 'UNKNOWN' : 'NOT_REQUESTED' });
      continueRun = false;
    }
  }
  const suiteStatus = caseResults.every((result) => result.comparisonStatus === 'PASS' && ['NOT_REQUESTED', 'VERIFIED'].includes(result.fixtureCleanupStatus)) ? 'PASS' : 'FAIL';
  const comparableFixtureState = options.fixtureLifecycleRequested
    && caseResults.length > 0 && caseResults.every((result) => result.fixtureCleanupStatus === 'VERIFIED') ? 'VERIFIED' : 'NOT_PROVEN';
  return { kind: 'CDLD_TEST1F_SUITE_RESULT', schemaVersion: 1, suiteId: suite.suiteId, suiteSha256: regressionSuiteSha256(suite),
    backend, suiteStatus, caseResults, comparableFixtureState };
}
