import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDiscoveredPage, normalizeFrameTree } from '../../src/browser/PlaywrightBrowserDiscovery.js';
import { SessionIds } from '../../src/core/SessionIds.js';

test('normalizes a protocol frame tree with session-local frame IDs', () => {
  const ids = new SessionIds();
  const tree = {
    frame: { id: 'cdp-main', url: 'https://example.test/', name: '' },
    childFrames: [{ frame: { id: 'cdp-child', url: 'https://frame.test/', name: 'child' } }]
  };
  const result = normalizeFrameTree(tree, ids);
  const repeated = normalizeFrameTree(tree, ids);
  const nextFrame = normalizeFrameTree({ frame: { id: 'cdp-new', url: 'https://new.test/' } }, ids);
  assert.deepEqual(repeated, result);
  assert.equal(nextFrame[0].frameId, 'FRAME-0003');
  assert.deepEqual(result, [{
    frameId: 'FRAME-0001',
    protocolFrameId: 'cdp-main',
    url: 'https://example.test/',
    children: [{
      frameId: 'FRAME-0002',
      protocolFrameId: 'cdp-child',
      url: 'https://frame.test/',
      name: 'child',
      children: []
    }]
  }]);
});

test('normalizes a discovered page and applies URL-prefix layer classification', () => {
  const ids = new SessionIds();
  const contextIdentity = {};
  const pageIdentity = {};
  const frames = normalizeFrameTree({ frame: { id: 'cdp-main', url: 'https://example.test/' } }, ids);
  const input = {
    url: 'https://example.com/?next=https://script.google.com/macros/',
    title: 'Example',
    frames,
    executionContextIds: [17]
  };
  const first = normalizeDiscoveredPage(input, ids, contextIdentity, pageIdentity);
  const repeated = normalizeDiscoveredPage(input, ids, contextIdentity, pageIdentity);
  assert.deepEqual(repeated, first);
  assert.deepEqual(first, {
    pageId: 'PAGE-0001',
    contextId: 'CONTEXT-0001',
    url: 'https://example.com/?next=https://script.google.com/macros/',
    title: 'Example',
    mode: 'BROWSER_ONLY',
    frames: [{ frameId: 'FRAME-0001', protocolFrameId: 'cdp-main', url: 'https://example.test/', children: [] }],
    executionContextIds: [17]
  });
});
