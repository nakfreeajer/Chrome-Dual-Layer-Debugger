import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDiscoveredPage, normalizeFrameTree } from '../../src/browser/PlaywrightBrowserDiscovery.js';
import { SessionIds } from '../../src/core/SessionIds.js';

test('normalizes a protocol frame tree with session-local frame IDs', () => {
  const result = normalizeFrameTree({
    frame: { id: 'cdp-main', url: 'https://example.test/', name: '' },
    childFrames: [{ frame: { id: 'cdp-child', url: 'https://frame.test/', name: 'child' } }]
  }, new SessionIds());
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
  const frames = normalizeFrameTree({ frame: { id: 'cdp-main', url: 'https://example.test/' } }, ids);
  assert.deepEqual(normalizeDiscoveredPage({
    contextId: 'CONTEXT-0001',
    url: 'https://example.com/?next=https://script.google.com/macros/',
    title: 'Example',
    frames,
    executionContextIds: [17]
  }, ids), {
    pageId: 'PAGE-0001',
    contextId: 'CONTEXT-0001',
    url: 'https://example.com/?next=https://script.google.com/macros/',
    title: 'Example',
    mode: 'BROWSER_ONLY',
    frames: [{ frameId: 'FRAME-0001', protocolFrameId: 'cdp-main', url: 'https://example.test/', children: [] }],
    executionContextIds: [17]
  });
});
