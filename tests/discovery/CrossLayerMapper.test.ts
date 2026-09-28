import assert from 'node:assert/strict';
import test from 'node:test';
import { mapCrossLayerIdentities } from '../../src/core/CrossLayerMapper.js';
import type { DiscoveredPage } from '../../src/browser/BrowserDiscovery.js';
import type { GasDiscoveryResult } from '../../src/gas/GasAdapter.js';

const page = {
  pageId: 'PAGE-0001', contextId: 'CONTEXT-0001', url: 'https://script.google.com/macros/s/x/exec',
  mode: 'BROWSER_PLUS_GAS', executionContextIds: [],
  frames: [{ frameId: 'FRAME-0001', protocolFrameId: 'protocol-frame-1', url: 'https://script.google.com/macros/s/x/exec', children: [] }]
} satisfies DiscoveredPage;

function gas(frameId: string, contextFrameId = frameId): GasDiscoveryResult {
  return {
    active: true, profileName: 'generic-gas', selectedTargetId: 'target-native', attachedSessionId: 'session-native',
    attachedTargets: [{ targetId: 'target-native', sessionId: 'session-native' }],
    profileTargetCandidates: [], skippedAmbiguousProfileTargets: false,
    targets: [{ targetId: 'target-native', type: 'page', url: page.url }],
    sessions: [{ sessionId: 'session-native', targetId: 'target-native', parentSessionId: '', detached: false }],
    frames: [{ frameId, sessionId: 'session-native', targetId: 'target-native', parentFrameId: '' }],
    contexts: [{ targetId: 'target-native', sessionId: 'session-native', executionContextId: 91, frameId: contextFrameId, origin: '', name: '', defaultWorld: true, ignored: false, alive: true }]
  };
}

test('maps exact shared protocol FrameId evidence and linked execution context', () => {
  const result = mapCrossLayerIdentities([page], gas('protocol-frame-1'));
  assert.equal(result.provenFrames[0].gasFrameId, 'protocol-frame-1');
  assert.equal(result.provenFrames[0].playwrightFrameId, 'FRAME-0001');
  assert.equal(result.provenContexts[0].executionContextId, 91);
  assert.deepEqual(result.unmappedPlaywrightPageIds, ['PAGE-0001']);
});

test('uses dependency execution-context frame metadata when no frame-registry event is present', () => {
  const result = mapCrossLayerIdentities([page], {
    ...gas('unused'),
    frames: [],
    contexts: [{ targetId: 'target-native', sessionId: 'session-native', executionContextId: 92, frameId: 'protocol-frame-1', origin: '', name: '', defaultWorld: true, ignored: false, alive: true }]
  });
  assert.equal(result.provenFrames[0].evidence, 'dependency-context-frameId');
  assert.equal(result.provenFrames[0].gasFrameId, 'protocol-frame-1');
  assert.equal(result.provenContexts[0].executionContextId, 92);
  assert.deepEqual(result.unmappedPlaywrightFrameIds, []);
});

test('leaves unsupported frame and execution-context relationships unmapped', () => {
  const result = mapCrossLayerIdentities([page], gas('unrelated-frame', 'another-frame'));
  assert.deepEqual(result.provenFrames, []);
  assert.deepEqual(result.provenContexts, []);
  assert.deepEqual(result.unmappedPlaywrightFrameIds, ['FRAME-0001']);
  assert.deepEqual(result.unmappedGasFrameIds, ['unrelated-frame']);
  assert.deepEqual(result.unmappedGasContextIds, [91]);
  assert.deepEqual(result.unmappedPlaywrightPageIds, ['PAGE-0001']);
});
