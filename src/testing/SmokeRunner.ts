import type { Timeline } from '../trace/Timeline.js';
import { assertWithTimeline, executeWithTimeline, type ActionBackend, type TestTargetAuthorization } from './ActionContract.js';
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
  observer?: SmokeObserverLifecycle;
}

/** Executes a previously validated scenario using only the accepted TEST.1A backend contract. */
export async function runSmokeScenario(options: SmokeRunnerOptions): Promise<SmokeScenarioResult> {
  const { backend, scenario, timeline, authorization, observer } = options;
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
      const result = step.kind === 'assert'
        ? await assertWithTimeline(backend, normalizedStep, step.predicate, step.expected, timeline, authorization)
        : await executeWithTimeline(backend, normalizedStep, timeline, authorization);
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
