import type { Timeline } from '../trace/Timeline.js';
import { isDeepStrictEqual } from 'node:util';

export type TestingBackendId = 'PLAYWRIGHT' | 'GAS_OOPIF';
export type TestMode = 'OBSERVE' | 'TEST';

/** Explicit Human/Architect authorization bound to exactly one designated fixture target. */
export interface TestTargetAuthorization {
  mode: 'TEST';
  backend: TestingBackendId;
  targetId: string;
  fixtureId: string;
  approvalReference: string;
}

export type ActionOperation =
  | 'click' | 'fill' | 'type' | 'clear' | 'press'
  | 'scroll' | 'scrollIntoView' | 'hover' | 'focus'
  | 'check' | 'uncheck' | 'select'
  | 'readText' | 'readValue' | 'readState' | 'exists' | 'visible' | 'waitFor' | 'ready';

export type AssertionPredicate = 'truthy' | 'falsy' | 'equals' | 'notEquals' | 'contains' | 'notContains';

export function evaluateAssertionPredicate(actual: unknown, predicate: AssertionPredicate, expected?: unknown): boolean {
  switch (predicate) {
    case 'truthy': return Boolean(actual);
    case 'falsy': return !Boolean(actual);
    case 'equals': return isDeepStrictEqual(actual, expected);
    case 'notEquals': return !isDeepStrictEqual(actual, expected);
    case 'contains':
      if (typeof actual !== 'string' || typeof expected !== 'string' || expected.length > 4096) return false;
      return actual.includes(expected);
    case 'notContains':
      if (typeof actual !== 'string' || typeof expected !== 'string' || expected.length > 4096) return false;
      return !actual.includes(expected);
  }
}

export interface ActionStep {
  stepId: string;
  scenarioId?: string;
  operation: ActionOperation;
  selector?: string;
  value?: string;
  key?: string;
  deltaX?: number;
  deltaY?: number;
  timeoutMs?: number;
}

export interface ActionScenario {
  scenarioId: string;
  steps: readonly ActionStep[];
}

export interface ActionOutcome {
  stepId: string;
  operation: ActionOperation;
  backend: TestingBackendId;
  ok: boolean;
  value?: unknown;
  errorCode?: string;
  assertionEvent?: { runId: string; eventId: string };
}

export interface ActionBackend {
  readonly backend: TestingBackendId;
  readonly targetId: string;
  execute(step: ActionStep, authorization?: TestTargetAuthorization): Promise<ActionOutcome>;
  assert(step: ActionStep, predicate: AssertionPredicate, expected?: unknown, authorization?: TestTargetAuthorization): Promise<ActionOutcome>;
}

export function validateTestAuthorization(
  backend: TestingBackendId,
  targetId: string,
  authorization: TestTargetAuthorization | undefined
): void {
  if (!authorization || authorization.mode !== 'TEST') throw new Error('AUTHORIZATION_REQUIRED');
  if (authorization.backend !== backend || authorization.targetId !== targetId) throw new Error('TARGET_MISMATCH');
  if (!authorization.fixtureId.trim() || !authorization.approvalReference.trim()) throw new Error('AUTHORIZATION_REQUIRED');
}

const MUTATING_OPERATIONS = new Set<ActionOperation>([
  'click', 'fill', 'type', 'clear', 'press', 'scroll', 'scrollIntoView', 'hover', 'focus', 'check', 'uncheck', 'select'
]);

export function boundedTimeoutMs(value = 5000): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) throw new Error('TIMEOUT');
  return value;
}

export function isMutatingOperation(operation: ActionOperation): boolean {
  return MUTATING_OPERATIONS.has(operation);
}

export async function executeWithTimeline(
  backend: ActionBackend,
  step: ActionStep,
  timeline: Timeline,
  authorization?: TestTargetAuthorization
): Promise<ActionOutcome> {
  const source = backend.backend === 'PLAYWRIGHT' ? 'PLAYWRIGHT' : 'GAS';
  timeline.append(timeline.create({ source, category: 'ACTION', type: 'ACTION_STARTED', data: { ...(step.scenarioId ? { scenarioId: step.scenarioId } : {}), stepId: step.stepId, operation: step.operation } }));
  try {
    const outcome = await backend.execute(step, authorization);
    timeline.append(timeline.create({ source, category: 'ACTION', type: outcome.ok ? 'ACTION_COMPLETED' : 'ACTION_FAILED', data: { ...(step.scenarioId ? { scenarioId: step.scenarioId } : {}), stepId: step.stepId, operation: step.operation, errorCode: outcome.errorCode } }));
    return outcome;
  } catch {
    const outcome: ActionOutcome = { stepId: step.stepId, operation: step.operation, backend: backend.backend, ok: false, errorCode: 'ACTION_FAILED' };
    timeline.append(timeline.create({ source, category: 'ACTION', type: 'ACTION_FAILED', data: { ...(step.scenarioId ? { scenarioId: step.scenarioId } : {}), stepId: step.stepId, operation: step.operation, errorCode: outcome.errorCode } }));
    return outcome;
  }
}

export async function assertWithTimeline(
  backend: ActionBackend,
  step: ActionStep,
  predicate: AssertionPredicate,
  expected: unknown,
  timeline: Timeline,
  authorization?: TestTargetAuthorization
): Promise<ActionOutcome> {
  const measured = await backend.execute(step, authorization);
  const predicatePassed = measured.ok && evaluateAssertionPredicate(measured.value, predicate, expected);
  const ok = measured.ok && predicatePassed;
  const errorCode = !measured.ok ? measured.errorCode : ok ? undefined : 'ASSERTION_FAILED';
  const event = timeline.create({ source: backend.backend === 'PLAYWRIGHT' ? 'PLAYWRIGHT' : 'GAS', category: 'ASSERTION', type: ok ? 'ASSERTION_PASSED' : 'ASSERTION_FAILED', data: {
    ...(step.scenarioId ? { scenarioId: step.scenarioId } : {}), stepId: step.stepId, operation: step.operation, predicate,
    actualType: valueType(measured.value), ...(predicate === 'truthy' || predicate === 'falsy' ? {} : { expectedType: valueType(expected) }),
    ...(errorCode ? { errorCode } : {})
  } });
  timeline.append(event);
  return { ...measured, ok, ...(errorCode ? { errorCode } : {}), assertionEvent: { runId: event.runId, eventId: event.eventId } };
}

export function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Minimal deterministic scenario executor for one already-selected backend. */
export async function runActionScenario(
  backend: ActionBackend,
  scenario: ActionScenario,
  timeline: Timeline,
  authorization?: TestTargetAuthorization
): Promise<ActionOutcome[]> {
  if (!scenario.scenarioId.trim() || new Set(scenario.steps.map((step) => step.stepId)).size !== scenario.steps.length) {
    throw new Error('Scenario and step identities must be non-empty and unique');
  }
  const outcomes: ActionOutcome[] = [];
  for (const step of scenario.steps) {
    outcomes.push(await executeWithTimeline(backend, { ...step, scenarioId: scenario.scenarioId }, timeline, authorization));
    if (!outcomes[outcomes.length - 1].ok) break;
  }
  return outcomes;
}
