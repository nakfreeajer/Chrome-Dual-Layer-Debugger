import assert from 'node:assert/strict';
import test from 'node:test';
import { TestPageSession } from '../../src/testing/TestPageSession.js';
import { parseSmokeScenario } from '../../src/testing/SmokeScenarioParser.js';
import { PlaywrightBrowserDiscovery } from '../../src/browser/PlaywrightBrowserDiscovery.js';
import type { GasAdapter } from '../../src/gas/GasAdapter.js';
import type { Page, Frame } from 'playwright';
import { SessionIds } from '../../src/core/SessionIds.js';

function scenario(kind: 'PAGE' | 'FRAME' = 'PAGE') {
  return parseSmokeScenario({ schemaVersion: 1, scenarioId: 'session-fixture', target: {
    pageUrl: 'http://127.0.0.1/outer', scope: kind === 'PAGE' ? { kind } : { kind, url: 'http://localhost/child' }
  }, steps: [{ stepId: 'ready', kind: 'action', operation: 'ready' }] });
}

function setup() {
  const events: string[] = [];
  const fakeFrame = { url: () => 'http://localhost/child', async waitForLoadState(state: string) { events.push(`frame:${state}`); } } as unknown as Frame;
  const ownedPage = { frames: () => [{ url: () => 'http://127.0.0.1/outer' }, fakeFrame], isClosed: () => false, async close() { events.push('owned:close'); } } as unknown as Page;
  const existingPage = { isClosed: () => false, async close() { events.push('existing:close'); } } as unknown as Page;
  const discovered = { pageId: 'PAGE-0001', contextId: 'CONTEXT-0001', url: 'http://127.0.0.1/outer', mode: 'BROWSER_ONLY', frames: [
    { frameId: 'FRAME-0001', protocolFrameId: 'p1', url: 'http://127.0.0.1/outer', children: [] },
    { frameId: 'FRAME-0002', protocolFrameId: 'p2', url: 'http://localhost/child', children: [] }
  ], executionContextIds: [] };
  const discovery = {
    async createRunnerOwnedPage(_url: string, intent: { mode: string; fixtureId: string; approvalReference: string }) {
      events.push(`create:owned:${intent.mode}`);
      return { page: ownedPage, pageId: 'PAGE-0001', discovered };
    },
    async selectRunnerOwnedFrame(_page: Page, url: string) {
      events.push(`select:${url}`);
      await fakeFrame.waitForLoadState('load');
      return { frame: fakeFrame, frameId: 'FRAME-0002' };
    },
    async closeRunnerOwnedPage(page: Page) { events.push(page === ownedPage ? 'owned:close' : 'existing:close'); },
    async disconnect() { events.push('playwright:disconnect'); }
  } as unknown as PlaywrightBrowserDiscovery;
  const gasCalls: Array<{ endpoint: string; targetId: string; fixtureId: string }> = [];
  const gas = {
    async connectTestTarget(endpoint: string, authorization: { targetId: string; fixtureId: string }) {
      gasCalls.push({ endpoint, targetId: authorization.targetId, fixtureId: authorization.fixtureId });
      events.push('gas:attach');
      return [{ targetId: authorization.targetId, sessionId: 'SESSION-1', executionContextId: 31, frameId: 'F-1', defaultWorld: true }];
    },
    async disconnect() { events.push('gas:disconnect'); }
  } as unknown as GasAdapter;
  return { events, fakeFrame, ownedPage, existingPage, discovery, gas, gasCalls };
}

test('PLAYWRIGHT binds to the runner-owned page and never selects or closes an existing page', async () => {
  const f = setup();
  const session = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario(), discovery: f.discovery, gasAdapter: f.gas });
  assert.equal(session.selectedScope, f.ownedPage);
  assert.equal(session.backend.targetId, 'PAGE-0001');
  assert.equal(session.authorization.targetId, 'PAGE-0001');
  await session.close();
  await session.close();
  assert.equal(f.events.filter((item) => item === 'owned:close').length, 1);
  assert.equal(f.events.includes('existing:close'), false);
  assert.ok(f.events.includes('playwright:disconnect'));
});

test('PLAYWRIGHT binds FRAME scope to the one exact URL match', async () => {
  const f = setup();
  const session = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario('FRAME'), discovery: f.discovery, gasAdapter: f.gas });
  assert.equal(session.selectedScope, f.fakeFrame);
  assert.equal(session.authorization.targetId, 'FRAME-0002');
  assert.equal(session.backend.targetId, 'FRAME-0002');
  assert.ok(f.events.includes('frame:load'));
  await session.close();
});

test('PLAYWRIGHT accepts one exact public OOPIF Frame even when the page frame tree has no protocol FrameId for it', async () => {
  const f = setup();
  const withoutRemoteFrame = { ...f.discovery } as unknown as PlaywrightBrowserDiscovery;
  (withoutRemoteFrame as unknown as { selectRunnerOwnedFrame: () => { frame: Frame; frameId: string } }).selectRunnerOwnedFrame = () => ({ frame: f.fakeFrame, frameId: 'PLAYWRIGHT-FRAME-0001' });
  const session = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario('FRAME'), discovery: withoutRemoteFrame, gasAdapter: f.gas });
  assert.equal(session.selectedScope, f.fakeFrame);
  assert.equal(session.authorization.targetId, 'PLAYWRIGHT-FRAME-0001');
  await session.close();
});

test('missing, malformed and unsupported TEST authorization preconditions fail before page creation', async () => {
  for (const approvalReference of [undefined, '', '   ', 'bad\0reference', 'x'.repeat(513)]) {
    const f = setup();
    await assert.rejects(TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: approvalReference as string, scenario: scenario(), discovery: f.discovery, gasAdapter: f.gas }), /TEST approval reference/);
    assert.equal(f.events.some((item) => item.startsWith('create:owned')), false);
    assert.equal(f.events.some((item) => item === 'owned:close'), false);
    assert.equal(f.events.includes('gas:attach'), false);
  }
  const f = setup();
  await assert.rejects(TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'INVALID' as 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario(), discovery: f.discovery, gasAdapter: f.gas }), /supported TEST backend/);
  assert.equal(f.events.some((item) => item.startsWith('create:owned')), false);
});

test('public runner-page creation requires TEST intent before connecting or navigating', async () => {
  const discovery = new PlaywrightBrowserDiscovery('http://127.0.0.1:1');
  const create = discovery.createRunnerOwnedPage.bind(discovery) as (url: string, intent?: unknown) => Promise<unknown>;
  await assert.rejects(create('https://example.invalid/', undefined), /TEST authorization intent/);
  await assert.rejects(create('https://example.invalid/', { mode: 'OBSERVE', fixtureId: 'fixture', approvalReference: 'approval' }), /TEST authorization intent/);
});

test('exact frame identity preserves normalized IDs and assigns stable local OOPIF IDs without inventing protocol IDs', async () => {
  const discovery = Object.create(PlaywrightBrowserDiscovery.prototype) as PlaywrightBrowserDiscovery;
  const pageFrame = { url: () => 'http://127.0.0.1/outer', async waitForLoadState() {} } as unknown as Frame;
  const normalizedFrame = { url: () => 'http://localhost/child', async waitForLoadState() {} } as unknown as Frame;
  const remoteOnlyFrame = { url: () => 'http://localhost/remote-child', async waitForLoadState() {} } as unknown as Frame;
  const page = { frames: () => [pageFrame, normalizedFrame, remoteOnlyFrame] } as unknown as Page;
  const state = discovery as unknown as { runnerOwnedPages: Set<Page>; playwrightFrameIds: WeakMap<Frame, string>; nextPlaywrightFrameId: number; sessions: Map<Page, unknown>; executionContextIds: Map<Page, Set<number>>; ids: SessionIds };
  state.runnerOwnedPages = new Set([page]);
  state.playwrightFrameIds = new WeakMap();
  state.nextPlaywrightFrameId = 0;
  state.sessions = new Map();
  state.executionContextIds = new Map();
  state.ids = new SessionIds();
  const discovered = { frames: [
    { frameId: 'FRAME-0001', protocolFrameId: 'native-frame-1', url: 'http://127.0.0.1/outer', children: [] },
    { frameId: 'FRAME-0002', protocolFrameId: 'native-frame-2', url: 'http://localhost/child', children: [] }
  ] } as never;
  const native = await discovery.selectRunnerOwnedFrame(page, 'http://localhost/child', discovered);
  assert.equal(native.frame, normalizedFrame);
  assert.equal(native.frameId, 'FRAME-0002');
  const local = await discovery.selectRunnerOwnedFrame(page, 'http://localhost/remote-child', discovered);
  assert.equal(local.frame, remoteOnlyFrame);
  assert.equal(local.frameId, 'PLAYWRIGHT-FRAME-0001');
  assert.equal((await discovery.selectRunnerOwnedFrame(page, 'http://localhost/remote-child', discovered)).frameId, local.frameId);
  assert.notEqual(local.frameId, 'PAGE-0001');
  assert.notEqual(local.frameId, 'FRAME-0001');
  const secondFrame = { url: () => 'http://localhost/another-remote-child', async waitForLoadState() {} } as unknown as Frame;
  const pageWithSecondFrame = { frames: () => [pageFrame, remoteOnlyFrame, secondFrame] } as unknown as Page;
  state.runnerOwnedPages.add(pageWithSecondFrame);
  assert.equal((await discovery.selectRunnerOwnedFrame(pageWithSecondFrame, 'http://localhost/another-remote-child', discovered)).frameId, 'PLAYWRIGHT-FRAME-0002');
  await discovery.disconnect();
  assert.equal(state.nextPlaywrightFrameId, 0);
  assert.equal(state.runnerOwnedPages.size, 0);
  state.runnerOwnedPages.add(page);
  assert.equal((await discovery.selectRunnerOwnedFrame(page, 'http://localhost/remote-child', discovered)).frameId, 'PLAYWRIGHT-FRAME-0001');
});

test('GAS_OOPIF binds to exact native iframe target and execution context', async () => {
  const f = setup();
  const session = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'GAS_OOPIF', approvalReference: 'approved', scenario: scenario('FRAME'), discovery: f.discovery, gasAdapter: f.gas,
    async fetchTargets(url) { assert.equal(url, 'http://127.0.0.1:9444/json/list'); return [{ id: 'native-iframe-1', type: 'iframe', url: 'http://localhost/child' }]; }
  });
  assert.equal(session.backend.backend, 'GAS_OOPIF');
  assert.equal(session.backend.targetId, 'native-iframe-1');
  assert.deepEqual(f.gasCalls, [{ endpoint: 'http://127.0.0.1:9444', targetId: 'native-iframe-1', fixtureId: 'session-fixture' }]);
  await session.close();
  assert.ok(f.events.includes('gas:disconnect'));
});

test('GAS_OOPIF fails closed for missing or ambiguous exact target and closes only its page', async () => {
  for (const targets of [[], [
    { id: 'one', type: 'page', url: 'http://127.0.0.1/outer' },
    { id: 'two', type: 'page', url: 'http://127.0.0.1/outer' }
  ]]) {
    const f = setup();
    await assert.rejects(TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'GAS_OOPIF', approvalReference: 'approved', scenario: scenario(), discovery: f.discovery, gasAdapter: f.gas,
      async fetchTargets() { return targets; }
    }), /not found|ambiguous/);
    assert.ok(f.events.includes('owned:close'));
    assert.equal(f.events.includes('existing:close'), false);
    assert.ok(f.events.includes('playwright:disconnect'));
  }
});

test('GAS_OOPIF rejects ambiguous default contexts and detaches on session cleanup', async () => {
  const f = setup();
  const gas = { ...f.gas, async connectTestTarget(_endpoint: string, auth: { targetId: string }) { return [
    { targetId: auth.targetId, sessionId: 's1', executionContextId: 1, frameId: 'f1', defaultWorld: true },
    { targetId: auth.targetId, sessionId: 's1', executionContextId: 2, frameId: 'f2', defaultWorld: true }
  ]; } } as unknown as GasAdapter;
  await assert.rejects(TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'GAS_OOPIF', approvalReference: 'approved', scenario: scenario(), discovery: f.discovery, gasAdapter: gas,
    async fetchTargets() { return [{ id: 'page-native', type: 'page', url: 'http://127.0.0.1/outer' }]; }
  }), /ambiguous default execution context/);
  assert.ok(f.events.includes('owned:close'));
  assert.ok(f.events.includes('playwright:disconnect'));
});
