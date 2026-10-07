import assert from 'node:assert/strict';
import test from 'node:test';
import { parseExploratoryProfile, exploratoryProfileSha256 } from '../../src/testing/ExploratoryProfileParser.js';

const profileInput = {
  schemaVersion: 1,
  profileId: 'synthetic-profile',
  target: { pageUrl: 'http://127.0.0.1:4558/app', scope: { kind: 'PAGE' } },
  bounds: { maxActions: 4, maxDurationMs: 5000 },
  candidates: [
    { candidateId: 'click-one', operation: 'click', selector: '#synthetic-button' },
    { candidateId: 'fill-one', operation: 'fill', selector: '#synthetic-input', value: 'synthetic' },
    { candidateId: 'press-one', operation: 'press', selector: '#synthetic-input', key: 'Enter' }
  ]
};

test('strict profile parser normalizes a bounded dual-backend mutating candidate set', () => {
  const profile = parseExploratoryProfile(profileInput);
  assert.equal(profile.profileId, 'synthetic-profile');
  assert.equal(profile.candidates.length, 3);
  assert.equal(profile.bounds.maxActions, 4);
  assert.match(exploratoryProfileSha256(profile), /^[a-f0-9]{64}$/);
});

test('profile rejects unknown fields, duplicate IDs, out of range bounds, read-only and unqualified candidates', () => {
  assert.throws(() => parseExploratoryProfile({ ...profileInput, surprise: true }), /unsupported field/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, bounds: { maxActions: 101, maxDurationMs: 5000 } }), /maxActions/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, bounds: { maxActions: 1, maxDurationMs: 60_001 } }), /maxDurationMs/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, bounds: { maxActions: 1, maxDurationMs: 5000, retry: 1 } }), /unsupported field/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [] }), /candidates/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [profileInput.candidates[0], profileInput.candidates[0]] }), /unique/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [{ candidateId: 'read', operation: 'readText', selector: '#x' }] }), /mutating/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [{ candidateId: 'bad', operation: 'doubleClick', selector: '#x' }] }), /mutating/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [{ ...profileInput.candidates[0], arbitraryCode: 'x' }] }), /unsupported field/);
});

test('profile parser accepts PAGE and FRAME targets and rejects invalid URLs, bounds, and candidate fields', () => {
  const frame = parseExploratoryProfile({ ...profileInput, target: { pageUrl: 'http://127.0.0.1:4558/app', scope: { kind: 'FRAME', url: 'http://127.0.0.1:4564/child' } } });
  assert.equal(frame.target.scope.kind, 'FRAME');
  assert.throws(() => parseExploratoryProfile({ ...profileInput, target: { pageUrl: 'javascript:alert(1)', scope: { kind: 'PAGE' } } }), /HTTP/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, target: { pageUrl: 'http://user:pass@127.0.0.1/app', scope: { kind: 'PAGE' } } }), /HTTP/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, bounds: { maxActions: 0, maxDurationMs: 5000 } }), /maxActions/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, bounds: { maxActions: 1, maxDurationMs: 0 } }), /maxDurationMs/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [{ candidateId: '', operation: 'click', selector: '#x' }] }), /candidateId/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [{ candidateId: 'press', operation: 'press', selector: '#x' }] }), /key/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [{ candidateId: 'fill', operation: 'fill', selector: '#x' }] }), /value/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [{ candidateId: 'click', operation: 'click' }] }), /selector/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [{ candidateId: 'click', operation: 'click', selector: '#x', value: 'not-applicable' }] }), /not applicable/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, candidates: [{ candidateId: 'click', operation: 'click', selector: '#x', timeoutMs: 10_001 }] }), /timeout/);
  assert.throws(() => parseExploratoryProfile({ ...profileInput, target: { pageUrl: 'http://127.0.0.1:4558/app', scope: { kind: 'FRAME', url: 'http://127.0.0.1:4558/app' } } }), /distinct exact frame URL/);
});

test('canonical profile identity is independent of input object property ordering', () => {
  const a = parseExploratoryProfile(profileInput);
  const reordered = JSON.parse(JSON.stringify(profileInput)) as Record<string, unknown>;
  const b = parseExploratoryProfile(reordered);
  assert.equal(exploratoryProfileSha256(a), exploratoryProfileSha256(b));
});
