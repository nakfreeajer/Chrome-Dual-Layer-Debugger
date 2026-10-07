import { createHash } from 'node:crypto';
import { isMutatingOperation, type ActionOperation } from './ActionContract.js';
import { parseSmokeScenario } from './SmokeScenarioParser.js';
import type { ExploratoryCandidate, ExploratoryProfile } from './ExploratoryProfile.js';

const rootFields = new Set(['schemaVersion', 'profileId', 'target', 'bounds', 'candidates']);
const boundsFields = new Set(['maxActions', 'maxDurationMs']);
const candidateFields = new Set(['candidateId', 'operation', 'selector', 'value', 'key', 'deltaX', 'deltaY', 'timeoutMs']);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function obj(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, fields: Set<string>, label: string): void {
  for (const key of Object.keys(value)) if (!fields.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
}

function integer(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return value as number;
}

export function parseExploratoryProfile(input: unknown): ExploratoryProfile {
  const root = obj(input, 'profile');
  exact(root, rootFields, 'profile');
  if (root.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (typeof root.profileId !== 'string' || !idPattern.test(root.profileId)) throw new Error('profileId is invalid');
  const bounds = obj(root.bounds, 'bounds');
  exact(bounds, boundsFields, 'bounds');
  const maxActions = integer(bounds.maxActions, 1, 100, 'bounds.maxActions');
  const maxDurationMs = integer(bounds.maxDurationMs, 1, 60_000, 'bounds.maxDurationMs');
  if (!Array.isArray(root.candidates) || root.candidates.length < 1 || root.candidates.length > 100) throw new Error('candidates must contain between 1 and 100 entries');
  const candidates = root.candidates.map((raw, index): ExploratoryCandidate => {
    const candidate = obj(raw, `candidates[${index}]`);
    exact(candidate, candidateFields, `candidates[${index}]`);
    if (typeof candidate.candidateId !== 'string' || !idPattern.test(candidate.candidateId)) throw new Error(`candidates[${index}].candidateId is invalid`);
    if (typeof candidate.operation !== 'string' || !isMutatingOperation(candidate.operation as ActionOperation)) throw new Error(`candidates[${index}].operation must be a mutating ActionOperation`);
    if (candidate.timeoutMs !== undefined) integer(candidate.timeoutMs, 1, 10_000, `candidates[${index}].timeoutMs`);
    const { candidateId, ...actionFields } = candidate;
    const checked = parseSmokeScenario({
      schemaVersion: 1,
      scenarioId: root.profileId,
      target: root.target,
      steps: [{ stepId: candidateId, kind: 'action', ...actionFields }]
    });
    const { kind: _kind, stepId, ...normalized } = checked.steps[0];
    void _kind;
    void stepId;
    return { candidateId, ...normalized } as ExploratoryCandidate;
  });
  const ids = candidates.map((candidate) => candidate.candidateId);
  if (new Set(ids).size !== ids.length) throw new Error('candidateId values must be unique');
  const { candidateId: _firstId, ...firstCandidate } = candidates[0];
  const checkedTarget = parseSmokeScenario({ schemaVersion: 1, scenarioId: root.profileId, target: root.target,
    steps: [{ stepId: 'candidate-check', kind: 'action', ...firstCandidate }] }).target;
  void _firstId;
  return { schemaVersion: 1, profileId: root.profileId, target: checkedTarget, bounds: { maxActions, maxDurationMs }, candidates };
}

/** Hashes the canonical normalized profile representation, not its source formatting. */
export function exploratoryProfileSha256(profile: ExploratoryProfile): string {
  return createHash('sha256').update(JSON.stringify(profile), 'utf8').digest('hex');
}
