import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { normalizeChildRuntimeMarker, RawChildMarkerObserver } from '../../src/browser/RawChildMarkerObserver.js';

const RUN_ID = 'RUN-RAW-1';
const TOKEN = 'V01H-11111111-2222-3333-4444-555555555555';
const EXEC_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function markerPacket(marker: Record<string, unknown>): string {
  return JSON.stringify({
    method: 'Runtime.consoleAPICalled',
    params: {
      type: 'info',
      args: [
        { type: 'string', value: 'CDLD_CORRELATION_V1' },
        { type: 'string', value: JSON.stringify(marker) }
      ]
    }
  });
}

class FakeSession extends EventEmitter {
  sent: Array<{ method: string; params?: Record<string, unknown> }> = [];
  detached: string[] = [];
  attachTypes: string[] = ['iframe', 'worker'];

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.sent.push({ method, params });
    if (method === 'Target.setAutoAttach' && params?.autoAttach === true) {
      queueMicrotask(() => {
        for (const [index, type] of this.attachTypes.entries()) {
          this.emit('Target.attachedToTarget', { sessionId: `child-${index + 1}`, targetInfo: { type } });
        }
      });
    }
    if (method === 'Target.sendMessageToTarget' && typeof params?.sessionId === 'string' && typeof params.message === 'string') {
      const command = JSON.parse(params.message) as { id: number };
      queueMicrotask(() => this.emit('Target.receivedMessageFromTarget', {
        sessionId: params.sessionId,
        message: JSON.stringify({ id: command.id, result: {} })
      }));
    }
    if (method === 'Target.detachFromTarget' && typeof params?.sessionId === 'string') this.detached.push(params.sessionId);
    return {};
  }
}

test('normalizes only exact child Runtime.consoleAPICalled marker identity fields', () => {
  const evidence = normalizeChildRuntimeMarker(markerPacket({
    contractVersion: 1,
    correlationToken: TOKEN,
    serverExecutionId: EXEC_ID,
    outcome: 'success',
    result: 'PRIVATE_RESULT',
    arguments: ['PRIVATE_ARGUMENT'],
    unrelated: 'PRIVATE_VALUE'
  }), RUN_ID);
  assert.deepEqual(evidence, {
    runId: RUN_ID,
    markerName: 'CDLD_CORRELATION_V1',
    contractVersion: 1,
    correlationToken: TOKEN,
    serverExecutionId: EXEC_ID,
    outcome: 'success'
  });
  assert.equal(JSON.stringify(evidence).includes('PRIVATE'), false);
});

test('ignores unrelated runtime events, wrong marker names, malformed payloads and object previews', () => {
  assert.equal(normalizeChildRuntimeMarker('not-json', RUN_ID), undefined);
  assert.equal(normalizeChildRuntimeMarker(JSON.stringify({ method: 'Runtime.executionContextCreated', params: {} }), RUN_ID), undefined);
  assert.equal(normalizeChildRuntimeMarker(JSON.stringify({
    method: 'Runtime.consoleAPICalled', params: { type: 'log', args: [] }
  }), RUN_ID), undefined);
  assert.equal(normalizeChildRuntimeMarker(JSON.stringify({
    method: 'Runtime.consoleAPICalled', params: { type: 'info', args: [{ type: 'string', value: 'OTHER' }, { type: 'string', value: '{}' }] }
  }), RUN_ID), undefined);
  assert.equal(normalizeChildRuntimeMarker(JSON.stringify({
    method: 'Runtime.consoleAPICalled', params: { type: 'info', args: [{ type: 'string', value: 'CDLD_CORRELATION_V1' }, { type: 'object', preview: 'PRIVATE_PREVIEW' }] }
  }), RUN_ID), undefined);
});

test('malformed marker is reduced to invalid evidence without coercing values or retaining extras', () => {
  const missing = normalizeChildRuntimeMarker(markerPacket({ extra: 'PRIVATE' }), RUN_ID);
  assert.deepEqual(missing, {
    runId: RUN_ID,
    markerName: 'CDLD_CORRELATION_V1',
    correlationToken: '',
    serverExecutionId: ''
  });
  const wrongTypes = normalizeChildRuntimeMarker(markerPacket({
    contractVersion: '1', correlationToken: 123, serverExecutionId: EXEC_ID, outcome: 'success', extra: 'PRIVATE'
  }), RUN_ID);
  assert.equal(wrongTypes?.correlationToken, '');
  assert.equal(wrongTypes?.contractVersion, -1);
  assert.equal(JSON.stringify(wrongTypes).includes('PRIVATE'), false);
  assert.notEqual(wrongTypes?.correlationToken, TOKEN);
});

test('attaches only iframe child sessions, fans marker evidence across children, preserves duplicates, and detaches on stop', async () => {
  const session = new FakeSession();
  const received: unknown[] = [];
  const observer = new RawChildMarkerObserver(session as never, RUN_ID, (evidence) => received.push(evidence));
  await observer.start(100);
  const filter = session.sent.find((item) => item.method === 'Target.setAutoAttach' && item.params?.autoAttach === true)?.params?.filter;
  assert.deepEqual(filter, [{ type: 'iframe' }, { exclude: true }]);
  assert.equal(session.sent.some((item) => item.method === 'Runtime.evaluate'), false);
  assert.equal(session.sent.some((item) => item.method === 'Target.sendMessageToTarget' && item.params?.sessionId === 'child-2'), false);
  const packet = markerPacket({ contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'success' });
  session.emit('Target.receivedMessageFromTarget', { sessionId: 'child-2', message: packet });
  session.emit('Target.receivedMessageFromTarget', { sessionId: 'child-1', message: packet });
  session.emit('Target.receivedMessageFromTarget', { sessionId: 'child-1', message: packet });
  assert.equal(received.length, 2);
  await observer.stop();
  assert.deepEqual(session.detached, ['child-1']);
  assert.equal(session.listenerCount('Target.receivedMessageFromTarget'), 0);
  assert.equal(session.sent.some((item) => item.method === 'Target.setAutoAttach' && item.params?.autoAttach === false), true);
});

test('one observer receives independent markers from two iframe sessions and ignores non-iframe targets', async () => {
  const session = new FakeSession();
  session.attachTypes = ['iframe', 'iframe', 'worker'];
  const received: unknown[] = [];
  const observer = new RawChildMarkerObserver(session as never, RUN_ID, (evidence) => received.push(evidence));

  await observer.start(100);

  const runtimeCommands = session.sent.filter((item) => item.method === 'Target.sendMessageToTarget');
  const enabledSessions = runtimeCommands.map((item) => {
    const message = item.params?.message;
    if (typeof message !== 'string') throw new Error('Expected a nested Runtime command message');
    const command = JSON.parse(message) as { method?: string };
    assert.equal(command.method, 'Runtime.enable');
    return item.params?.sessionId;
  });
  assert.deepEqual(enabledSessions.sort(), ['child-1', 'child-2']);
  assert.equal(session.sent.some((item) => item.params?.sessionId === 'child-3'), false);
  assert.equal(session.listenerCount('Target.receivedMessageFromTarget'), 1);

  const firstToken = 'V01H-11111111-2222-3333-4444-555555555551';
  const secondToken = 'V01H-11111111-2222-3333-4444-555555555552';
  const firstExecId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1';
  const secondExecId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2';
  session.emit('Target.receivedMessageFromTarget', {
    sessionId: 'child-2',
    message: markerPacket({ contractVersion: 1, correlationToken: secondToken, serverExecutionId: secondExecId, outcome: 'failure' })
  });
  session.emit('Target.receivedMessageFromTarget', {
    sessionId: 'child-1',
    message: markerPacket({ contractVersion: 1, correlationToken: firstToken, serverExecutionId: firstExecId, outcome: 'success' })
  });
  session.emit('Target.receivedMessageFromTarget', {
    sessionId: 'child-3',
    message: markerPacket({ contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'success' })
  });

  assert.equal(received.length, 2);
  assert.deepEqual(received.map((item) => (item as { correlationToken: string }).correlationToken), [secondToken, firstToken]);
  assert.deepEqual(received.map((item) => (item as { serverExecutionId: string }).serverExecutionId), [secondExecId, firstExecId]);
  assert.deepEqual(Object.keys(received[0] as object).sort(), [
    'contractVersion', 'correlationToken', 'markerName', 'outcome', 'runId', 'serverExecutionId'
  ]);
  assert.equal(JSON.stringify(received).includes('child-'), false);

  await observer.stop();
  assert.deepEqual(session.detached.sort(), ['child-1', 'child-2']);
  assert.equal(session.listenerCount('Target.attachedToTarget'), 0);
  assert.equal(session.listenerCount('Target.detachedFromTarget'), 0);
  assert.equal(session.listenerCount('Target.receivedMessageFromTarget'), 0);
});

test('separate raw marker observers do not share child-session evidence', async () => {
  const firstSession = new FakeSession();
  const secondSession = new FakeSession();
  const firstMarkers: unknown[] = [];
  const secondMarkers: unknown[] = [];
  const first = new RawChildMarkerObserver(firstSession as never, RUN_ID, (marker) => firstMarkers.push(marker));
  const second = new RawChildMarkerObserver(secondSession as never, RUN_ID, (marker) => secondMarkers.push(marker));
  await Promise.all([first.start(100), second.start(100)]);
  const packet = markerPacket({ contractVersion: 1, correlationToken: TOKEN, serverExecutionId: EXEC_ID, outcome: 'failure' });
  firstSession.emit('Target.receivedMessageFromTarget', { sessionId: 'child-1', message: packet });
  assert.equal(firstMarkers.length, 1);
  assert.equal(secondMarkers.length, 0);
  await Promise.all([first.stop(), second.stop()]);
});

test('child Runtime enable failure rejects readiness and cleans listeners and attachment', async () => {
  const session = new FakeSession();
  const originalSend = session.send.bind(session);
  session.send = async (method, params) => {
    if (method === 'Target.sendMessageToTarget') throw new Error('synthetic attach failure');
    return originalSend(method, params);
  };
  const observer = new RawChildMarkerObserver(session as never, RUN_ID, () => undefined);
  await assert.rejects(observer.start(100), /synthetic attach failure/);
  assert.equal(session.listenerCount('Target.attachedToTarget'), 0);
  assert.equal(session.listenerCount('Target.receivedMessageFromTarget'), 0);
  assert.deepEqual(session.detached, ['child-1']);
});
