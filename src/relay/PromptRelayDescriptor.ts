import { TextDecoder } from 'node:util';
import {
  PROMPT_PROJECT,
  PROMPT_REPOSITORY,
  type PromptIdentityInput,
} from './PromptArtifactStore.js';

export const PROMPT_RELAY_DESCRIPTOR_PREFIX = 'CDLD-PROMPT-V1.';

export interface PromptRelayDescriptorV1 {
  schemaVersion: 1;
  project: typeof PROMPT_PROJECT;
  repository: typeof PROMPT_REPOSITORY;
  milestoneId: string;
  promptSha256: string;
  promptByteLength: number;
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const MILESTONE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function validateMilestoneId(milestoneId: string): void {
  if (!MILESTONE_RE.test(milestoneId) || milestoneId.includes('..') || milestoneId.includes(':')) {
    throw new Error('Descriptor milestoneId is invalid');
  }
}

function canonicalObject(input: PromptIdentityInput): PromptRelayDescriptorV1 {
  validateMilestoneId(input.milestoneId);
  if (!SHA256_RE.test(input.promptSha256)) throw new Error('Descriptor promptSha256 is invalid');
  if (!Number.isSafeInteger(input.promptByteLength) || input.promptByteLength <= 0) {
    throw new Error('Descriptor promptByteLength must be a positive safe integer');
  }
  return {
    schemaVersion: 1,
    project: PROMPT_PROJECT,
    repository: PROMPT_REPOSITORY,
    milestoneId: input.milestoneId,
    promptSha256: input.promptSha256,
    promptByteLength: input.promptByteLength,
  };
}

function encodeCanonical(value: PromptRelayDescriptorV1): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** Format canonical descriptor identity metadata; this does not establish Architect authority. */
export function formatPromptRelayDescriptor(input: PromptIdentityInput): string {
  return PROMPT_RELAY_DESCRIPTOR_PREFIX + encodeCanonical(canonicalObject(input));
}

/** Strictly parse a canonical V1 descriptor and return only its identity fields. */
export function parsePromptRelayDescriptor(token: string): PromptRelayDescriptorV1 {
  if (typeof token !== 'string' || !token.startsWith(PROMPT_RELAY_DESCRIPTOR_PREFIX)) {
    throw new Error('Descriptor prefix is invalid');
  }
  const payload = token.slice(PROMPT_RELAY_DESCRIPTOR_PREFIX.length);
  if (!payload || !BASE64URL_RE.test(payload)) throw new Error('Descriptor base64url payload is invalid');

  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, 'base64url');
  } catch {
    throw new Error('Descriptor base64url payload is invalid');
  }
  if (bytes.toString('base64url') !== payload) throw new Error('Descriptor base64url payload is noncanonical');

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Descriptor payload is not valid UTF-8');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Descriptor payload is malformed JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Descriptor payload must be an object');
  }
  const fields = parsed as Record<string, unknown>;
  const expectedKeys = ['schemaVersion', 'project', 'repository', 'milestoneId', 'promptSha256', 'promptByteLength'];
  if (Object.keys(fields).length !== expectedKeys.length || expectedKeys.some((key) => !Object.hasOwn(fields, key))) {
    throw new Error('Descriptor fields are missing or unexpected');
  }
  if (fields.schemaVersion !== 1) throw new Error('Descriptor schemaVersion is unsupported');
  if (fields.project !== PROMPT_PROJECT) throw new Error('Descriptor project is invalid');
  if (fields.repository !== PROMPT_REPOSITORY) throw new Error('Descriptor repository is invalid');
  if (typeof fields.milestoneId !== 'string') throw new Error('Descriptor milestoneId is invalid');
  if (typeof fields.promptSha256 !== 'string') throw new Error('Descriptor promptSha256 is invalid');
  if (typeof fields.promptByteLength !== 'number') throw new Error('Descriptor promptByteLength is invalid');

  const canonical = canonicalObject({
    milestoneId: fields.milestoneId,
    promptSha256: fields.promptSha256,
    promptByteLength: fields.promptByteLength,
  });
  if (JSON.stringify(canonical) !== text || encodeCanonical(canonical) !== payload) {
    throw new Error('Descriptor payload is not canonical');
  }
  return canonical;
}

export function promptRelayIdentity(descriptor: PromptRelayDescriptorV1): PromptIdentityInput {
  return {
    milestoneId: descriptor.milestoneId,
    promptSha256: descriptor.promptSha256,
    promptByteLength: descriptor.promptByteLength,
  };
}
