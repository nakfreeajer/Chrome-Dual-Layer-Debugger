import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPromptRelayDescriptor,
  parsePromptRelayDescriptor,
  PROMPT_RELAY_DESCRIPTOR_PREFIX,
} from '../../src/relay/PromptRelayDescriptor.js';

const IDENTITY = {
  milestoneId: 'V1-SYNTHETIC',
  promptSha256: 'a'.repeat(64),
  promptByteLength: 17,
};

const CANONICAL_JSON = '{"schemaVersion":1,"project":"Chrome-Dual-Layer-Debugger","repository":"nakfreeajer/Chrome-Dual-Layer-Debugger","milestoneId":"V1-SYNTHETIC","promptSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","promptByteLength":17}';
const PAYLOAD_BASE64URL = 'eyJzY2hlbWFWZXJzaW9uIjoxLCJwcm9qZWN0IjoiQ2hyb21lLUR1YWwtTGF5ZXItRGVidWdnZXIiLCJyZXBvc2l0b3J5IjoibmFrZnJlZWFqZXIvQ2hyb21lLUR1YWwtTGF5ZXItRGVidWdnZXIiLCJtaWxlc3RvbmVJZCI6IlYxLVNZTlRIRVRJQyIsInByb21wdFNoYTI1NiI6ImFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWEiLCJwcm9tcHRCeXRlTGVuZ3RoIjoxN30';
const VECTOR = `${PROMPT_RELAY_DESCRIPTOR_PREFIX}${PAYLOAD_BASE64URL}`;

function tokenFor(value: unknown): string {
  return PROMPT_RELAY_DESCRIPTOR_PREFIX + Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function canonicalFields(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    project: 'Chrome-Dual-Layer-Debugger',
    repository: 'nakfreeajer/Chrome-Dual-Layer-Debugger',
    milestoneId: IDENTITY.milestoneId,
    promptSha256: IDENTITY.promptSha256,
    promptByteLength: IDENTITY.promptByteLength,
  };
}

test('conformance vector has exact canonical JSON, UTF-8 length, payload and descriptor', () => {
  assert.equal(CANONICAL_JSON, JSON.stringify(canonicalFields()));
  assert.equal(Buffer.byteLength(CANONICAL_JSON, 'utf8'), 245);
  assert.equal(formatPromptRelayDescriptor(IDENTITY), VECTOR);
  assert.equal(parsePromptRelayDescriptor(VECTOR).milestoneId, IDENTITY.milestoneId);
});

test('canonical descriptor round-trips exactly and contains identity metadata only', () => {
  const token = formatPromptRelayDescriptor(IDENTITY);
  assert.equal(parsePromptRelayDescriptor(token).promptSha256, IDENTITY.promptSha256);
  assert.equal(formatPromptRelayDescriptor(parsePromptRelayDescriptor(token)), token);
  const payload = JSON.parse(Buffer.from(token.slice(PROMPT_RELAY_DESCRIPTOR_PREFIX.length), 'base64url').toString('utf8')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(payload), ['schemaVersion', 'project', 'repository', 'milestoneId', 'promptSha256', 'promptByteLength']);
  assert.equal(Object.hasOwn(payload, 'path'), false);
  assert.equal(Object.hasOwn(payload, 'approvalReference'), false);
  assert.equal(Object.hasOwn(payload, 'runId'), false);
  assert.equal(Object.hasOwn(payload, 'transactionId'), false);
  assert.doesNotMatch(token, /[ =;|&<>]/);
});

test('rejects wrong descriptor prefix', () => {
  assert.throws(() => parsePromptRelayDescriptor(`OTHER.${PAYLOAD_BASE64URL}`), /prefix/);
});

test('rejects malformed base64url characters and padding', () => {
  assert.throws(() => parsePromptRelayDescriptor(`${PROMPT_RELAY_DESCRIPTOR_PREFIX}%%%`), /base64url/);
  assert.throws(() => parsePromptRelayDescriptor(`${VECTOR}=`), /base64url/);
});

test('rejects noncanonical base64url leftover bits', () => {
  const payload = VECTOR.slice(PROMPT_RELAY_DESCRIPTOR_PREFIX.length);
  const last = payload.at(-1)!;
  const replacement = last === 'A' ? 'B' : 'A';
  assert.throws(() => parsePromptRelayDescriptor(`${PROMPT_RELAY_DESCRIPTOR_PREFIX}${payload.slice(0, -1)}${replacement}`), /canonical|JSON|schema|field/i);
});

test('rejects malformed UTF-8 before JSON parsing', () => {
  const bad = Buffer.from([0xff, 0xfe]).toString('base64url');
  assert.throws(() => parsePromptRelayDescriptor(`${PROMPT_RELAY_DESCRIPTOR_PREFIX}${bad}`), /UTF-8/);
});

test('rejects malformed JSON', () => {
  const bad = Buffer.from('{').toString('base64url');
  assert.throws(() => parsePromptRelayDescriptor(`${PROMPT_RELAY_DESCRIPTOR_PREFIX}${bad}`), /JSON/);
});

test('rejects array payloads', () => {
  assert.throws(() => parsePromptRelayDescriptor(tokenFor([])), /object/);
});

test('rejects extra fields', () => {
  assert.throws(() => parsePromptRelayDescriptor(tokenFor({ ...canonicalFields(), localPath: 'C:/private' })), /fields/);
});

test('rejects missing fields', () => {
  const { repository: _repository, ...missing } = canonicalFields();
  assert.throws(() => parsePromptRelayDescriptor(tokenFor(missing)), /fields/);
});

test('rejects unsupported schema version', () => {
  assert.throws(() => parsePromptRelayDescriptor(tokenFor({ ...canonicalFields(), schemaVersion: 2 })), /schemaVersion/);
});

test('rejects wrong canonical project', () => {
  assert.throws(() => parsePromptRelayDescriptor(tokenFor({ ...canonicalFields(), project: 'Other' })), /project/);
});

test('rejects wrong repository', () => {
  assert.throws(() => parsePromptRelayDescriptor(tokenFor({ ...canonicalFields(), repository: 'other/repo' })), /repository/);
});

test('rejects invalid milestone IDs', () => {
  for (const milestoneId of ['', '../escape', 'a/b', 'a\\b', 'C:drive', '..', 'x'.repeat(129)]) {
    assert.throws(() => parsePromptRelayDescriptor(tokenFor({ ...canonicalFields(), milestoneId })));
  }
});

test('rejects malformed and uppercase SHA-256', () => {
  assert.throws(() => parsePromptRelayDescriptor(tokenFor({ ...canonicalFields(), promptSha256: 'abc' })), /promptSha256/);
  assert.throws(() => parsePromptRelayDescriptor(tokenFor({ ...canonicalFields(), promptSha256: 'A'.repeat(64) })), /promptSha256/);
});

test('rejects invalid, negative, unsafe and zero byte lengths', () => {
  for (const promptByteLength of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, '17', null]) {
    assert.throws(() => parsePromptRelayDescriptor(tokenFor({ ...canonicalFields(), promptByteLength })));
  }
});

test('rejects noncanonical JSON whitespace and field order', () => {
  const spaced = Buffer.from(JSON.stringify(canonicalFields(), null, 2), 'utf8').toString('base64url');
  const reorderedFields = {
    project: 'Chrome-Dual-Layer-Debugger', schemaVersion: 1,
    repository: 'nakfreeajer/Chrome-Dual-Layer-Debugger', milestoneId: IDENTITY.milestoneId,
    promptSha256: IDENTITY.promptSha256, promptByteLength: IDENTITY.promptByteLength,
  };
  const reordered = Buffer.from(JSON.stringify(reorderedFields), 'utf8').toString('base64url');
  assert.throws(() => parsePromptRelayDescriptor(`${PROMPT_RELAY_DESCRIPTOR_PREFIX}${spaced}`), /canonical/);
  assert.throws(() => parsePromptRelayDescriptor(`${PROMPT_RELAY_DESCRIPTOR_PREFIX}${reordered}`), /canonical/);
});
