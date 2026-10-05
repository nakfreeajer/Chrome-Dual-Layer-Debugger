import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { V1CorrelationObserver, V1ObserverScopeIds } from '../../src/browser/V1CorrelationObserver.js';
import { Timeline } from '../../src/trace/Timeline.js';
import type { Page } from 'playwright';

const TOKEN = 'V01H-11111111-2222-3333-4444-555555555555';
const EXEC_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

class FakeSession extends EventEmitter {
  sent: string[] = [];
  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.sent.push(method);
    if (method === 'Target.setAutoAttach' && params?.autoAttach === true) {
      queueMicrotask(() => this.emit('Target.attachedToTarget', { sessionId: 'child-1', targetInfo: { type: 'iframe' } }));
    }
    if (method === 'Target.sendMessageToTarget' && typeof params?.sessionId === 'string' && typeof params.message === 'string') {
      const command = JSON.parse(params.message) as { id: number };
      queueMicrotask(() => this.emit('Target.receivedMessageFromTarget', {
        sessionId: params.sessionId,
        message: JSON.stringify({ id: command.id, result: {} })
      }));
    }
    if (method === 'Network.getResponseBody') {
      const result = { correlationToken: TOKEN, serverExecution: { correlationToken: TOKEN, id: EXEC_ID } };
      return { body: `)]}'\n\n${JSON.stringify([['op.exec', [0, JSON.stringify(result)]], ['di', 1]])}`, base64Encoded: false };
    }
    return {};
  }
  async detach(): Promise<void> { this.sent.push('detach'); }
}

class FakePage extends EventEmitter {
  readonly session = new FakeSession();
  context() { return { newCDPSession: async () => this.session }; }
}

function encodedRequest(): string {
  const envelope = { contractVersion: 1, correlationToken: TOKEN, functionName: 'PRIVATE_FN', args: ['PRIVATE_ARG'] };
  const tuple = ['anyDispatcher', JSON.stringify([envelope]), null, [0], null, null, 1, 0];
  return new URLSearchParams({ request: JSON.stringify(tuple) }).toString();
}

function emitRawMarker(session: FakeSession, marker: Record<string, unknown>, sessionId = 'child-1'): void {
  session.emit('Target.receivedMessageFromTarget', {
    sessionId,
    message: JSON.stringify({
      method: 'Runtime.consoleAPICalled',
      params: {
        type: 'info',
        args: [
          { type: 'string', value: 'CDLD_CORRELATION_V1' },
          { type: 'string', value: JSON.stringify(marker) }
        ]
      }
    })
  });
}

test('page observer scopes requestId, emits proof before session end, and retains no raw application data', async () => {
  const timeline = new Timeline({ runId: 'RUN-OBSERVER-1' });
  const page = new FakePage();
  const ids = new V1ObserverScopeIds();
  const observer = new V1CorrelationObserver(page as unknown as Page, timeline, ids);
  await observer.start();
  page.emit('console', { text: () => `CDLD_CORRELATION_V1 ${JSON.stringify({ contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'success', result: 'PRIVATE_RESULT' })}` });
  emitRawMarker(page.session, { contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'success', result: 'PRIVATE_RESULT' });
  page.session.emit('Network.requestWillBeSent', {
    requestId: 'native-1', type: 'XHR', request: { method: 'POST', url: 'https://script.google.com/macros/s/SECRET/exec', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: encodedRequest() }
  });
  page.session.emit('Network.responseReceived', { requestId: 'native-1' });
  page.session.emit('Network.loadingFinished', { requestId: 'native-1' });
  const { result, events } = await observer.stop();
  timeline.append(timeline.create({ source: 'CORE', category: 'SESSION', type: 'SESSION_ENDED', data: {} }));
  assert.equal(result.proven.length, 1);
  assert.equal(result.proven[0].outcome, 'success');
  assert.equal(events[0].correlationId, TOKEN);
  assert.deepEqual(events[0].data, {
    contractVersion: 1, observerScopeId: 'V1-OBSERVER-000001', requestId: 'native-1', serverExecutionId: EXEC_ID,
    outcome: 'success', status: 'CORRELATED', versionEvidence: ['request', 'completion-marker']
  });
  assert.ok(events[0].sequence < timeline.snapshot().at(-1)!.sequence);
  const serialized = JSON.stringify(timeline.snapshot());
  for (const forbidden of ['PRIVATE_FN', 'PRIVATE_ARG', 'PRIVATE_RESULT', 'SECRET', 'request=']) assert.equal(serialized.includes(forbidden), false);
  assert.equal(page.session.sent.filter((x) => x === 'Network.getResponseBody').length, 1);
  assert.equal(page.session.sent.at(-1), 'detach');
});

test('ordinary native traffic is quiet and response bodies are never requested for it', async () => {
  const timeline = new Timeline({ runId: 'RUN-OBSERVER-NATIVE' });
  const page = new FakePage();
  const observer = new V1CorrelationObserver(page as unknown as Page, timeline, new V1ObserverScopeIds());
  await observer.start();
  const tuple = ['nativeDispatcher', JSON.stringify([{ ordinary: 'PRIVATE_NATIVE_ARG' }]), null, [0], null, null, 1, 0];
  page.session.emit('Network.requestWillBeSent', { requestId: 'native', type: 'XHR', request: { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: new URLSearchParams({ request: JSON.stringify(tuple) }).toString() } });
  page.session.emit('Network.responseReceived', { requestId: 'native' });
  page.session.emit('Network.loadingFinished', { requestId: 'native' });
  const { result, events } = await observer.stop();
  assert.deepEqual(result.proven, []);
  assert.deepEqual(result.uncorrelated, []);
  assert.deepEqual(events, []);
  assert.equal(page.session.sent.includes('Network.getResponseBody'), false);
});

test('duplicate terminal signals remain visible to recognizer and reject proof', async () => {
  const timeline = new Timeline({ runId: 'RUN-OBSERVER-DUP' });
  const page = new FakePage();
  const observer = new V1CorrelationObserver(page as unknown as Page, timeline, new V1ObserverScopeIds());
  await observer.start();
  page.emit('console', { text: () => `CDLD_CORRELATION_V1 ${JSON.stringify({ contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'success' })}` });
  emitRawMarker(page.session, { contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'success' });
  page.session.emit('Network.requestWillBeSent', { requestId: 'same', type: 'XHR', request: { method: 'POST', url: 'https://script.google.com/macros/s/synthetic/exec', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: encodedRequest() } });
  page.session.emit('Network.responseReceived', { requestId: 'same' });
  page.session.emit('Network.loadingFinished', { requestId: 'same' });
  page.session.emit('Network.loadingFinished', { requestId: 'same' });
  const { result } = await observer.stop();
  assert.deepEqual(result.proven, []);
  assert.ok(result.uncorrelated.some((candidate) => candidate.reason === 'DUPLICATE_TRANSPORT_TERMINAL_EVIDENCE'));
});

test('duplicate responseReceived evidence remains visible and cannot prove correlation', async () => {
  const timeline = new Timeline({ runId: 'RUN-OBSERVER-RESPONSE-DUP' });
  const page = new FakePage();
  const observer = new V1CorrelationObserver(page as unknown as Page, timeline, new V1ObserverScopeIds());
  await observer.start();
  emitRawMarker(page.session, { contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'success' });
  page.session.emit('Network.requestWillBeSent', { requestId: 'response-dup', type: 'XHR', request: { method: 'POST', url: 'https://script.google.com/macros/s/synthetic/exec', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: encodedRequest() } });
  page.session.emit('Network.responseReceived', { requestId: 'response-dup' });
  page.session.emit('Network.responseReceived', { requestId: 'response-dup' });
  page.session.emit('Network.loadingFinished', { requestId: 'response-dup' });
  const { result } = await observer.stop();
  assert.deepEqual(result.proven, []);
  assert.ok(result.uncorrelated.some((candidate) => candidate.reason === 'DUPLICATE_RESPONSE_EVIDENCE'));
});

test('responseReceived alone is not transport completion and loadingFailed rejects the candidate', async () => {
  const incompleteTimeline = new Timeline({ runId: 'RUN-OBSERVER-INCOMPLETE' });
  const incompletePage = new FakePage();
  const incompleteObserver = new V1CorrelationObserver(incompletePage as unknown as Page, incompleteTimeline, new V1ObserverScopeIds());
  await incompleteObserver.start();
  emitRawMarker(incompletePage.session, { contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'success' });
  incompletePage.session.emit('Network.requestWillBeSent', { requestId: 'incomplete', type: 'XHR', request: { method: 'POST', url: 'https://script.google.com/macros/s/synthetic/exec', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: encodedRequest() } });
  incompletePage.session.emit('Network.responseReceived', { requestId: 'incomplete' });
  const incomplete = await incompleteObserver.stop();
  assert.deepEqual(incomplete.result.proven, []);
  assert.ok(incomplete.result.uncorrelated.some((candidate) => candidate.reason === 'INCOMPLETE_TRANSPORT'));
  assert.equal(incompletePage.session.sent.includes('Network.getResponseBody'), false);

  const timeline = new Timeline({ runId: 'RUN-OBSERVER-FAILED' });
  const page = new FakePage();
  const observer = new V1CorrelationObserver(page as unknown as Page, timeline, new V1ObserverScopeIds());
  await observer.start();
  emitRawMarker(page.session, { contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'success' });
  page.session.emit('Network.requestWillBeSent', { requestId: 'failed', type: 'XHR', request: { method: 'POST', url: 'https://script.google.com/macros/s/synthetic/exec', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: encodedRequest() } });
  page.session.emit('Network.responseReceived', { requestId: 'failed' });
  page.session.emit('Network.loadingFailed', { requestId: 'failed' });
  const { result } = await observer.stop();
  assert.deepEqual(result.proven, []);
  assert.ok(result.uncorrelated.some((candidate) => candidate.reason === 'TRANSPORT_FAILURE'));
  assert.equal(page.session.sent.includes('Network.getResponseBody'), false);
});

test('two page observers may safely reuse raw requestId under distinct scopes', async () => {
  const timeline = new Timeline({ runId: 'RUN-OBSERVER-SCOPES' });
  const ids = new V1ObserverScopeIds();
  const firstPage = new FakePage();
  const secondPage = new FakePage();
  const first = new V1CorrelationObserver(firstPage as unknown as Page, timeline, ids);
  const second = new V1CorrelationObserver(secondPage as unknown as Page, timeline, ids);
  await first.start();
  await second.start();
  for (const page of [firstPage, secondPage]) {
    page.emit('console', { text: () => `CDLD_CORRELATION_V1 ${JSON.stringify({ contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'failure' })}` });
    emitRawMarker(page.session, { contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'failure' });
    page.session.emit('Network.requestWillBeSent', { requestId: 'reused-raw-id', type: 'XHR', request: { method: 'POST', url: 'https://script.google.com/macros/s/synthetic/exec', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: encodedRequest() } });
    page.session.emit('Network.responseReceived', { requestId: 'reused-raw-id' });
    page.session.emit('Network.loadingFinished', { requestId: 'reused-raw-id' });
  }
  const a = await first.stop();
  const b = await second.stop();
  assert.equal(a.result.proven[0].requestId, b.result.proven[0].requestId);
  assert.notEqual(a.events[0].data && (a.events[0].data as { observerScopeId: string }).observerScopeId, (b.events[0].data as { observerScopeId: string }).observerScopeId);
  assert.deepEqual([a.result.proven.length, b.result.proven.length], [1, 1]);
});

test('marker arrival order does not control pairing and observer IDs are deterministic', () => {
  const ids = new V1ObserverScopeIds();
  assert.deepEqual([ids.next(), ids.next()], ['V1-OBSERVER-000001', 'V1-OBSERVER-000002']);
});

test('Playwright page console is diagnostic only and cannot complete a production proof', async () => {
  const timeline = new Timeline({ runId: 'RUN-OBSERVER-NO-PAGE-MARKER' });
  const page = new FakePage();
  const observer = new V1CorrelationObserver(page as unknown as Page, timeline, new V1ObserverScopeIds());
  await observer.start();
  page.emit('console', { text: () => `CDLD_CORRELATION_V1 ${JSON.stringify({ contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'success' })}` });
  page.session.emit('Network.requestWillBeSent', { requestId: 'no-raw-marker', type: 'XHR', request: { method: 'POST', url: 'https://script.google.com/macros/s/synthetic/exec', headers: { 'content-type': 'application/x-www-form-urlencoded' }, postData: encodedRequest() } });
  page.session.emit('Network.responseReceived', { requestId: 'no-raw-marker' });
  page.session.emit('Network.loadingFinished', { requestId: 'no-raw-marker' });
  const { result } = await observer.stop();
  assert.deepEqual(result.proven, []);
  assert.ok(result.uncorrelated.some((candidate) => candidate.reason === 'MISSING_COMPLETION_MARKER'));
});
