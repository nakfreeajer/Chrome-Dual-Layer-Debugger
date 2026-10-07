import type { ActionOperation, ActionScenario, ActionStep, AssertionPredicate } from './ActionContract.js';
import type { TestingBackendId } from './ActionContract.js';

export interface SmokeTarget {
  pageUrl: string;
  scope: { kind: 'PAGE' } | { kind: 'FRAME'; url: string };
}

export interface SmokeActionStep extends ActionStep {
  kind: 'action';
}

export interface SmokeAssertionStep extends ActionStep {
  kind: 'assert';
  predicate: AssertionPredicate;
  expected?: unknown;
}

export type SmokeStep = SmokeActionStep | SmokeAssertionStep;

export interface SmokeScenario extends ActionScenario {
  schemaVersion: 1;
  target: SmokeTarget;
  steps: readonly SmokeStep[];
}

export interface SmokeScenarioResult {
  scenarioId: string;
  backend: TestingBackendId;
  status: 'PASS' | 'FAIL';
  runId: string;
  stepResults: readonly {
    stepId: string;
    kind: SmokeStep['kind'];
    operation: ActionOperation;
    predicate?: AssertionPredicate;
    ok: boolean;
    errorCode?: string;
    value?: unknown;
    actualType?: string;
    expectedType?: string;
    assertionEvent?: { runId: string; eventId: string };
  }[];
  failedStepId?: string;
}
