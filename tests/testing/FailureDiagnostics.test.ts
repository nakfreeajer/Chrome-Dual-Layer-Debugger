import assert from 'node:assert/strict';
import test from 'node:test';
import type { Frame, Page } from 'playwright';
import { captureFailureDiagnostics, isLoopbackHttpUrl, FAILURE_DIAGNOSTIC_DEADLINE_MS, FAILURE_SCREENSHOT_MAX_BYTES } from '../../src/testing/FailureDiagnostics.js';

test('synthetic detail eligibility is limited to HTTP loopback hosts', () => {
  for (const url of ['http://localhost/a', 'http://127.0.0.1/a', 'http://[::1]/a', 'https://localhost/a']) assert.equal(isLoopbackHttpUrl(url), true);
  for (const url of ['https://example.com/a', 'file://localhost/a', 'http://127.0.0.2/a', 'http://user@localhost/a']) assert.equal(isLoopbackHttpUrl(url), false);
  assert.equal(FAILURE_DIAGNOSTIC_DEADLINE_MS, 5000);
  assert.equal(FAILURE_SCREENSHOT_MAX_BYTES, 2 * 1024 * 1024);
});

test('diagnostics keep DOM structural, hash selector/origin, and omit oversized screenshot', async () => {
  const page = {
    locator() { return { first() { return this; }, async evaluate() { return { exists: true, tagName: 'p', visible: true, disabled: false, checked: false, selected: false, textLength: 11, valueLength: 0, boundingBox: { present: true, width: 10, height: 5 } }; } }; },
    async evaluate() { return 'complete'; }, isClosed() { return false; }, frames() { return [this]; }, url() { return 'http://localhost:1234/path?private=yes'; },
    async screenshot() { return Buffer.alloc(FAILURE_SCREENSHOT_MAX_BYTES + 1); }
  } as unknown as Page;
  const result = await captureFailureDiagnostics({ page, scope: page, selector: '#private-selector', authorizedPageOrigin: 'http://localhost:1234', authorizedScopeOrigin: 'http://localhost:1234', syntheticDetails: true, assertTargetEnvelope: async () => {} });
  assert.equal(result.dom.status, 'CAPTURED');
  assert.equal(result.dom.tagName, 'p');
  assert.equal(result.dom.selector, '#private-selector');
  assert.equal(result.runtime.readyState, 'complete');
  assert.equal((result.runtime.pageOrigin as Record<string, unknown>).equalsAuthorized, true);
  assert.equal(result.screenshot.status, 'TOO_LARGE');
  assert.equal('bytes' in result.screenshot, false);
  await assert.rejects(captureFailureDiagnostics({ page, scope: page, authorizedPageOrigin: 'http://localhost:1234', authorizedScopeOrigin: 'http://localhost:1234', syntheticDetails: false, assertTargetEnvelope: async () => {}, deadlineMs: FAILURE_DIAGNOSTIC_DEADLINE_MS + 1 }), /deadline/);
  const defaultMode = await captureFailureDiagnostics({ page, scope: page, selector: '#private-selector', authorizedPageOrigin: 'http://localhost:1234', authorizedScopeOrigin: 'http://localhost:1234', syntheticDetails: false, assertTargetEnvelope: async () => {} });
  assert.equal(defaultMode.dom.selector, undefined);
  assert.equal(defaultMode.screenshot.status, 'NOT_REQUESTED');
  assert.equal(JSON.stringify(defaultMode).includes('private=yes'), false);
});

test('diagnostic timeout does not retry a stalled component or start later components', async () => {
  let releaseStalledDom!: (value: Record<string, unknown>) => void;
  let domCalls = 0;
  let runtimeCalls = 0;
  let screenshotCalls = 0;
  const stalledDom = new Promise<Record<string, unknown>>((resolve) => { releaseStalledDom = resolve; });
  const page = {
    locator() { return { first() { return this; }, evaluate() { domCalls += 1; return stalledDom; } }; },
    async evaluate() { runtimeCalls += 1; return 'complete'; }, isClosed() { return false; }, frames() { return [this]; }, url() { return 'http://localhost:1234/'; },
    async screenshot() { screenshotCalls += 1; return Buffer.from('synthetic'); }
  } as unknown as Page;

  const result = await captureFailureDiagnostics({ page, scope: page, selector: '#synthetic', authorizedPageOrigin: 'http://localhost:1234', authorizedScopeOrigin: 'http://localhost:1234', syntheticDetails: true, assertTargetEnvelope: async () => {}, deadlineMs: 20 });
  assert.equal(result.dom.status, 'TIMEOUT');
  assert.equal(result.runtime.status, 'TIMEOUT');
  assert.equal(result.screenshot.status, 'TIMEOUT');
  assert.equal(domCalls, 1, 'the stalled primitive must not be retried');
  assert.equal(runtimeCalls, 0);
  assert.equal(screenshotCalls, 0);

  releaseStalledDom({ exists: true, tagName: 'p', visible: true, disabled: false, checked: false, selected: false, textLength: 0, valueLength: 0, boundingBox: { present: false, width: 0, height: 0 } });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(runtimeCalls, 0, 'runtime evaluation must not start after the deadline');
  assert.equal(screenshotCalls, 0, 'screenshot capture must not start after the deadline');
});

test('an unsafe PAGE or FRAME envelope omits diagnostics before any page-content access', async () => {
  for (const unsafe of ['page-origin', 'closed-page', 'detached-frame', 'frame-origin'] as const) {
    let locatorCalls = 0, domCalls = 0, runtimeCalls = 0, screenshotCalls = 0;
    const frame = {
      url: () => unsafe === 'frame-origin' ? 'http://127.0.0.2/child' : 'http://localhost/child',
      locator() { locatorCalls++; return { first() { return this; }, async evaluate() { domCalls++; return {}; } }; },
      async evaluate() { runtimeCalls++; return 'complete'; }
    } as unknown as Frame;
    const page = {
      url: () => unsafe === 'page-origin' ? 'http://127.0.0.2/outer' : 'http://127.0.0.1/outer',
      isClosed: () => unsafe === 'closed-page', frames: () => unsafe === 'detached-frame' ? [] : [frame],
      locator() { locatorCalls++; return { first() { return this; }, async evaluate() { domCalls++; return {}; } }; },
      async evaluate() { runtimeCalls++; return 'complete'; },
      async screenshot() { screenshotCalls++; return Buffer.from('synthetic'); }
    } as unknown as Page;
    const scope = unsafe === 'frame-origin' || unsafe === 'detached-frame' ? frame : page;
    const result = await captureFailureDiagnostics({ page, scope, selector: '#synthetic', authorizedPageOrigin: 'http://127.0.0.1', authorizedScopeOrigin: 'http://localhost', syntheticDetails: true,
      assertTargetEnvelope: async () => { throw new Error('TARGET_ENVELOPE_VIOLATION'); } });
    assert.equal(result.dom.status, 'OMITTED_TARGET_ENVELOPE', unsafe);
    assert.equal(result.runtime.status, 'OMITTED_TARGET_ENVELOPE', unsafe);
    assert.equal(result.runtime.envelopeSafe, false, unsafe);
    assert.equal(result.runtime.targetContentEvaluation, 'NOT_RUN', unsafe);
    assert.equal(result.runtime.pageClosed, unsafe === 'closed-page', unsafe);
    if (scope !== page) assert.equal(result.runtime.frameAttached, unsafe !== 'detached-frame', unsafe);
    assert.equal(result.screenshot.status, 'OMITTED_TARGET_ENVELOPE', unsafe);
    assert.deepEqual({ locatorCalls, domCalls, runtimeCalls, screenshotCalls }, { locatorCalls: 0, domCalls: 0, runtimeCalls: 0, screenshotCalls: 0 }, unsafe);
  }
});

test('envelope failure after DOM preserves DOM evidence and omits runtime and screenshot', async () => {
  let guardCalls = 0, runtimeCalls = 0, screenshotCalls = 0;
  const page = {
    locator() { return { first() { return this; }, async evaluate() { return { exists: true, tagName: 'p', visible: true, disabled: false, checked: false, selected: false, textLength: 0, valueLength: 0, boundingBox: { present: false, width: 0, height: 0 } }; } }; },
    async evaluate() { runtimeCalls++; return 'complete'; }, isClosed() { return false; }, frames() { return [this]; }, url() { return 'http://localhost:1234/'; },
    async screenshot() { screenshotCalls++; return Buffer.from('synthetic'); }
  } as unknown as Page;
  const result = await captureFailureDiagnostics({ page, scope: page, selector: '#safe', authorizedPageOrigin: 'http://localhost:1234', authorizedScopeOrigin: 'http://localhost:1234', syntheticDetails: true,
    assertTargetEnvelope: async () => { guardCalls++; if (guardCalls === 2) throw new Error('TARGET_ENVELOPE_VIOLATION'); } });
  assert.equal(guardCalls, 2);
  assert.equal(result.dom.status, 'CAPTURED');
  assert.equal(result.runtime.status, 'OMITTED_TARGET_ENVELOPE');
  assert.equal(result.screenshot.status, 'OMITTED_TARGET_ENVELOPE');
  assert.equal(runtimeCalls, 0);
  assert.equal(screenshotCalls, 0);
});

test('envelope failure after runtime preserves prior evidence and omits screenshot', async () => {
  let guardCalls = 0, domCalls = 0, runtimeCalls = 0, screenshotCalls = 0;
  const page = {
    locator() { return { first() { return this; }, async evaluate() { domCalls++; return { exists: true, tagName: 'p', visible: true, disabled: false, checked: false, selected: false, textLength: 0, valueLength: 0, boundingBox: { present: false, width: 0, height: 0 } }; } }; },
    async evaluate() { runtimeCalls++; return 'complete'; }, isClosed() { return false; }, frames() { return [this]; }, url() { return 'http://localhost:1234/'; },
    async screenshot() { screenshotCalls++; return Buffer.from('synthetic'); }
  } as unknown as Page;
  const result = await captureFailureDiagnostics({ page, scope: page, selector: '#safe', authorizedPageOrigin: 'http://localhost:1234', authorizedScopeOrigin: 'http://localhost:1234', syntheticDetails: true,
    assertTargetEnvelope: async () => { guardCalls++; if (guardCalls === 3) throw new Error('TARGET_ENVELOPE_VIOLATION'); } });
  assert.equal(guardCalls, 3);
  assert.equal(result.dom.status, 'CAPTURED');
  assert.equal(result.runtime.status, 'CAPTURED');
  assert.equal(result.screenshot.status, 'OMITTED_TARGET_ENVELOPE');
  assert.equal(domCalls, 1);
  assert.equal(runtimeCalls, 1);
  assert.equal(screenshotCalls, 0);
});
