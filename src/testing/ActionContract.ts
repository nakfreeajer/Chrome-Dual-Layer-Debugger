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
  errorCode?: 'AUTHORIZATION_REQUIRED' | 'TARGET_MISMATCH' | 'UNSUPPORTED' | 'ACTION_FAILED' | 'TIMEOUT';
}

export interface ActionBackend {
  readonly backend: TestingBackendId;
  readonly targetId: string;
  execute(step: ActionStep, authorization?: TestTargetAuthorization): Promise<ActionOutcome>;
  assert(step: ActionStep, predicate: 'truthy' | 'equals', expected?: unknown, authorization?: TestTargetAuthorization): Promise<ActionOutcome>;
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
  predicate: 'truthy' | 'equals',
  expected: unknown,
  timeline: Timeline,
  authorization?: TestTargetAuthorization
): Promise<ActionOutcome> {
  const measured = await backend.execute(step, authorization);
  const outcome = { ...measured, ok: measured.ok && (predicate === 'truthy' ? Boolean(measured.value) : isDeepStrictEqual(measured.value, expected)) };
  timeline.append(timeline.create({ source: backend.backend === 'PLAYWRIGHT' ? 'PLAYWRIGHT' : 'GAS', category: 'ASSERTION', type: outcome.ok ? 'ASSERTION_PASSED' : 'ASSERTION_FAILED', data: { stepId: step.stepId, operation: step.operation } }));
  return outcome;
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
