import type { Timeline } from '../trace/Timeline.js';
import { assertWithTimeline, executeWithTimeline, type ActionBackend, type ActionOutcome, type TestTargetAuthorization } from './ActionContract.js';
import { valueType } from './ActionContract.js';
import type { SmokeScenario, SmokeScenarioResult } from './SmokeScenario.js';

export interface SmokeObserverLifecycle {
  start(): Promise<void>;
  stop(): Promise<unknown>;
}

export interface SmokeRunnerOptions {
  backend: ActionBackend;
  scenario: SmokeScenario;
  timeline: Timeline;
  authorization: TestTargetAuthorization;
  assertTargetEnvelope(): Promise<void> | void;
  observer?: SmokeObserverLifecycle;
}

/** Executes a previously validated scenario using only the accepted TEST.1A backend contract. */
export async function runSmokeScenario(options: SmokeRunnerOptions): Promise<SmokeScenarioResult> {
  const { backend, scenario, timeline, authorization, observer, assertTargetEnvelope } = options;
  const source = backend.backend === 'PLAYWRIGHT' ? 'PLAYWRIGHT' : 'GAS';
  const scenarioData = { scenarioId: scenario.scenarioId, backend: backend.backend };
  timeline.append(timeline.create({ source: 'CORE', category: 'ACTION', type: 'SCENARIO_STARTED', data: scenarioData }));
  const stepResults: SmokeScenarioResult['stepResults'][number][] = [];
  let failedStepId: string | undefined;
  let observerError = false;
  try {
    if (observer) await observer.start();
    for (const step of scenario.steps) {
      const normalizedStep = { ...step, scenarioId: scenario.scenarioId };
      let result: ActionOutcome = { stepId: normalizedStep.stepId, operation: normalizedStep.operation, backend: backend.backend,
        ok: false, errorCode: 'TARGET_ENVELOPE_VIOLATION' };
      let envelopePassed = false;
      try { await assertTargetEnvelope(); envelopePassed = true; }
      catch { result = envelopeFailure(normalizedStep, backend, timeline); }
      if (envelopePassed) {
        result = step.kind === 'assert'
          ? await assertWithTimeline(backend, normalizedStep, step.predicate, step.expected, timeline, authorization)
          : await executeWithTimeline(backend, normalizedStep, timeline, authorization);
        try { await assertTargetEnvelope(); }
        catch { result = envelopeFailure(normalizedStep, backend, timeline, result); }
      }
      stepResults.push({
        stepId: step.stepId,
        kind: step.kind,
        operation: step.operation,
        ...(step.kind === 'assert' ? { predicate: step.predicate, actualType: valueType(result.value), ...(step.predicate === 'truthy' || step.predicate === 'falsy' ? {} : { expectedType: valueType(step.expected) }) } : {}),
        ok: result.ok,
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        ...(result.assertionEvent ? { assertionEvent: result.assertionEvent } : {}),
        ...(!step.kind.includes('action') && result.value !== undefined ? { value: result.value } : {})
      });
      if (!result.ok) { failedStepId = step.stepId; break; }
    }
  } catch {
    observerError = true;
    failedStepId = stepResults.at(-1)?.stepId ?? scenario.steps[0]?.stepId;
  } finally {
    if (observer) {
      try { await observer.stop(); } catch { observerError = true; }
    }
  }
  const status = failedStepId === undefined && !observerError && stepResults.length === scenario.steps.length ? 'PASS' : 'FAIL';
  const result: SmokeScenarioResult = {
    scenarioId: scenario.scenarioId,
    backend: backend.backend,
    status,
    runId: timeline.runId,
    stepResults,
    ...(status === 'FAIL' ? { failedStepId: failedStepId ?? 'observer-lifecycle' } : {})
  };
  timeline.append(timeline.create({
    source: 'CORE', category: 'ACTION', type: status === 'PASS' ? 'SCENARIO_PASSED' : 'SCENARIO_FAILED',
    data: { ...scenarioData, status, ...(result.failedStepId ? { failedStepId: result.failedStepId, errorCode: observerError ? 'OBSERVER_LIFECYCLE_FAILED' : 'STEP_FAILED' } : {}) }
  }));
  return result;
}

function envelopeFailure(
  step: SmokeScenario['steps'][number] & { scenarioId: string },
  backend: ActionBackend,
  timeline: Timeline,
  previous?: ActionOutcome
): ActionOutcome {
  const assertion = step.kind === 'assert';
  const event = timeline.create({ source: backend.backend === 'PLAYWRIGHT' ? 'PLAYWRIGHT' : 'GAS',
    category: assertion ? 'ASSERTION' : 'ACTION', type: assertion ? 'ASSERTION_FAILED' : 'ACTION_FAILED',
    data: { scenarioId: step.scenarioId, stepId: step.stepId, operation: step.operation, errorCode: 'TARGET_ENVELOPE_VIOLATION' } });
  timeline.append(event);
  return { ...(previous ?? { stepId: step.stepId, operation: step.operation, backend: backend.backend, ok: false }),
    ok: false, errorCode: 'TARGET_ENVELOPE_VIOLATION', ...(assertion ? { assertionEvent: { runId: event.runId, eventId: event.eventId } } : {}) };
}
