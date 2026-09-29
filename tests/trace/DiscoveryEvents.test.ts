import assert from 'node:assert/strict';
import test from 'node:test';
import { emitBrowserDiscovery, emitGasDiscovery, emitMappingEvidence } from '../../src/trace/DiscoveryEvents.js';
import { Timeline } from '../../src/trace/Timeline.js';
import { mapCrossLayerIdentities } from '../../src/core/CrossLayerMapper.js';
import type { DiscoveryResult } from '../../src/browser/BrowserDiscovery.js';
import type { GasDiscoveryResult } from '../../src/gas/GasAdapter.js';
import { redactGasSecrets } from '../../src/gas/GasAdapter.js';

const browser: DiscoveryResult = { connected: true, contexts: [{ contextId: 'CONTEXT-0001', pages: [{
  contextId: 'CONTEXT-0001', pageId: 'PAGE-0001', url: 'https://script.google.com/macros/s/a/exec',
  mode: 'BROWSER_PLUS_GAS', executionContextIds: [7], frames: [{ frameId: 'FRAME-0001', protocolFrameId: 'proto-root', url: 'https://script.google.com/macros/s/a/exec', children: [] }]
}] }] };

const gas: GasDiscoveryResult = {
  active: true, profileName: 'generic-gas', selectedTargetId: 'native-target', attachedSessionId: 'native-session',
  attachedTargets: [{ targetId: 'native-target', sessionId: 'native-session' }], profileTargetCandidates: [], skippedAmbiguousProfileTargets: false,
  targets: [{ targetId: 'native-target', type: 'page', url: browser.contexts[0].pages[0].url }],
  sessions: [{ sessionId: 'native-session', targetId: 'native-target', parentSessionId: '', detached: false }],
  frames: [{ frameId: 'proto-root', sessionId: 'native-session', targetId: 'native-target', parentFrameId: '' }],
  contexts: [{ targetId: 'native-target', sessionId: 'native-session', executionContextId: 88, frameId: 'proto-root', origin: 'https://script.google.com', name: 'app', defaultWorld: true, ignored: false, alive: true },
    { targetId: 'sibling-target', sessionId: 'sibling-session', executionContextId: 89, frameId: 'sibling-frame', origin: 'https://sandbox.test', name: '', defaultWorld: true, ignored: false, alive: true }],
  matchedRuntimeContext: { targetId: 'native-target', sessionId: 'native-session', executionContextId: 88, frameId: 'proto-root' }
};

test('normalizes browser and GAS discovery while preserving dependency-native identities', () => {
  const timeline = new Timeline({ runId: 'RUN-NORMALIZE-1' });
  emitBrowserDiscovery(timeline, browser);
  emitGasDiscovery(timeline, gas);
  const events = timeline.snapshot();
  assert.ok(events.some((event) => event.type === 'CONTEXT_DISCOVERED' && event.contextId === 'CONTEXT-0001'));
  assert.ok(events.some((event) => event.type === 'PAGE_DISCOVERED' && event.pageId === 'PAGE-0001'));
  assert.ok(events.some((event) => event.type === 'FRAME_DISCOVERED' && event.protocolFrameId === 'proto-root'));
  assert.ok(events.some((event) => event.type === 'GAS_TARGET_DISCOVERED' && event.targetId === 'native-target'));
  assert.ok(events.some((event) => event.type === 'GAS_SESSION_DISCOVERED' && event.sessionId === 'native-session'));
  assert.ok(events.some((event) => event.type === 'GAS_EXECUTION_CONTEXT_DISCOVERED' && event.executionContextId === 89));
  assert.ok(events.some((event) => event.type === 'GENERIC_GAS_RUNTIME_CONTEXT_MATCHED' && event.executionContextId === 88));
  assert.ok(events.every((event) => event.runId === 'RUN-NORMALIZE-1'));
});

test('emits proven frame/context mappings and leaves unsupported identities explicitly unmapped', () => {
  const timeline = new Timeline({ runId: 'RUN-MAPPING-1' });
  const mappings = mapCrossLayerIdentities(browser.contexts[0].pages, gas);
  emitMappingEvidence(timeline, mappings);
  const events = timeline.snapshot();
  assert.ok(events.some((event) => event.type === 'MAPPING_PROVEN' && event.data && (event.data as { mappingKind?: string }).mappingKind === 'FRAME'));
  assert.ok(events.some((event) => event.type === 'MAPPING_PROVEN' && event.executionContextId === 88));
  assert.ok(events.some((event) => event.type === 'IDENTITY_UNMAPPED' && (event.data as { identity?: string }).identity === 'PAGE-0001'));
  assert.ok(events.some((event) => event.type === 'IDENTITY_UNMAPPED' && (event.data as { identity?: string }).identity === '89'));
  assert.ok(events.every((event) => event.runId === 'RUN-MAPPING-1'));
});

test('redacts URL query values in timeline evidence', () => {
  const timeline = new Timeline();
  emitBrowserDiscovery(timeline, {
    ...browser,
    contexts: [{ ...browser.contexts[0], pages: [{ ...browser.contexts[0].pages[0], url: `${browser.contexts[0].pages[0].url}?tenant=private&token=secret` }] }]
  }, redactGasSecrets);
  const page = timeline.snapshot().find((event) => event.type === 'PAGE_DISCOVERED');
  assert.ok(page?.url);
  const url = new URL(page.url);
  assert.equal(url.pathname, '/macros/s/[REDACTED]/exec');
  assert.equal(url.searchParams.get('tenant'), '[REDACTED]');
  assert.equal(url.searchParams.get('token'), '[REDACTED]');
});
