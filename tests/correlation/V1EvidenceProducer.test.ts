import assert from 'node:assert/strict';
import test from 'node:test';
import { extractV1CompletionMarker, extractV1RequestEvidence, extractV1ResponseEvidence } from '../../src/correlation/V1EvidenceProducer.js';

const RUN = 'RUN-PRODUCER-1';
const TOKEN_A = 'V01H-11111111-2222-3333-4444-555555555555';
const TOKEN_B = 'V01H-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const EXEC_ID = '11111111-2222-3333-4444-555555555555';

function postData(envelope: unknown, dispatcher = 'syntheticDispatcher'): string {
  const args = [envelope];
  const tuple = [dispatcher, JSON.stringify(args), null, [0], null, null, 1, 0];
  return new URLSearchParams({ request: JSON.stringify(tuple) }).toString();
}

function request(envelope: unknown, options: Partial<{ method: string; resourceType: string; contentType: string; body: string; url: string }> = {}) {
  return extractV1RequestEvidence({
    runId: RUN, requestId: 'cdp-raw-7', url: options.url ?? 'https://script.google.com/macros/s/synthetic/exec', method: options.method ?? 'POST', resourceType: options.resourceType ?? 'XHR',
    contentType: options.contentType ?? 'application/x-www-form-urlencoded;charset=UTF-8',
    postData: options.body ?? postData(envelope)
  });
}

function response(result: unknown): string {
  const body = JSON.stringify(result);
  return `)]}'\n\n${JSON.stringify([['op.exec', [0, body]], ['di', 99]])}`;
}

test('extracts V1 request through URLSearchParams, RPC tuple, serialized args, and envelope without dispatcher authority', () => {
  const evidence = request({ contractVersion: 1, correlationToken: TOKEN_A, functionName: 'syntheticFn', args: ['ARGUMENT-SENTINEL'] }, { body: postData({ contractVersion: 1, correlationToken: TOKEN_A, functionName: 'syntheticFn', args: ['ARGUMENT-SENTINEL'] }, 'anyDispatcherName') });
  assert.deepEqual(evidence, { runId: RUN, requestId: 'cdp-raw-7', contractVersion: 1, correlationTokens: [TOKEN_A] });
  const serialized = JSON.stringify(evidence);
  for (const forbidden of ['anyDispatcherName', 'syntheticFn', 'ARGUMENT-SENTINEL', 'request=']) assert.equal(serialized.includes(forbidden), false);
});

test('ignores ordinary native RPC requests and non-POST/non-XHR/non-form traffic', () => {
  const ordinaryTuple = ['nativeDispatcher', JSON.stringify([{ value: 'PRIVATE-ARG' }]), null, [0], null, null, 1, 0];
  const ordinaryBody = new URLSearchParams({ request: JSON.stringify(ordinaryTuple) }).toString();
  assert.equal(extractV1RequestEvidence({ runId: RUN, requestId: 'native', url: 'https://script.google.com/macros/s/synthetic/exec', method: 'POST', resourceType: 'XHR', contentType: 'application/x-www-form-urlencoded', postData: ordinaryBody }), undefined);
  assert.equal(request({ contractVersion: 1, correlationToken: TOKEN_A, functionName: 'fn', args: [] }, { method: 'GET' }), undefined);
  assert.equal(request({ contractVersion: 1, correlationToken: TOKEN_A, functionName: 'fn', args: [] }, { resourceType: 'Fetch' }), undefined);
  assert.equal(request({ contractVersion: 1, correlationToken: TOKEN_A, functionName: 'fn', args: [] }, { contentType: 'application/json' }), undefined);
  assert.equal(extractV1RequestEvidence({ runId: RUN, requestId: 'missing-type', url: 'https://script.google.com/macros/s/x/exec', method: 'POST', resourceType: 'XHR', postData: postData({ contractVersion: 1, correlationToken: TOKEN_A, functionName: 'f', args: [] }) }), undefined);
});

test('retains bounded token/version candidates but never application function or argument data', () => {
  const withTokenNoVersion = request({ correlationToken: TOKEN_A, functionName: 'privateFunction', args: ['PRIVATE-ARGUMENT'] });
  assert.deepEqual(withTokenNoVersion?.correlationTokens, [TOKEN_A]);
  assert.equal(withTokenNoVersion?.contractVersion, undefined);
  const unknownVersion = request({ contractVersion: 8, correlationToken: TOKEN_A, functionName: 'privateFunction', args: ['PRIVATE-ARGUMENT'] });
  assert.equal(unknownVersion?.contractVersion, 8);
  const invalidVersion = request({ contractVersion: { secret: 'PRIVATE-VERSION' }, correlationToken: TOKEN_A, functionName: 'f', args: [] });
  assert.equal(invalidVersion?.contractVersion, -1);
  const normalized = JSON.stringify([withTokenNoVersion, unknownVersion, invalidVersion]);
  for (const forbidden of ['privateFunction', 'PRIVATE-ARGUMENT', 'PRIVATE-VERSION']) assert.equal(normalized.includes(forbidden), false);
});

test('collapses duplicate request token candidates and preserves multiple distinct candidates for rejection', () => {
  const duplicate = request({ contractVersion: 1, correlationToken: [TOKEN_A, TOKEN_A], functionName: 'f', args: [] });
  assert.deepEqual(duplicate?.correlationTokens, [TOKEN_A]);
  const multiple = request({ contractVersion: 1, correlationToken: [TOKEN_A, TOKEN_B], functionName: 'f', args: [] });
  assert.deepEqual(multiple?.correlationTokens, [TOKEN_A, TOKEN_B]);
});

test('does not stringify non-string or malformed request tokens into identities', () => {
  for (const bad of [17, { private: 'DO-NOT-RETAIN' }, 'not-a-valid-token']) {
    const evidence = request({ contractVersion: 1, correlationToken: bad, functionName: 'f', args: [] });
    assert.deepEqual(evidence?.correlationTokens, ['']);
    assert.equal(JSON.stringify(evidence).includes('DO-NOT-RETAIN'), false);
  }
});

test('malformed declared envelope shape is bounded as unsupported and cannot become proof', () => {
  const evidence = request({ contractVersion: 1, correlationToken: TOKEN_A, functionName: 7, args: 'PRIVATE-ARGS' });
  assert.equal(evidence?.contractVersion, -1);
  assert.deepEqual(evidence?.correlationTokens, [TOKEN_A]);
  assert.equal(JSON.stringify(evidence).includes('PRIVATE-ARGS'), false);
});

test('duplicate, absent, or unparseable request fields never produce proof evidence', () => {
  const body = postData({ contractVersion: 1, correlationToken: TOKEN_A, functionName: 'f', args: [] });
  const duplicateField = `${body}&${body}`;
  const duplicate = request({}, { body: duplicateField });
  assert.equal(duplicate?.contractVersion, -1);
  assert.deepEqual(duplicate?.correlationTokens, [TOKEN_A]);
  assert.equal(extractV1RequestEvidence({ runId: RUN, requestId: 'absent', url: 'https://script.google.com/macros/s/x/exec', method: 'POST', resourceType: 'XHR', postData: 'other=x' }), undefined);
  assert.equal(extractV1RequestEvidence({ runId: RUN, requestId: 'bad', url: 'https://script.google.com/macros/s/x/exec', method: 'POST', resourceType: 'XHR', postData: 'request=%7B' }), undefined);
  const unrelated = postData({ contractVersion: 1, correlationToken: TOKEN_A, functionName: 'f', args: [] });
  assert.equal(request({}, { body: unrelated, url: 'https://example.com/macros/s/x/exec' }), undefined);
  assert.equal(JSON.stringify(duplicate).includes(body), false);
});

test('extracts success and explicit-failure response evidence through exact anti-XSSI and op.exec path', () => {
  const success = extractV1ResponseEvidence({ runId: RUN, requestId: 'cdp-raw-7', body: response({ correlationToken: TOKEN_A, contractVersion: 1, result: 'PRIVATE-RESULT', serverExecution: { correlationToken: TOKEN_A, id: EXEC_ID } }) });
  const failure = extractV1ResponseEvidence({ runId: RUN, requestId: 'cdp-raw-8', body: response({ correlationToken: TOKEN_B, outcome: 'failure', error: { message: 'PRIVATE-ERROR' }, serverExecution: { correlationToken: TOKEN_B, id: EXEC_ID } }) });
  assert.deepEqual(success, { runId: RUN, requestId: 'cdp-raw-7', correlationTokens: [TOKEN_A], serverExecutionIds: [EXEC_ID] });
  assert.deepEqual(failure?.correlationTokens, [TOKEN_B]);
  const normalized = JSON.stringify([success, failure]);
  for (const forbidden of ['PRIVATE-RESULT', 'PRIVATE-ERROR', '"contractVersion"']) assert.equal(normalized.includes(forbidden), false);
});

test('preserves distinct response tokens, deduplicates exact fields, and uses only narrow serverExecution.id', () => {
  const same = extractV1ResponseEvidence({ runId: RUN, requestId: 'same', body: response({ correlationToken: TOKEN_A, serverExecution: { correlationToken: TOKEN_A, id: EXEC_ID, unrelatedUuid: TOKEN_B } }) });
  assert.deepEqual(same?.correlationTokens, [TOKEN_A]);
  assert.deepEqual(same?.serverExecutionIds, [EXEC_ID]);
  const conflict = extractV1ResponseEvidence({ runId: RUN, requestId: 'conflict', body: response({ correlationToken: TOKEN_A, serverExecution: { correlationToken: TOKEN_B, id: EXEC_ID } }) });
  assert.deepEqual(conflict?.correlationTokens, [TOKEN_A, TOKEN_B]);
});

test('rejects malformed response prefix, RPC, duplicate op.exec, and result envelope', () => {
  const valid = response({ correlationToken: TOKEN_A });
  assert.equal(extractV1ResponseEvidence({ runId: RUN, requestId: 'bad-prefix', body: valid.slice(1) }), undefined);
  assert.equal(extractV1ResponseEvidence({ runId: RUN, requestId: 'bad-rpc', body: `)]}'\n\n{` }), undefined);
  const duplicateExec = `)]}'\n\n${JSON.stringify([['op.exec', [0, '{}']], ['op.exec', [0, '{}']]])}`;
  assert.equal(extractV1ResponseEvidence({ runId: RUN, requestId: 'duplicate', body: duplicateExec }), undefined);
  assert.equal(extractV1ResponseEvidence({ runId: RUN, requestId: 'bad-result', body: response('not-object') }), undefined);
});

test('response parser ignores independently visible response version as proof authority', () => {
  const evidence = extractV1ResponseEvidence({ runId: RUN, requestId: 'version', body: response({ correlationToken: TOKEN_A, contractVersion: 99 }) });
  assert.deepEqual(evidence?.correlationTokens, [TOKEN_A]);
  assert.equal(Object.hasOwn(evidence ?? {}, 'contractVersion'), false);
});

test('parses only the exact marker prefix and the four allowed evidence fields', () => {
  const marker = extractV1CompletionMarker(`CDLD_CORRELATION_V1 ${JSON.stringify({ contractVersion: 1, correlationToken: TOKEN_A, serverExecutionId: EXEC_ID, outcome: 'success', args: ['PRIVATE-ARG'], result: 'PRIVATE-RESULT' })}`, RUN);
  assert.deepEqual(marker, { runId: RUN, markerName: 'CDLD_CORRELATION_V1', contractVersion: 1, correlationToken: TOKEN_A, serverExecutionId: EXEC_ID, outcome: 'success' });
  assert.equal(extractV1CompletionMarker('unrelated PRIVATE-CONSOLE', RUN), undefined);
  assert.equal(extractV1CompletionMarker('CDLD_CORRELATION_V1X {"correlationToken":"x"}', RUN), undefined);
  const malformed = extractV1CompletionMarker('CDLD_CORRELATION_V1 arbitrary PRIVATE-CONSOLE', RUN);
  assert.equal(malformed?.correlationToken, '');
  assert.equal(JSON.stringify(malformed).includes('PRIVATE-CONSOLE'), false);
  const unknownOutcome = extractV1CompletionMarker(`CDLD_CORRELATION_V1 ${JSON.stringify({ contractVersion: 1, correlationToken: TOKEN_A, serverExecutionId: EXEC_ID, outcome: 'PRIVATE_OUTCOME' })}`, RUN);
  assert.equal(unknownOutcome?.outcome, '__UNKNOWN_OUTCOME__');
  assert.equal(JSON.stringify(unknownOutcome).includes('PRIVATE_OUTCOME'), false);
});
