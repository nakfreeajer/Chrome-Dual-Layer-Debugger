import assert from 'node:assert/strict';
import test from 'node:test';
import { GasAdapter, type GasRemoteDebugApi } from '../../src/gas/GasAdapter.js';
import type { DiscoveredPage } from '../../src/browser/BrowserDiscovery.js';

function makeFixture() {
  const calls = { connect: 0, discover: 0, attach: 0, wait: 0, list: 0, disconnect: 0, pageClose: 0, browserClose: 0, expectedPort: 9222 };
  const url = 'https://script.google.com/macros/s/example/exec';
  const page = {
    pageId: 'PAGE-0001', contextId: 'CONTEXT-0001', url, mode: 'BROWSER_PLUS_GAS' as const,
    frames: [], executionContextIds: [],
    close: () => { calls.pageClose += 1; },
    browser: { close: () => { calls.browserClose += 1; } }
  } as unknown as DiscoveredPage;
  const state = {
    registries: {
      targets: new Map([
        ['target-native', { targetId: 'target-native', type: 'page', url }],
        ['iframe-native', { targetId: 'iframe-native', type: 'iframe', url: 'https://sandbox.googleusercontent.test/userCodeAppPanel', title: 'userCodeAppPanel' }]
      ]),
      sessions: new Map([
        ['session-native', { sessionId: 'session-native', targetId: 'target-native', parentSessionId: '', detached: false }],
        ['iframe-session-native', { sessionId: 'iframe-session-native', targetId: 'iframe-native', parentSessionId: 'session-native', detached: false }]
      ]),
      frames: new Map([['frame-native', { frameId: 'frame-native', sessionId: 'session-native', parentFrameId: '', url }]]),
      contexts: new Map([['session-native:77', {
        targetId: 'target-native', sessionId: 'session-native', executionContextId: 77,
        frameId: 'frame-native', defaultWorld: true, alive: true
      }]])
    }
  };
  const contexts = [{
    targetId: 'target-native', sessionId: 'session-native', executionContextId: 77,
    frameId: 'frame-native', origin: 'https://script.google.com', name: 'app',
    defaultWorld: true, ignored: false, alive: true
  }];
  const targetInfos = [
    { targetId: 'target-native', type: 'page', url },
    { targetId: 'iframe-native', type: 'iframe', url: 'https://sandbox.googleusercontent.test/userCodeAppPanel', title: 'userCodeAppPanel' }
  ];
  const api: GasRemoteDebugApi = {
    async connectBrowserCdp(options) { calls.connect += 1; assert.deepEqual(options, { host: '127.0.0.1', port: calls.expectedPort }); return state as never; },
    async discoverTargets() { calls.discover += 1; return targetInfos; },
    async attachRecursive(_state, options) {
      calls.attach += 1;
      const selected = targetInfos.find(options.targetSelector);
      assert.ok(selected);
      const targetId = String(selected.targetId);
      return { targetInfo: selected, sessionId: targetId === 'target-native' ? 'session-native' : 'iframe-session-native' };
    },
    async waitForDefaultContexts() { calls.wait += 1; return contexts; },
    listRuntimeContexts() { calls.list += 1; return contexts; },
    async disconnect() { calls.disconnect += 1; },
    redactSecrets(value) { return value; },
    findRuntimeContext: async () => null,
    genericGasProfile: {
      name: 'generic-gas',
      targetSelector: (target, options = {}) => (!options.targetType || target.type === options.targetType)
        && (target.title === 'userCodeAppPanel' || target.url === url),
      buildProbeExpression: () => '({globals:{}})',
      contextPredicate: () => false
    }
  };
  return { calls, page, api, contexts };
}

test('GasAdapter stays inactive unless the exact URL prefix selects GAS', async () => {
  const { calls, page, api } = makeFixture();
  const adapter = new GasAdapter(api);
  const ordinary = await adapter.discover({ ...page, url: 'https://example.test/?next=https://script.google.com/macros/', mode: 'BROWSER_PLUS_GAS' }, 'http://127.0.0.1:9222');
  assert.deepEqual(ordinary, { active: false, reason: 'BROWSER_ONLY' });
  assert.equal(calls.connect, 0);
  assert.equal(calls.attach, 0);
});

test('GasAdapter delegates recursive discovery and preserves dependency-native IDs, then disconnects only', async () => {
  const { calls, page, api } = makeFixture();
  const adapter = new GasAdapter(api);
  const result = await adapter.discover(page, 'http://127.0.0.1:9222');
  assert.equal(result.active, true);
  if (!result.active) return;
  assert.equal(result.selectedTargetId, 'target-native');
  assert.equal(result.attachedSessionId, 'session-native');
  assert.deepEqual(result.attachedTargets, [
    { targetId: 'target-native', sessionId: 'session-native' },
    { targetId: 'iframe-native', sessionId: 'iframe-session-native' }
  ]);
  assert.deepEqual(result.frames.map((frame) => frame.frameId), ['frame-native']);
  assert.deepEqual(result.contexts.map((context) => context.executionContextId), [77]);
  assert.equal(calls.connect, 1);
  assert.equal(calls.discover, 1);
  assert.equal(calls.attach, 2);
  assert.equal(calls.wait, 1);
  assert.equal(calls.list, 1);
  await adapter.disconnect();
  assert.equal(calls.disconnect, 1);
  assert.equal(calls.pageClose, 0);
  assert.equal(calls.browserClose, 0);
});

test('TEST-only target attachment requires explicit target authorization and returns exact live contexts', async () => {
  const { calls, api } = makeFixture();
  const adapter = new GasAdapter(api);
  await assert.rejects(adapter.connectTestTarget('http://127.0.0.1:9444', {
    mode: 'TEST', targetId: '', fixtureId: 'fixture', approvalReference: 'approved'
  }), /TEST authorization/);
  assert.equal(calls.connect, 0);
  calls.expectedPort = 9444;
  const contexts = await adapter.connectTestTarget('http://127.0.0.1:9444', {
    mode: 'TEST', targetId: 'target-native', fixtureId: 'synthetic-fixture', approvalReference: 'human-test-approval'
  });
  assert.deepEqual(contexts, [{ targetId: 'target-native', sessionId: 'session-native', executionContextId: 77, frameId: 'frame-native', defaultWorld: true }]);
  assert.equal(calls.connect, 1);
  assert.equal(calls.attach, 1);
  assert.equal(calls.wait, 1);
  await adapter.disconnect();
  assert.equal(calls.pageClose, 0);
  assert.equal(calls.browserClose, 0);
});
