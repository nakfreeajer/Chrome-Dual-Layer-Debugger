import { createHash } from 'node:crypto';
import type { ExploratoryProfile, GeneratedExploratoryPlan, GeneratedExploratoryAction } from './ExploratoryProfile.js';
import { exploratoryProfileSha256 } from './ExploratoryProfileParser.js';

export const EXPLORATORY_GENERATOR_VERSION = 'TEST1C_GEN_V1';

function nextRandom(state: { value: number }): number {
  state.value = (state.value + 0x6D2B79F5) >>> 0;
  let value = state.value;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
}

export function validateExploratorySeed(seed: unknown): number {
  if (!Number.isSafeInteger(seed) || (seed as number) < 0 || (seed as number) > 0xFFFF_FFFF) throw new Error('seed must be an unsigned 32-bit integer');
  return seed as number;
}

export function generateExploratoryPlan(profile: ExploratoryProfile, seedValue: number): GeneratedExploratoryPlan {
  const seed = validateExploratorySeed(seedValue);
  const randomState = { value: seed };
  const plan: GeneratedExploratoryAction[] = [];
  for (let index = 0; index < profile.bounds.maxActions; index += 1) {
    const candidate = profile.candidates[Math.floor(nextRandom(randomState) * profile.candidates.length)];
    plan.push({ ...candidate, stepId: `MONKEY-${String(index + 1).padStart(6, '0')}`, scenarioId: profile.profileId });
  }
  return { generatorVersion: EXPLORATORY_GENERATOR_VERSION, profileId: profile.profileId,
    profileSha256: exploratoryProfileSha256(profile), seed, plan };
}

export function exploratoryPlanSha256(artifact: GeneratedExploratoryPlan): string {
  return createHash('sha256').update(JSON.stringify(artifact), 'utf8').digest('hex');
}
