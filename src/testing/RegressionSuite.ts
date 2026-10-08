import type { TestingBackendId, ActionOperation } from './ActionContract.js';
import type { ExploratoryProfile } from './ExploratoryProfile.js';
import type { SmokeScenario } from './SmokeScenario.js';
import { isDeepStrictEqual } from 'node:util';
import { regressionSuiteSha256 } from './RegressionSuiteParser.js';

export type RegressionStepState = 'PASS' | 'FAIL' | 'NOT_RUN';
export type RegressionTerminalStatus = 'PASS' | 'FAIL' | 'BOUND_REACHED';
export interface ExpectedRegressionStep { stepId: string; state: RegressionStepState; errorCode?: string; }
export interface ExpectedSmokeOutcome { status: 'PASS' | 'FAIL'; steps: readonly ExpectedRegressionStep[]; }
export interface ExpectedMonkeyStep extends ExpectedRegressionStep { candidateId: string; operation: ActionOperation; }
export interface ExpectedMonkeyOutcome {
  status: RegressionTerminalStatus;
  stopReason: string;
  generatedCount: number;
  executedCount: number;
  steps: readonly ExpectedMonkeyStep[];
}
export interface SmokeRegressionCase { caseId: string; kind: 'SMOKE'; scenario: SmokeScenario; expected: ExpectedSmokeOutcome; }
export interface MonkeyRegressionCase { caseId: string; kind: 'MONKEY'; profile: ExploratoryProfile; seed: number; expected: ExpectedMonkeyOutcome; }
export type RegressionSuiteCase = SmokeRegressionCase | MonkeyRegressionCase;
export interface RegressionSuite {
  schemaVersion: 1;
  suiteId: string;
  eligibleBackends: readonly TestingBackendId[];
  /** V1 intentionally has no ignored outcome fields. */
  nondeterministicFields: readonly [];
  cases: readonly RegressionSuiteCase[];
}

export interface NormalizedRegressionStep {
  stepId: string;
  operation: ActionOperation;
  state: RegressionStepState;
  errorCode?: string;
  candidateId?: string;
}

export interface NormalizedRegressionOutcome {
  status: RegressionTerminalStatus;
  stopReason: string;
  generatedCount: number;
  executedCount: number;
  steps: readonly NormalizedRegressionStep[];
}

export interface RegressionSuiteCaseResult {
  caseId: string;
  runId?: string;
  comparisonStatus: 'PASS' | 'FAIL' | 'NOT_RUN';
  actual?: NormalizedRegressionOutcome;
  errorCode?: string;
  fixtureCleanupStatus: 'NOT_REQUESTED' | 'VERIFIED' | 'FAILED' | 'UNKNOWN';
}

export interface RegressionSuiteResultArtifact {
  kind: 'CDLD_TEST1F_SUITE_RESULT';
  schemaVersion: 1;
  suiteId: string;
  suiteSha256: string;
  backend: TestingBackendId;
  suiteStatus: 'PASS' | 'FAIL';
  caseResults: readonly RegressionSuiteCaseResult[];
  /** Cross-backend comparison is allowed only with explicit verified fixture evidence. */
  comparableFixtureState: 'VERIFIED' | 'NOT_PROVEN';
}

export interface RegressionSuiteComparison {
  status: 'PASS' | 'FAIL' | 'NOT_COMPARABLE';
  reason: string;
  suiteId: string;
  leftBackend: TestingBackendId;
  rightBackend: TestingBackendId;
}

const SAFE_ERRORS = new Set(['ACTION_FAILED', 'ASSERTION_FAILED', 'AUTHORIZATION_REQUIRED', 'TARGET_MISMATCH', 'TIMEOUT', 'REPLAY_PLAN_MISMATCH', 'TARGET_ENVELOPE_VIOLATION', 'OBSERVER_LIFECYCLE_FAILED', 'DURATION_EXHAUSTED', 'RUNNER_FAILED', 'EXPECTED_OUTCOME_MISMATCH', 'FIXTURE_CLEANUP_FAILED', 'FIXTURE_CLEANUP_UNKNOWN']);
const SAFE_STOP_REASONS = new Set(['ALL_STEPS_COMPLETED', 'ALL_ACTIONS_COMPLETED', ...SAFE_ERRORS]);
export function safeRegressionErrorCode(code: unknown): string | undefined {
  return typeof code === 'string' && SAFE_ERRORS.has(code) ? code : undefined;
}

export function regressionOutcomeMatches(expected: ExpectedSmokeOutcome | ExpectedMonkeyOutcome, actual: NormalizedRegressionOutcome): boolean {
  const expectedSteps = expected.steps.map((step) => ({ stepId: step.stepId, state: step.state,
    ...(step.errorCode ? { errorCode: step.errorCode } : {}), ...(typeof (step as ExpectedMonkeyStep).candidateId === 'string' ? { candidateId: (step as ExpectedMonkeyStep).candidateId, operation: (step as ExpectedMonkeyStep).operation } : {}) }));
  const actualSteps = actual.steps.map((step) => ({ stepId: step.stepId, state: step.state,
    ...(step.errorCode ? { errorCode: step.errorCode } : {}), ...('candidateId' in step ? { candidateId: step.candidateId, operation: step.operation } : {}) }));
  if (expected.status !== actual.status || !isDeepStrictEqual(expectedSteps, actualSteps)) return false;
  if ('generatedCount' in expected) return expected.stopReason === actual.stopReason
    && expected.generatedCount === actual.generatedCount && expected.executedCount === actual.executedCount;
  const expectedFailure = expected.steps.find((step) => step.state === 'FAIL');
  const expectedStopReason = expected.status === 'PASS' ? 'ALL_STEPS_COMPLETED' : expectedFailure?.errorCode;
  return expected.steps.length === actual.steps.length && expectedStopReason !== undefined && actual.stopReason === expectedStopReason
    && actual.generatedCount === expected.steps.length
    && actual.executedCount === expected.steps.filter((step) => step.state !== 'NOT_RUN').length;
}

function normalizedResultCase(value: unknown, suite: RegressionSuite, index: number): RegressionSuiteCaseResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`caseResults[${index}] must be an object`);
  const item = value as Record<string, unknown>;
  const allowed = new Set(['caseId', 'comparisonStatus', 'actual', 'runId', 'errorCode', 'fixtureCleanupStatus']);
  if (Object.keys(item).some((key) => !allowed.has(key)) || !['caseId', 'comparisonStatus', 'fixtureCleanupStatus'].every((key) => key in item)) throw new Error(`caseResults[${index}] contains unsupported or missing fields`);
  const expected = suite.cases[index];
  if (!expected || item.caseId !== expected.caseId) throw new Error(`caseResults[${index}] case order/identity mismatch`);
  if (!['PASS', 'FAIL', 'NOT_RUN'].includes(String(item.comparisonStatus))) throw new Error(`caseResults[${index}] comparisonStatus is invalid`);
  if (!['NOT_REQUESTED', 'VERIFIED', 'FAILED', 'UNKNOWN'].includes(String(item.fixtureCleanupStatus))) throw new Error(`caseResults[${index}] fixtureCleanupStatus is invalid`);
  if (item.runId !== undefined && (typeof item.runId !== 'string' || !item.runId.trim() || item.runId.length > 128)) throw new Error(`caseResults[${index}] runId is invalid`);
  if (item.errorCode !== undefined && !safeRegressionErrorCode(item.errorCode)) throw new Error(`caseResults[${index}] errorCode is invalid`);
  if (item.actual !== undefined) {
    if (typeof item.actual !== 'object' || item.actual === null || Array.isArray(item.actual)) throw new Error(`caseResults[${index}] actual is invalid`);
    const actual = item.actual as Record<string, unknown>;
    if (Object.keys(actual).sort().join(',') !== ['executedCount', 'generatedCount', 'status', 'steps', 'stopReason'].sort().join(',')
      || !['PASS', 'FAIL', 'BOUND_REACHED'].includes(String(actual.status)) || typeof actual.stopReason !== 'string' || !SAFE_STOP_REASONS.has(actual.stopReason)
      || !Number.isSafeInteger(actual.generatedCount) || !Number.isSafeInteger(actual.executedCount) || (actual.generatedCount as number) < 0
      || (actual.executedCount as number) < 0 || (actual.executedCount as number) > (actual.generatedCount as number) || !Array.isArray(actual.steps)) throw new Error(`caseResults[${index}] actual is malformed`);
    const expectedSteps = expected.kind === 'SMOKE' ? expected.scenario.steps : undefined;
    const stepLimit = expectedSteps?.length ?? expected.expected.steps.length;
    if (actual.generatedCount !== stepLimit || (expected.kind === 'SMOKE' && actual.status === 'BOUND_REACHED')) throw new Error(`caseResults[${index}] actual generated count or terminal status conflicts with the suite`);
    if (actual.steps.length !== stepLimit) throw new Error(`caseResults[${index}] actual step coverage mismatch`);
    let observedCount = 0;
    let seenTerminal = false;
    for (let stepIndex = 0; stepIndex < actual.steps.length; stepIndex += 1) {
      const step = actual.steps[stepIndex] as Record<string, unknown>;
      if (typeof step !== 'object' || step === null || Array.isArray(step)) throw new Error(`caseResults[${index}].actual.steps[${stepIndex}] is malformed`);
      const stepAllowed = new Set(['stepId', 'operation', 'state', 'errorCode', 'candidateId']);
      if (Object.keys(step).some((key) => !stepAllowed.has(key)) || !['stepId', 'operation', 'state'].every((key) => key in step)) throw new Error(`caseResults[${index}].actual.steps[${stepIndex}] has unsafe fields`);
      if (!['PASS', 'FAIL', 'NOT_RUN'].includes(String(step.state)) || !safeRegressionErrorCode(step.errorCode) && step.errorCode !== undefined
        || step.errorCode !== undefined && step.state !== 'FAIL') throw new Error(`caseResults[${index}].actual.steps[${stepIndex}] is invalid`);
      const expectedId = expected.kind === 'SMOKE' ? expected.scenario.steps[stepIndex].stepId : expected.expected.steps[stepIndex].stepId;
      const expectedOperation = expected.kind === 'SMOKE' ? expected.scenario.steps[stepIndex].operation : expected.expected.steps[stepIndex].operation;
      if (step.stepId !== expectedId || step.operation !== expectedOperation) throw new Error(`caseResults[${index}].actual step order/identity mismatch`);
      if (expected.kind === 'MONKEY') {
        if (step.candidateId !== expected.expected.steps[stepIndex].candidateId) throw new Error(`caseResults[${index}].actual candidate identity mismatch`);
      } else if ('candidateId' in step) throw new Error(`caseResults[${index}].actual contains unexpected candidate identity`);
      if (step.state === 'NOT_RUN') seenTerminal = true;
      else {
        if (seenTerminal) throw new Error(`caseResults[${index}].actual contains an outcome after NOT_RUN`);
        observedCount += 1;
      }
      if (step.state === 'FAIL') {
        if (step.errorCode === undefined) throw new Error(`caseResults[${index}].actual failure requires a safe error code`);
        seenTerminal = true;
      }
    }
    if (actual.executedCount !== observedCount) throw new Error(`caseResults[${index}] actual executed count conflicts with step evidence`);
    const states = actual.steps.map((step) => (step as Record<string, unknown>).state);
    if (actual.status === 'PASS' && (actual.executedCount !== stepLimit || states.some((state) => state !== 'PASS'))) throw new Error(`caseResults[${index}] PASS conflicts with step evidence`);
    if (actual.status === 'BOUND_REACHED' && (states.includes('FAIL') || !states.includes('NOT_RUN') || actual.stopReason !== 'DURATION_EXHAUSTED')) throw new Error(`caseResults[${index}] BOUND_REACHED conflicts with step evidence`);
    if (actual.status === 'FAIL' && states.includes('FAIL') && actual.stopReason !== (actual.steps[states.indexOf('FAIL')] as Record<string, unknown>).errorCode) throw new Error(`caseResults[${index}] failure stop reason conflicts with step evidence`);
    if (actual.status === 'PASS' && actual.stopReason !== (expected.kind === 'SMOKE' ? 'ALL_STEPS_COMPLETED' : 'ALL_ACTIONS_COMPLETED')) throw new Error(`caseResults[${index}] PASS stop reason is invalid`);
    if (item.comparisonStatus === 'PASS' && !regressionOutcomeMatches(expected.expected, actual as unknown as NormalizedRegressionOutcome)) throw new Error(`caseResults[${index}] PASS does not match expected outcome`);
  } else if (item.comparisonStatus !== 'NOT_RUN' && item.errorCode === undefined) throw new Error(`caseResults[${index}] requires actual outcome or safe errorCode`);
  if (item.comparisonStatus === 'PASS' && (item.actual === undefined || item.runId === undefined || item.errorCode !== undefined)) throw new Error(`caseResults[${index}] PASS requires run identity and matching outcome evidence`);
  if (item.comparisonStatus === 'FAIL' && item.errorCode === undefined) throw new Error(`caseResults[${index}] FAIL requires a safe error code`);
  if (item.comparisonStatus === 'PASS' && item.fixtureCleanupStatus !== 'NOT_REQUESTED' && item.fixtureCleanupStatus !== 'VERIFIED') throw new Error(`caseResults[${index}] PASS has unverified fixture cleanup`);
  if (item.comparisonStatus === 'NOT_RUN' && (item.actual !== undefined || item.runId !== undefined || item.errorCode !== undefined)) throw new Error(`caseResults[${index}] NOT_RUN must not claim execution evidence`);
  return item as unknown as RegressionSuiteCaseResult;
}

/** Strictly validates a persisted run result against its exact suite and ordered case coverage. */
export function validateRegressionSuiteResultArtifact(input: unknown, suite: RegressionSuite): RegressionSuiteResultArtifact {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('suite result must be an object');
  const value = input as Record<string, unknown>;
  const allowed = ['kind', 'schemaVersion', 'suiteId', 'suiteSha256', 'backend', 'suiteStatus', 'caseResults', 'comparableFixtureState'];
  if (Object.keys(value).sort().join(',') !== allowed.sort().join(',')) throw new Error('suite result contains unsupported or missing fields');
  if (value.kind !== 'CDLD_TEST1F_SUITE_RESULT' || value.schemaVersion !== 1 || value.suiteId !== suite.suiteId
    || value.suiteSha256 !== regressionSuiteSha256(suite)) throw new Error('suite result identity or digest mismatch');
  if (value.backend !== 'PLAYWRIGHT' && value.backend !== 'GAS_OOPIF') throw new Error('suite result backend is invalid');
  if (!suite.eligibleBackends.includes(value.backend)) throw new Error('suite result backend is not eligible');
  if (value.suiteStatus !== 'PASS' && value.suiteStatus !== 'FAIL') throw new Error('suite result status is invalid');
  if (value.comparableFixtureState !== 'VERIFIED' && value.comparableFixtureState !== 'NOT_PROVEN') throw new Error('suite result fixture proof state is invalid');
  if (!Array.isArray(value.caseResults) || value.caseResults.length !== suite.cases.length) throw new Error('suite result case coverage mismatch');
  const caseResults = value.caseResults.map((item, index) => normalizedResultCase(item, suite, index));
  const runIds = caseResults.flatMap((item) => item.runId ? [item.runId] : []);
  if (new Set(runIds).size !== runIds.length) throw new Error('suite result runId values must be unique per case');
  const firstNonPass = caseResults.findIndex((item) => item.comparisonStatus !== 'PASS');
  if (firstNonPass >= 0 && caseResults.slice(firstNonPass + 1).some((item) => item.comparisonStatus !== 'NOT_RUN')) throw new Error('suite result violates fail-fast case ordering');
  const computedStatus = caseResults.every((item) => item.comparisonStatus === 'PASS' && ['NOT_REQUESTED', 'VERIFIED'].includes(item.fixtureCleanupStatus)) ? 'PASS' : 'FAIL';
  if (value.suiteStatus !== computedStatus) throw new Error('suite result terminal status conflicts with case evidence');
  if (value.comparableFixtureState === 'VERIFIED' && (caseResults.length === 0 || caseResults.some((item) => item.fixtureCleanupStatus !== 'VERIFIED'))) throw new Error('fixture comparison proof requires verified cleanup for every case');
  return value as unknown as RegressionSuiteResultArtifact;
}

/** Compares only a fixed semantic projection; run IDs and target/session identities are excluded by construction. */
export function compareRegressionSuiteResults(suite: RegressionSuite, leftInput: unknown, rightInput: unknown): RegressionSuiteComparison {
  const left = validateRegressionSuiteResultArtifact(leftInput, suite);
  const right = validateRegressionSuiteResultArtifact(rightInput, suite);
  if (left.backend === right.backend) throw new Error('cross-backend comparison requires two distinct backends');
  if (!suite.eligibleBackends.includes(left.backend) || !suite.eligibleBackends.includes(right.backend)) throw new Error('comparison backend is not suite-eligible');
  if (left.comparableFixtureState !== 'VERIFIED' || right.comparableFixtureState !== 'VERIFIED') {
    return { status: 'NOT_COMPARABLE', reason: 'COMPARABLE_SYNTHETIC_FIXTURE_STATE_NOT_PROVEN', suiteId: suite.suiteId, leftBackend: left.backend, rightBackend: right.backend };
  }
  const projection = (artifact: RegressionSuiteResultArtifact) => artifact.caseResults.map(({ caseId, comparisonStatus, actual, errorCode }) => ({ caseId, comparisonStatus, actual, errorCode }));
  const matches = isDeepStrictEqual(projection(left), projection(right)) && left.suiteStatus === 'PASS' && right.suiteStatus === 'PASS';
  return { status: matches ? 'PASS' : 'FAIL', reason: matches ? 'NORMALIZED_OUTCOMES_MATCH' : 'NORMALIZED_OUTCOMES_DIFFER', suiteId: suite.suiteId, leftBackend: left.backend, rightBackend: right.backend };
}
