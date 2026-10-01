import assert from 'node:assert/strict';
import test from 'node:test';
import { Timeline } from '../../src/trace/Timeline.js';
import {
  emitV1CorrelationEvents,
  V1CorrelationRecognizer,
  type V1CompletionMarkerEvidence,
  type V1RequestEvidence,
  type V1ResponseEvidence
} from '../../src/correlation/V1CorrelationRecognizer.js';

const RUN = 'RUN-CORRELATION-1';
const TOKEN_A = 'V01H-11111111-1111-4111-8111-111111111111';
const TOKEN_B = 'V01H-22222222-2222-4222-8222-222222222222';
const EXEC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXEC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type Order = 'request' | 'response' | 'finished' | 'marker';

function request(requestId = 'cdp-1', token = TOKEN_A, version: unknown = 1): V1RequestEvidence {
  return { runId: RUN, requestId, contractVersion: version, correlationTokens: [token] };
}

function response(requestId = 'cdp-1', token = TOKEN_A, executionId?: string): V1ResponseEvidence {
  return { runId: RUN, requestId, correlationTokens: [token], ...(executionId ? { serverExecutionIds: [executionId] } : {}) };
}

function marker(token = TOKEN_A, options: Partial<V1CompletionMarkerEvidence> = {}): V1CompletionMarkerEvidence {
  return { runId: RUN, markerName: 'CDLD_CORRELATION_V1', contractVersion: 1, correlationToken: token, serverExecutionId: EXEC_A, outcome: 'success', ...options };
}

function add(recognizer: V1CorrelationRecognizer, kind: Order, requestId = 'cdp-1', token = TOKEN_A): void {
  if (kind === 'request') recognizer.observeRequest(request(requestId, token));
  else if (kind === 'response') recognizer.observeResponse(response(requestId, token));
  else if (kind === 'finished') recognizer.observeTransportFinished(RUN, requestId);
  else recognizer.observeCompletionMarker(marker(token));
}

function valid(recognizer: V1CorrelationRecognizer, requestId = 'cdp-1', token = TOKEN_A, outcome: 'success' | 'failure' = 'success', executionId = EXEC_A): void {
  recognizer.observeRequest(request(requestId, token));
  recognizer.observeResponse(response(requestId, token, executionId));
  recognizer.observeTransportFinished(RUN, requestId);
  recognizer.observeCompletionMarker(marker(token, { serverExecutionId: executionId, outcome }));
}

function reasons(recognizer: V1CorrelationRecognizer): string[] {
  return recognizer.finalize().uncorrelated.map((candidate) => candidate.reason);
}

test('proves success only after request, response, transport completion, and V1 callback marker agree', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  valid(recognizer);
  const result = recognizer.finalize();
  assert.deepEqual(result.proven, [{ requestId: 'cdp-1', correlationId: TOKEN_A, serverExecutionId: EXEC_A, outcome: 'success', contractVersion: 1 }]);
  assert.deepEqual(result.uncorrelated, []);
});

test('proves explicit application failure without constructing native ScriptError semantics', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  valid(recognizer, 'cdp-failure', TOKEN_A, 'failure');
  assert.equal(recognizer.finalize().proven[0].outcome, 'failure');
});

test('accepts all permutations of evidence arrival order without changing the proof', () => {
  const orders: Order[][] = [
    ['request', 'response', 'finished', 'marker'],
    ['marker', 'finished', 'response', 'request'],
    ['response', 'request', 'marker', 'finished'],
    ['finished', 'marker', 'request', 'response']
  ];
  for (const order of orders) {
    const recognizer = new V1CorrelationRecognizer(RUN);
    for (const evidence of order) add(recognizer, evidence);
    assert.equal(recognizer.finalize().proven[0].correlationId, TOKEN_A);
  }
});

test('keeps concurrent different-function and same-function requests distinct independent of arrival order', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  valid(recognizer, 'different-slow', TOKEN_A, 'success', EXEC_A);
  valid(recognizer, 'different-fast', TOKEN_B, 'success', EXEC_B);
  valid(recognizer, 'same-slow', 'V01H-33333333-3333-4333-8333-333333333333', 'success', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  valid(recognizer, 'same-fast', 'V01H-44444444-4444-4444-8444-444444444444', 'success', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  const result = recognizer.finalize();
  assert.equal(result.proven.length, 4);
  assert.equal(new Set(result.proven.map((item) => item.correlationId)).size, 4);
  assert.equal(new Set(result.proven.map((item) => item.requestId)).size, 4);
});

test('ordinary native traffic without version or token remains uncorrelated and emits no trace noise', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest({ runId: RUN, requestId: 'native-1', correlationTokens: [] });
  recognizer.observeResponse({ runId: RUN, requestId: 'native-1', correlationTokens: [] });
  recognizer.observeTransportFinished(RUN, 'native-1');
  const result = recognizer.finalize();
  assert.deepEqual(result.proven, []);
  assert.deepEqual(result.uncorrelated, []);
});

test('a V1-looking token without request version is never sufficient', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest({ runId: RUN, requestId: 'no-version', correlationTokens: [TOKEN_A] });
  assert.ok(reasons(recognizer).includes('MISSING_REQUEST_VERSION'));
});

test('a token prefix never substitutes for request contractVersion', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest({ runId: RUN, requestId: 'prefix-only', correlationTokens: [TOKEN_A] });
  const result = recognizer.finalize();
  assert.equal(result.proven.length, 0);
  assert.equal(result.uncorrelated[0].reason, 'MISSING_REQUEST_VERSION');
});

test('rejects unknown request contract versions', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request('unknown-version', TOKEN_A, 2));
  assert.ok(reasons(recognizer).includes('UNKNOWN_REQUEST_VERSION'));
});

test('rejects unknown completion-marker versions', () => {
  const second = new V1CorrelationRecognizer(RUN);
  second.observeRequest(request());
  second.observeResponse(response('cdp-1', TOKEN_A, EXEC_A));
  second.observeTransportFinished(RUN, 'cdp-1');
  second.observeCompletionMarker(marker(TOKEN_A, { contractVersion: 7 }));
  assert.ok(reasons(second).includes('UNKNOWN_MARKER_VERSION'));
});

test('rejects disagreement between request and completion-marker versions', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request('version-conflict', TOKEN_A, 1));
  recognizer.observeResponse(response('version-conflict', TOKEN_A, EXEC_A));
  recognizer.observeTransportFinished(RUN, 'version-conflict');
  recognizer.observeCompletionMarker(marker(TOKEN_A, { contractVersion: 2 }));
  assert.ok(reasons(recognizer).includes('UNKNOWN_MARKER_VERSION'));
});

test('rejects missing and malformed request tokens and multiple request candidates', () => {
  const missing = new V1CorrelationRecognizer(RUN);
  missing.observeRequest({ runId: RUN, requestId: 'missing-token', contractVersion: 1, correlationTokens: [] });
  assert.ok(reasons(missing).includes('MISSING_REQUEST_TOKEN'));
  const malformed = new V1CorrelationRecognizer(RUN);
  malformed.observeRequest(request('malformed', 'not-a-token'));
  assert.ok(reasons(malformed).includes('MALFORMED_REQUEST_TOKEN'));
  const multiple = new V1CorrelationRecognizer(RUN);
  multiple.observeRequest({ runId: RUN, requestId: 'multiple', contractVersion: 1, correlationTokens: [TOKEN_A, TOKEN_B] });
  assert.ok(reasons(multiple).includes('MULTIPLE_REQUEST_TOKENS'));
});

test('rejects request identity duplicated under one CDP requestId', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request());
  recognizer.observeRequest(request());
  assert.ok(reasons(recognizer).includes('DUPLICATE_REQUEST_EVIDENCE'));
});

test('rejects the same token claimed by different CDP requestIds', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  valid(recognizer, 'claim-a', TOKEN_A);
  valid(recognizer, 'claim-b', TOKEN_A);
  const result = recognizer.finalize();
  assert.deepEqual(result.proven, []);
  assert.equal(result.uncorrelated.filter((candidate) => candidate.reason === 'DUPLICATE_TOKEN_CLAIM').length, 2);
});

test('rejects response requestId mismatch rather than joining by token', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request('request-a'));
  recognizer.observeResponse(response('request-b', TOKEN_A, EXEC_A));
  recognizer.observeTransportFinished(RUN, 'request-a');
  recognizer.observeCompletionMarker(marker());
  assert.ok(reasons(recognizer).includes('RESPONSE_REQUEST_ID_MISMATCH'));
});

test('rejects missing, multiple, malformed, and mismatched response tokens', () => {
  const cases: Array<[V1ResponseEvidence, string]> = [
    [{ runId: RUN, requestId: 'cdp-1', correlationTokens: [] }, 'MISSING_RESPONSE_TOKEN'],
    [{ ...response(), correlationTokens: [TOKEN_A, TOKEN_B] }, 'MULTIPLE_RESPONSE_TOKENS'],
    [response('cdp-1', 'bad'), 'MALFORMED_RESPONSE_TOKEN'],
    [response('cdp-1', TOKEN_B), 'RESPONSE_TOKEN_MISMATCH']
  ];
  for (const [evidence, expected] of cases) {
    const recognizer = new V1CorrelationRecognizer(RUN);
    recognizer.observeRequest(request());
    recognizer.observeResponse(evidence);
    recognizer.observeTransportFinished(RUN, 'cdp-1');
    recognizer.observeCompletionMarker(marker());
    assert.ok(reasons(recognizer).includes(expected), expected);
  }
});

test('rejects duplicate response evidence even when the duplicates agree', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request());
  recognizer.observeResponse(response());
  recognizer.observeResponse(response());
  recognizer.observeTransportFinished(RUN, 'cdp-1');
  recognizer.observeCompletionMarker(marker());
  assert.ok(reasons(recognizer).includes('DUPLICATE_RESPONSE_EVIDENCE'));
});

test('rejects duplicate completion markers even when identical', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request());
  recognizer.observeResponse(response('cdp-1', TOKEN_A, EXEC_A));
  recognizer.observeTransportFinished(RUN, 'cdp-1');
  recognizer.observeCompletionMarker(marker());
  recognizer.observeCompletionMarker(marker());
  assert.ok(reasons(recognizer).includes('DUPLICATE_COMPLETION_MARKER'));
});

test('rejects missing or invalid marker identity, version, outcome, and server execution ID', () => {
  const cases: Array<[Partial<V1CompletionMarkerEvidence>, string]> = [
    [{ markerName: 'OTHER' }, 'INVALID_COMPLETION_MARKER_NAME'],
    [{ contractVersion: undefined }, 'MISSING_MARKER_VERSION'],
    [{ serverExecutionId: 'bad-id' }, 'MALFORMED_MARKER_SERVER_EXECUTION_ID'],
    [{ serverExecutionId: undefined }, 'MALFORMED_MARKER_SERVER_EXECUTION_ID'],
    [{ outcome: undefined }, 'MISSING_MARKER_OUTCOME'],
    [{ outcome: 'maybe' }, 'UNKNOWN_MARKER_OUTCOME']
  ];
  for (const [changes, expected] of cases) {
    const recognizer = new V1CorrelationRecognizer(RUN);
    recognizer.observeRequest(request());
    recognizer.observeResponse(response('cdp-1', TOKEN_A, EXEC_A));
    recognizer.observeTransportFinished(RUN, 'cdp-1');
    recognizer.observeCompletionMarker(marker(TOKEN_A, changes));
    assert.ok(reasons(recognizer).includes(expected), expected);
  }
});

test('rejects marker token mismatch and leaves the request uncorrelated', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request());
  recognizer.observeResponse(response('cdp-1', TOKEN_A, EXEC_A));
  recognizer.observeTransportFinished(RUN, 'cdp-1');
  recognizer.observeCompletionMarker(marker(TOKEN_B));
  const result = recognizer.finalize();
  assert.deepEqual(result.proven, []);
  assert.ok(result.uncorrelated.some((candidate) => candidate.reason === 'MISSING_COMPLETION_MARKER'));
  assert.ok(result.uncorrelated.some((candidate) => candidate.reason === 'MARKER_TOKEN_MISMATCH'));
});

test('rejects conflicting server execution identity', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request());
  recognizer.observeResponse(response('cdp-1', TOKEN_A, EXEC_B));
  recognizer.observeTransportFinished(RUN, 'cdp-1');
  recognizer.observeCompletionMarker(marker());
  assert.ok(reasons(recognizer).includes('SERVER_EXECUTION_ID_CONFLICT'));
});

test('rejects conflicting completion outcomes for a duplicated token marker', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request());
  recognizer.observeResponse(response('cdp-1', TOKEN_A, EXEC_A));
  recognizer.observeTransportFinished(RUN, 'cdp-1');
  recognizer.observeCompletionMarker(marker());
  recognizer.observeCompletionMarker(marker(TOKEN_A, { outcome: 'failure' }));
  assert.ok(reasons(recognizer).includes('CONFLICTING_COMPLETION_OUTCOME'));
});

test('rejects missing completion marker and incomplete transport at session end', () => {
  const missingMarker = new V1CorrelationRecognizer(RUN);
  missingMarker.observeRequest(request());
  missingMarker.observeResponse(response('cdp-1', TOKEN_A, EXEC_A));
  missingMarker.observeTransportFinished(RUN, 'cdp-1');
  assert.ok(reasons(missingMarker).includes('MISSING_COMPLETION_MARKER'));
  const incomplete = new V1CorrelationRecognizer(RUN);
  incomplete.observeRequest(request());
  incomplete.observeResponse(response('cdp-1', TOKEN_A, EXEC_A));
  incomplete.observeCompletionMarker(marker());
  assert.ok(reasons(incomplete).includes('INCOMPLETE_TRANSPORT'));
});

test('rejects transport failure even if response and completion marker evidence also exists', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request());
  recognizer.observeResponse(response('cdp-1', TOKEN_A, EXEC_A));
  recognizer.observeTransportFinished(RUN, 'cdp-1');
  recognizer.observeTransportFailure(RUN, 'cdp-1');
  recognizer.observeCompletionMarker(marker());
  assert.ok(reasons(recognizer).includes('TRANSPORT_FAILURE'));
});

test('rejects duplicate transport terminal evidence', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request());
  recognizer.observeResponse(response('cdp-1', TOKEN_A, EXEC_A));
  recognizer.observeTransportFinished(RUN, 'cdp-1');
  recognizer.observeTransportFinished(RUN, 'cdp-1');
  recognizer.observeCompletionMarker(marker());
  assert.ok(reasons(recognizer).includes('DUPLICATE_TRANSPORT_TERMINAL_EVIDENCE'));
});

test('foreign-run evidence cannot complete a current-run request', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeRequest(request());
  recognizer.observeResponse({ ...response(), runId: 'RUN-OTHER' });
  recognizer.observeTransportFinished('RUN-OTHER', 'cdp-1');
  recognizer.observeCompletionMarker({ ...marker(), runId: 'RUN-OTHER' });
  const result = recognizer.finalize();
  assert.deepEqual(result.proven, []);
  assert.ok(result.uncorrelated.some((candidate) => candidate.reason === 'FOREIGN_RUN_EVIDENCE'));
});

test('a response arriving before its request is joined only by exact requestId at finalize', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.observeResponse(response('cdp-1', TOKEN_A, EXEC_A));
  recognizer.observeCompletionMarker(marker());
  recognizer.observeTransportFinished(RUN, 'cdp-1');
  recognizer.observeRequest(request());
  assert.equal(recognizer.finalize().proven[0].correlationId, TOKEN_A);
});

test('proven TraceEvent uses correlationId only after proof and keeps requestId separate', () => {
  const timeline = new Timeline({ runId: RUN });
  const recognizer = new V1CorrelationRecognizer(timeline.runId);
  valid(recognizer);
  const [event] = emitV1CorrelationEvents(timeline, recognizer.finalize());
  assert.equal(event.correlationId, TOKEN_A);
  assert.equal((event.data as { requestId: string }).requestId, 'cdp-1');
  assert.equal(event.type, 'CORRELATION_PROVEN');
});

test('rejected candidate TraceEvents never receive correlationId', () => {
  const timeline = new Timeline({ runId: RUN });
  const recognizer = new V1CorrelationRecognizer(timeline.runId);
  recognizer.observeRequest(request('unproved', TOKEN_A));
  const events = emitV1CorrelationEvents(timeline, recognizer.finalize());
  assert.ok(events.length > 0);
  assert.ok(events.every((event) => event.type === 'CORRELATION_UNCORRELATED' && event.correlationId === undefined));
});

test('normalized evidence does not retain arguments, bodies, headers, or secrets', () => {
  const secret = 'PRIVATE-ARGUMENT-AND-BODY-SENTINEL';
  const timeline = new Timeline({ runId: RUN });
  const recognizer = new V1CorrelationRecognizer(timeline.runId);
  recognizer.observeRequest({ runId: RUN, requestId: 'privacy-id', contractVersion: secret, correlationTokens: [secret] });
  const result = recognizer.finalize();
  emitV1CorrelationEvents(timeline, result);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(timeline.snapshot()).includes(secret), false);
  assert.equal(JSON.stringify(timeline.snapshot()).includes('arguments'), false);
});

test('recognizer is immutable after session finalization', () => {
  const recognizer = new V1CorrelationRecognizer(RUN);
  recognizer.finalize();
  assert.throws(() => recognizer.observeRequest(request()), /finalized/);
});
