import type { ActionOperation, ActionScenario, ActionStep } from './ActionContract.js';
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
  predicate: 'truthy' | 'equals';
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
    ok: boolean;
    errorCode?: string;
    value?: unknown;
  }[];
  failedStepId?: string;
}
