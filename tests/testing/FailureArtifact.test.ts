import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Timeline } from '../../src/trace/Timeline.js';
import { buildFailureArtifact, summarizeFailureValue, writeFailureArtifact } from '../../src/testing/FailureArtifact.js';
import { evaluateAssertionPredicate } from '../../src/testing/ActionContract.js';

test('shared assertion evaluator implements the six exact predicates without coercion', () => {
  assert.equal(evaluateAssertionPredicate('x', 'truthy'), true);
  assert.equal(evaluateAssertionPredicate('', 'falsy'), true);
  assert.equal(evaluateAssertionPredicate({ a: [1] }, 'equals', { a: [1] }), true);
  assert.equal(evaluateAssertionPredicate({ a: 1 }, 'notEquals', { a: 2 }), true);
  assert.equal(evaluateAssertionPredicate('alpha', 'contains', 'ph'), true);
  assert.equal(evaluateAssertionPredicate('alpha', 'notContains', 'z'), true);
  assert.equal(evaluateAssertionPredicate(12, 'equals', '12'), false);
  assert.equal(evaluateAssertionPredicate(12, 'contains', '2'), false);
  assert.equal(evaluateAssertionPredicate('alpha', 'contains', 'x'.repeat(4097)), false);
});

test('default value summaries are deterministic, recursively sorted, and value-free', () => {
  const a = summarizeFailureValue({ z: 1, nested: { b: true, a: 'x' } });
  const b = summarizeFailureValue({ nested: { a: 'x', b: true }, z: 1 });
  assert.deepEqual(a, b);
  assert.match(a.sha256!, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(a).includes('nested'), false);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.equal(summarizeFailureValue(cyclic).unsupported, true);
});

test('artifact validates exact same-run Timeline references and defaults to privacy-reduced evidence', () => {
  const timeline = new Timeline({ runId: 'failure-run' });
  const event = timeline.create({ source: 'PLAYWRIGHT', category: 'ASSERTION', type: 'ASSERTION_FAILED', data: { stepId: 's1' } });
  timeline.append(event);
  const artifact = buildFailureArtifact({ timeline, backend: 'PLAYWRIGHT', runnerKind: 'SMOKE', scenarioId: 'safe', stepId: 's1',
    operation: 'readText', predicate: 'equals', errorCode: 'ASSERTION_FAILED', target: { scopeKind: 'PAGE', targetId: 'PAGE-1', pageUrl: 'http://127.0.0.1/private/path?secret=1' },
    refs: [{ runId: event.runId, eventId: event.eventId }], actual: 'PRIVATE_ACTUAL', expected: 'PRIVATE_EXPECTED', selector: '#private', diagnostics: { status: 'ERROR' } });
  const json = JSON.stringify(artifact);
  for (const secret of ['PRIVATE_ACTUAL', 'PRIVATE_EXPECTED', '#private', 'approvalReference', 'secret=1']) assert.equal(json.includes(secret), false);
  assert.equal((artifact.timelineRefs as unknown[]).length, 1);
  assert.equal(artifact.correlationRelationship, 'UNKNOWN');
  assert.equal((artifact.values as Record<string, unknown>).actual !== undefined, true);
  assert.throws(() => buildFailureArtifact({ timeline, backend: 'PLAYWRIGHT', runnerKind: 'SMOKE', target: { scopeKind: 'PAGE', targetId: 'PAGE-1', pageUrl: 'http://localhost' }, refs: [{ runId: 'foreign', eventId: event.eventId }] }), /foreign runId/);
  assert.throws(() => buildFailureArtifact({ timeline, backend: 'PLAYWRIGHT', runnerKind: 'SMOKE', target: { scopeKind: 'PAGE', targetId: 'PAGE-1', pageUrl: 'http://localhost' }, refs: [{ runId: event.runId, eventId: 'missing' }] }), /does not exist/);
});

test('synthetic raw detail is opt-in and correlation requires an explicit linked proof event', () => {
  const timeline = new Timeline({ runId: 'proof-run' });
  const proof = timeline.create({ source: 'TRACE', category: 'CORRELATION', type: 'CORRELATION_PROVEN', correlationId: 'opaque-token', data: {} });
  timeline.append(proof);
  const failure = timeline.create({ source: 'PLAYWRIGHT', category: 'ASSERTION', type: 'ASSERTION_FAILED', parentEventId: proof.eventId, data: {} });
  timeline.append(failure);
  const artifact = buildFailureArtifact({ timeline, backend: 'PLAYWRIGHT', runnerKind: 'SMOKE', target: { scopeKind: 'PAGE', targetId: 'PAGE-1', pageUrl: 'http://localhost' },
    refs: [{ runId: timeline.runId, eventId: failure.eventId }], selector: '#synthetic', actual: 'fixture', syntheticDetails: true });
  assert.equal(artifact.selector, '#synthetic');
  assert.equal(artifact.actualRaw, 'fixture');
  assert.equal(artifact.correlationRelationship, 'PROVEN_BY_EXISTING_EVIDENCE');
  const unlinked = buildFailureArtifact({ timeline, backend: 'PLAYWRIGHT', runnerKind: 'SMOKE', target: { scopeKind: 'PAGE', targetId: 'PAGE-1', pageUrl: 'http://localhost' }, refs: [] });
  assert.equal(unlinked.correlationRelationship, 'UNKNOWN');
});

test('unlinked same-run correlation context is not promoted to proof', () => {
  const timeline = new Timeline({ runId: 'context-only' });
  const proof = timeline.create({ source: 'TRACE', category: 'CORRELATION', type: 'CORRELATION_PROVEN', correlationId: 'token-context', data: {} });
  timeline.append(proof);
  const failure = timeline.create({ source: 'PLAYWRIGHT', category: 'ASSERTION', type: 'ASSERTION_FAILED', data: { stepId: 's' } }); timeline.append(failure);
  const artifact = buildFailureArtifact({ timeline, backend: 'PLAYWRIGHT', runnerKind: 'SMOKE', target: { scopeKind: 'PAGE', targetId: 'PAGE', pageUrl: 'http://localhost' }, refs: [{ runId: timeline.runId, eventId: failure.eventId }] });
  assert.equal(artifact.correlationRelationship, 'RUN_CONTEXT_ONLY');
});

test('failure artifact persists under isolated artifacts root and refuses overwrite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cdld-failure-artifact-'));
  const original = process.cwd();
  try {
    process.chdir(root);
    const timeline = new Timeline({ runId: 'persist-run' });
    const artifact = buildFailureArtifact({ timeline, backend: 'PLAYWRIGHT', runnerKind: 'SMOKE', target: { scopeKind: 'PAGE', targetId: 'PAGE', pageUrl: 'http://localhost' }, refs: [] });
    await writeFailureArtifact('.agent-work/artifacts/failure.json', artifact);
    assert.deepEqual(JSON.parse(await readFile('.agent-work/artifacts/failure.json', 'utf8')), artifact);
    await assert.rejects(writeFailureArtifact('.agent-work/artifacts/failure.json', artifact));
    await assert.rejects(writeFailureArtifact('.agent-work/artifacts/../../escape.json', artifact), /inside/);
  } finally { process.chdir(original); await rm(root, { recursive: true, force: true }); }
});

test('oversized optional diagnostics are dropped while a bounded valid core remains', () => {
  const timeline = new Timeline({ runId: 'size-run' });
  const event = timeline.create({ source: 'PLAYWRIGHT', category: 'ASSERTION', type: 'ASSERTION_FAILED', data: {} }); timeline.append(event);
  const artifact = buildFailureArtifact({ timeline, backend: 'PLAYWRIGHT', runnerKind: 'SMOKE', target: { scopeKind: 'PAGE', targetId: 'PAGE-1', pageUrl: 'http://localhost' },
    refs: [{ runId: timeline.runId, eventId: event.eventId }], diagnostics: { dom: { status: 'CAPTURED', huge: 'x'.repeat(270_000) }, runtime: { status: 'CAPTURED' }, screenshot: { status: 'NOT_REQUESTED' } }, syntheticDetails: true, selector: '#safe' });
  assert.equal(Buffer.byteLength(JSON.stringify(artifact), 'utf8') < 256 * 1024, true);
  assert.equal((artifact.truncation as string[]).includes('OPTIONAL_DETAILS_DROPPED_SIZE_LIMIT'), true);
  assert.deepEqual(artifact.diagnostics, { dom: { status: 'CAPTURED' }, runtime: { status: 'CAPTURED' }, screenshot: { status: 'NOT_REQUESTED' } });
});
