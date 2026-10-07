import type { Timeline } from '../trace/Timeline.js';
import { boundedTimeoutMs, executeWithTimeline, type ActionBackend, type TestTargetAuthorization } from './ActionContract.js';
import { exploratoryProfileSha256 } from './ExploratoryProfileParser.js';
import { EXPLORATORY_GENERATOR_VERSION, generateExploratoryPlan } from './ExploratoryGenerator.js';
import type { ExploratoryProfile, GeneratedExploratoryPlan, ExploratoryResult } from './ExploratoryProfile.js';

export interface ExploratoryRunnerOptions {
  backend: ActionBackend;
  profile: ExploratoryProfile;
  artifact: GeneratedExploratoryPlan;
  timeline: Timeline;
  authorization: TestTargetAuthorization;
  assertTargetEnvelope(): Promise<void> | void;
  now?: () => number;
}

/** Runs a pre-generated, bounded plan and stops at the first failure or containment violation. */
export async function runExploratoryProfile(options: ExploratoryRunnerOptions): Promise<ExploratoryResult> {
  const { backend, profile, artifact, timeline, authorization } = options;
  const now = options.now ?? (() => performance.now());
  const started = now();
  const results: ExploratoryResult['actionResults'][number][] = [];
  let status: ExploratoryResult['status'] = 'PASS';
  let stopReason = 'ALL_ACTIONS_COMPLETED';
  const profileSha256 = exploratoryProfileSha256(profile);
  const safeMeta = { profileId: profile.profileId, profileSha256, generatorVersion: artifact.generatorVersion, seed: artifact.seed, backend: backend.backend };
  timeline.append(timeline.create({ source: 'CORE', category: 'ACTION', type: 'EXPLORATORY_RUN_STARTED', data: safeMeta }));
  try {
    const expectedArtifact = generateExploratoryPlan(profile, artifact.seed);
    if (artifact.generatorVersion !== EXPLORATORY_GENERATOR_VERSION
      || artifact.profileId !== profile.profileId || artifact.profileSha256 !== exploratoryProfileSha256(profile)
      || JSON.stringify(artifact) !== JSON.stringify(expectedArtifact)) throw new Error('REPLAY_PLAN_MISMATCH');
    for (const action of artifact.plan) {
      const remaining = profile.bounds.maxDurationMs - (now() - started);
      if (remaining <= 0) { status = 'BOUND_REACHED'; stopReason = 'DURATION_EXHAUSTED'; break; }
      await options.assertTargetEnvelope();
      const candidate = profile.candidates.find((item) => item.candidateId === action.candidateId);
      if (!candidate || candidate.operation !== action.operation) throw new Error('REPLAY_PLAN_MISMATCH');
      const timeoutMs = boundedTimeoutMs(Math.max(1, Math.min(candidate.timeoutMs ?? 5000, Math.floor(remaining))));
      const step = { ...candidate, stepId: action.stepId, scenarioId: profile.profileId, timeoutMs };
      timeline.append(timeline.create({ source: 'CORE', category: 'ACTION', type: 'EXPLORATORY_ACTION_PLANNED', data: {
        profileId: profile.profileId, profileSha256: safeMeta.profileSha256, generatorVersion: artifact.generatorVersion,
        seed: artifact.seed, candidateId: candidate.candidateId, stepId: action.stepId, operation: action.operation
      } }));
      const outcome = await executeWithTimeline(backend, step, timeline, authorization);
      results.push({ stepId: action.stepId, candidateId: candidate.candidateId, operation: action.operation, ok: outcome.ok, ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}) });
      await options.assertTargetEnvelope();
      if (!outcome.ok) { status = 'FAIL'; stopReason = outcome.errorCode ?? 'ACTION_FAILED'; break; }
      if (now() - started >= profile.bounds.maxDurationMs && results.length < artifact.plan.length) { status = 'BOUND_REACHED'; stopReason = 'DURATION_EXHAUSTED'; break; }
    }
  } catch (error) {
    status = 'FAIL';
    const message = error instanceof Error ? error.message : '';
    stopReason = message === 'TARGET_ENVELOPE_VIOLATION' ? message : message === 'REPLAY_PLAN_MISMATCH' ? message : 'RUNNER_FAILED';
  }
  const result: ExploratoryResult = { profileId: profile.profileId, backend: backend.backend, runId: timeline.runId, profileSha256,
    generatorVersion: artifact.generatorVersion, seed: artifact.seed, status, generatedCount: artifact.plan.length,
    executedCount: results.length, actionResults: results, stopReason };
  timeline.append(timeline.create({ source: 'CORE', category: 'ACTION', type: status === 'PASS' ? 'EXPLORATORY_RUN_COMPLETED' : status === 'BOUND_REACHED' ? 'EXPLORATORY_RUN_BOUND_REACHED' : 'EXPLORATORY_RUN_FAILED',
    data: { profileId: profile.profileId, backend: backend.backend, status, generatedCount: artifact.plan.length, executedCount: results.length, stopReason } }));
  return result;
}
