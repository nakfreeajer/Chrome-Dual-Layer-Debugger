import type { ActionOperation } from './ActionContract.js';
import type { SmokeTarget } from './SmokeScenario.js';

export interface ExploratoryCandidate {
  candidateId: string;
  operation: ActionOperation;
  selector: string;
  value?: string;
  key?: string;
  deltaX?: number;
  deltaY?: number;
  timeoutMs?: number;
}

export interface ExploratoryProfile {
  schemaVersion: 1;
  profileId: string;
  target: SmokeTarget;
  candidates: readonly ExploratoryCandidate[];
  bounds: { maxActions: number; maxDurationMs: number };
}

export interface GeneratedExploratoryAction extends ExploratoryCandidate {
  stepId: string;
  scenarioId: string;
}

export interface GeneratedExploratoryPlan {
  generatorVersion: string;
  profileId: string;
  profileSha256: string;
  seed: number;
  plan: readonly GeneratedExploratoryAction[];
}

export interface ExploratoryReplayArtifact extends GeneratedExploratoryPlan {
  kind: 'CDLD_TEST1C_REPLAY';
  schemaVersion: 1;
  backend: 'PLAYWRIGHT' | 'GAS_OOPIF';
  terminalStatus: 'PASS' | 'BOUND_REACHED' | 'FAIL';
  stopReason: string;
  generatedCount: number;
  executedCount: number;
}

export interface ExploratoryActionResult {
  stepId: string;
  candidateId: string;
  operation: ActionOperation;
  ok: boolean;
  errorCode?: string;
}

export interface ExploratoryResult {
  profileId: string;
  backend: 'PLAYWRIGHT' | 'GAS_OOPIF';
  runId: string;
  profileSha256: string;
  generatorVersion: string;
  seed: number;
  status: 'PASS' | 'BOUND_REACHED' | 'FAIL';
  generatedCount: number;
  executedCount: number;
  actionResults: readonly ExploratoryActionResult[];
  stopReason: string;
}
