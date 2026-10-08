import { createHash } from 'node:crypto';
import { capabilityStatus } from './CapabilityMatrix.js';
import { validateExploratorySeed, generateExploratoryPlan } from './ExploratoryGenerator.js';
import { parseExploratoryProfile } from './ExploratoryProfileParser.js';
import { parseSmokeScenario } from './SmokeScenarioParser.js';
import type { ExpectedMonkeyOutcome, ExpectedRegressionStep, ExpectedSmokeOutcome, RegressionSuite, RegressionSuiteCase, RegressionTerminalStatus } from './RegressionSuite.js';
import type { ActionOperation, TestingBackendId } from './ActionContract.js';

const SAFE_ERROR_CODES = new Set(['ACTION_FAILED', 'ASSERTION_FAILED', 'AUTHORIZATION_REQUIRED', 'TARGET_MISMATCH', 'TIMEOUT', 'REPLAY_PLAN_MISMATCH', 'TARGET_ENVELOPE_VIOLATION', 'OBSERVER_LIFECYCLE_FAILED', 'DURATION_EXHAUSTED', 'RUNNER_FAILED']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const ROOT_FIELDS = new Set(['schemaVersion', 'suiteId', 'eligibleBackends', 'nondeterministicFields', 'cases']);
const CASE_FIELDS = {
  SMOKE: new Set(['caseId', 'kind', 'scenario', 'expected']),
  MONKEY: new Set(['caseId', 'kind', 'profile', 'seed', 'expected'])
};
const EXPECTED_SMOKE_FIELDS = new Set(['status', 'steps']);
const EXPECTED_MONKEY_FIELDS = new Set(['status', 'stopReason', 'generatedCount', 'executedCount', 'steps']);
const EXPECTED_STEP_FIELDS = new Set(['stepId', 'state', 'errorCode']);
const EXPECTED_MONKEY_STEP_FIELDS = new Set([...EXPECTED_STEP_FIELDS, 'candidateId', 'operation']);

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exactFields(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
}
function validId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`${label} is invalid`);
  return value;
}
function safeErrorCode(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ERROR_CODES.has(value)) throw new Error(`${label} is not a supported safe error code`);
  return value;
}
function integer(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return value as number;
}
function parseExpectedSteps(input: unknown, ids: readonly string[], label: string, monkey = false): ExpectedRegressionStep[] {
  if (!Array.isArray(input) || input.length !== ids.length) throw new Error(`${label} must contain exactly ${ids.length} ordered steps`);
  const result = input.map((raw, index) => {
    const value = object(raw, `${label}[${index}]`);
    exactFields(value, monkey ? EXPECTED_MONKEY_STEP_FIELDS : EXPECTED_STEP_FIELDS, `${label}[${index}]`);
    const stepId = validId(value.stepId, `${label}[${index}].stepId`);
    if (stepId !== ids[index]) throw new Error(`${label} order or stepId mismatch at index ${index}`);
    if (!['PASS', 'FAIL', 'NOT_RUN'].includes(String(value.state))) throw new Error(`${label}[${index}].state is invalid`);
    if (value.errorCode !== undefined && value.state !== 'FAIL') throw new Error(`${label}[${index}].errorCode is only valid for FAIL`);
    if (value.state === 'FAIL' && value.errorCode === undefined) throw new Error(`${label}[${index}].errorCode is required for FAIL`);
    return { stepId, state: value.state as ExpectedRegressionStep['state'], ...(value.errorCode !== undefined ? { errorCode: safeErrorCode(value.errorCode, `${label}[${index}].errorCode`) } : {}) };
  });
  const failAt = result.findIndex((step) => step.state === 'FAIL');
  if (failAt >= 0 && (result.slice(0, failAt).some((step) => step.state !== 'PASS') || result.slice(failAt + 1).some((step) => step.state !== 'NOT_RUN'))) throw new Error(`${label} must be an ordered PASS prefix, one FAIL, then a NOT_RUN suffix`);
  if (failAt < 0 && result.some((step) => step.state !== 'PASS' && step.state !== 'NOT_RUN')) throw new Error(`${label} states are inconsistent`);
  return result;
}
function assertStatusSteps(status: RegressionTerminalStatus, steps: readonly ExpectedRegressionStep[], label: string): void {
  const failAt = steps.findIndex((step) => step.state === 'FAIL');
  if (status === 'PASS' && (failAt >= 0 || steps.some((step) => step.state !== 'PASS'))) throw new Error(`${label} PASS requires every step to PASS`);
  if (status === 'FAIL' && (failAt < 0 || steps.some((step, index) => index < failAt ? step.state !== 'PASS' : index === failAt ? step.state !== 'FAIL' : step.state !== 'NOT_RUN'))) throw new Error(`${label} FAIL requires a failed step and NOT_RUN suffix`);
  if (status === 'BOUND_REACHED' && (failAt >= 0 || !steps.some((step) => step.state === 'NOT_RUN'))) throw new Error(`${label} BOUND_REACHED requires a PASS prefix and NOT_RUN suffix`);
}
function parseSmokeExpected(input: unknown, stepIds: readonly string[]): ExpectedSmokeOutcome {
  const value = object(input, 'expected');
  exactFields(value, EXPECTED_SMOKE_FIELDS, 'expected');
  if (value.status !== 'PASS' && value.status !== 'FAIL') throw new Error('expected.status must be PASS or FAIL');
  const steps = parseExpectedSteps(value.steps, stepIds, 'expected.steps');
  assertStatusSteps(value.status, steps, 'expected');
  return { status: value.status, steps };
}
function parseMonkeyExpected(input: unknown, plan: ReturnType<typeof generateExploratoryPlan>): ExpectedMonkeyOutcome {
  const value = object(input, 'expected');
  exactFields(value, EXPECTED_MONKEY_FIELDS, 'expected');
  const status = value.status as RegressionTerminalStatus;
  if (!['PASS', 'FAIL', 'BOUND_REACHED'].includes(status)) throw new Error('expected.status is invalid');
  const stopReason = typeof value.stopReason === 'string' ? value.stopReason : '';
  if (status === 'PASS' && stopReason !== 'ALL_ACTIONS_COMPLETED') throw new Error('expected.stopReason must be ALL_ACTIONS_COMPLETED for PASS');
  if (status === 'BOUND_REACHED' && stopReason !== 'DURATION_EXHAUSTED') throw new Error('expected.stopReason must be DURATION_EXHAUSTED for BOUND_REACHED');
  const generatedCount = integer(value.generatedCount, 1, 100, 'expected.generatedCount');
  const executedCount = integer(value.executedCount, 0, generatedCount, 'expected.executedCount');
  if (generatedCount !== plan.plan.length) throw new Error('expected.generatedCount does not match the deterministic plan');
  const expectedSteps = value.steps;
  if (!Array.isArray(expectedSteps) || expectedSteps.length !== plan.plan.length) throw new Error('expected.steps must match the complete generated plan');
  const steps = expectedSteps.map((raw, index) => {
    const item = object(raw, `expected.steps[${index}]`);
    exactFields(item, EXPECTED_MONKEY_STEP_FIELDS, `expected.steps[${index}]`);
    if (item.candidateId !== plan.plan[index].candidateId || item.operation !== plan.plan[index].operation) throw new Error(`expected.steps[${index}] does not match generated plan`);
    return { ...parseExpectedSteps([item], [plan.plan[index].stepId], `expected.steps[${index}]`, true)[0], candidateId: plan.plan[index].candidateId, operation: plan.plan[index].operation };
  });
  assertStatusSteps(status, steps, 'expected');
  const actualExecuted = steps.filter((step) => step.state !== 'NOT_RUN').length;
  if (actualExecuted !== executedCount) throw new Error('expected.executedCount does not match expected step states');
  if (status === 'PASS' && executedCount !== generatedCount) throw new Error('expected PASS must execute the complete plan');
  if (status === 'BOUND_REACHED' && executedCount >= generatedCount) throw new Error('expected BOUND_REACHED must leave at least one action NOT_RUN');
  const failed = steps.find((step) => step.state === 'FAIL');
  if (status === 'FAIL' && (!failed || stopReason !== failed.errorCode)) throw new Error('expected FAIL stopReason must equal its failed step errorCode');
  return { status, stopReason, generatedCount, executedCount, steps };
}

export function parseRegressionSuite(input: unknown): RegressionSuite {
  const root = object(input, 'suite');
  exactFields(root, ROOT_FIELDS, 'suite');
  if (root.schemaVersion !== 1) throw new Error('suite.schemaVersion must be 1');
  const suiteId = validId(root.suiteId, 'suite.suiteId');
  if (!Array.isArray(root.eligibleBackends) || root.eligibleBackends.length < 1 || root.eligibleBackends.length > 2) throw new Error('suite.eligibleBackends must contain one or two backends');
  const eligibleBackends = root.eligibleBackends.map((backend, index) => {
    if (backend !== 'PLAYWRIGHT' && backend !== 'GAS_OOPIF') throw new Error(`suite.eligibleBackends[${index}] is unsupported`);
    return backend as TestingBackendId;
  });
  if (new Set(eligibleBackends).size !== eligibleBackends.length) throw new Error('suite.eligibleBackends must be unique');
  if (!Array.isArray(root.nondeterministicFields) || root.nondeterministicFields.length !== 0) throw new Error('suite.nondeterministicFields must be exactly [] in schema v1');
  if (!Array.isArray(root.cases) || root.cases.length < 1 || root.cases.length > 10) throw new Error('suite.cases must contain between 1 and 10 cases');
  const submittedCaseIds = root.cases.map((raw, index) => validId(object(raw, `suite.cases[${index}]`).caseId, `suite.cases[${index}].caseId`));
  if (new Set(submittedCaseIds).size !== submittedCaseIds.length) throw new Error('suite caseId values must be unique');
  let totalSteps = 0;
  let durationBudgetMs = 0;
  const definitionIds = new Set<string>();
  const cases: RegressionSuiteCase[] = root.cases.map((raw, index) => {
    const value = object(raw, `suite.cases[${index}]`);
    if (value.kind !== 'SMOKE' && value.kind !== 'MONKEY') throw new Error(`suite.cases[${index}].kind is invalid`);
    exactFields(value, CASE_FIELDS[value.kind], `suite.cases[${index}]`);
    const caseId = validId(value.caseId, `suite.cases[${index}].caseId`);
    if (value.kind === 'SMOKE') {
      const scenario = parseSmokeScenario(value.scenario);
      if (definitionIds.has(scenario.scenarioId)) throw new Error(`suite scenario/profile identity must be unique: ${scenario.scenarioId}`);
      definitionIds.add(scenario.scenarioId);
      const expected = parseSmokeExpected(value.expected, scenario.steps.map((step) => step.stepId));
      totalSteps += scenario.steps.length;
      durationBudgetMs += scenario.steps.reduce((sum, step) => sum + (step.timeoutMs ?? 5000), 0);
      return { caseId, kind: 'SMOKE', scenario, expected };
    }
    const profile = parseExploratoryProfile(value.profile);
    if (definitionIds.has(profile.profileId)) throw new Error(`suite scenario/profile identity must be unique: ${profile.profileId}`);
    definitionIds.add(profile.profileId);
    const seed = validateExploratorySeed(value.seed);
    const plan = generateExploratoryPlan(profile, seed);
    const expected = parseMonkeyExpected(value.expected, plan);
    totalSteps += plan.plan.length;
    durationBudgetMs += profile.bounds.maxDurationMs;
    return { caseId, kind: 'MONKEY', profile, seed, expected };
  });
  const caseIds = cases.map((item) => item.caseId);
  if (new Set(caseIds).size !== caseIds.length) throw new Error('suite caseId values must be unique');
  if (totalSteps > 100) throw new Error('suite total step/action count exceeds 100');
  if (durationBudgetMs > 120_000) throw new Error('suite worst-case declared execution budget exceeds 120000ms');
  const operations: ActionOperation[] = cases.flatMap((item) => item.kind === 'SMOKE'
    ? item.scenario.steps.map((step) => step.operation)
    : item.profile.candidates.map((candidate) => candidate.operation));
  for (const backend of eligibleBackends) for (const operation of operations) {
    if (capabilityStatus(operation, backend) !== 'PASS') throw new Error(`suite declares ${backend} ineligible for ${operation}`);
  }
  return { schemaVersion: 1, suiteId, eligibleBackends, nondeterministicFields: [], cases };
}

export function regressionSuiteSha256(suite: RegressionSuite): string {
  return createHash('sha256').update(JSON.stringify(suite), 'utf8').digest('hex');
}
