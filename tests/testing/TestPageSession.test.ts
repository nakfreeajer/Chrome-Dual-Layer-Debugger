import assert from 'node:assert/strict';
import test from 'node:test';
import { TestPageSession } from '../../src/testing/TestPageSession.js';
import { parseSmokeScenario } from '../../src/testing/SmokeScenarioParser.js';
import { PlaywrightBrowserDiscovery, type RunnerOwnedPageReceipt } from '../../src/browser/PlaywrightBrowserDiscovery.js';
import type { GasAdapter } from '../../src/gas/GasAdapter.js';
import type { Page, Frame } from 'playwright';
import { SessionIds } from '../../src/core/SessionIds.js';
import { fixtureRuntimeIdentitySha256, type FixtureLifecycleEvidence, type FixtureLifecycleJournal, type FixtureRuntimeTargetIdentity, type SyntheticFixtureDriver, type SyntheticFixtureLease } from '../../src/testing/FixtureLifecycle.js';

function scenario(kind: 'PAGE' | 'FRAME' = 'PAGE') {
  return parseSmokeScenario({ schemaVersion: 1, scenarioId: 'session-fixture', target: {
    pageUrl: 'http://127.0.0.1/outer', scope: kind === 'PAGE' ? { kind } : { kind, url: 'http://localhost/child' }
  }, steps: [{ stepId: 'ready', kind: 'action', operation: 'ready' }] });
}

function setup() {
  const events: string[] = [];
  const fakeFrame = { url: () => 'http://localhost/child', async waitForLoadState(state: string) { events.push(`frame:${state}`); } } as unknown as Frame;
  const mainFrame = { url: () => 'http://127.0.0.1/outer' } as unknown as Frame;
  const pageHandlers = new Map<string, Set<(event: any) => void>>();
  const ownedPage = { url: () => 'http://127.0.0.1/outer', mainFrame: () => mainFrame, frames: () => [mainFrame, fakeFrame], isClosed: () => false,
    on(event: string, handler: (event: any) => void) { const handlers = pageHandlers.get(event) ?? new Set(); handlers.add(handler); pageHandlers.set(event, handlers); },
    off(event: string, handler: (event: any) => void) { pageHandlers.get(event)?.delete(handler); },
    async close() { events.push('owned:close'); } } as unknown as Page;
  const existingPage = { isClosed: () => false, async close() { events.push('existing:close'); } } as unknown as Page;
  const discovered = { pageId: 'PAGE-0001', contextId: 'CONTEXT-0001', url: 'http://127.0.0.1/outer', mode: 'BROWSER_ONLY', frames: [
    { frameId: 'FRAME-0001', protocolFrameId: 'p1', url: 'http://127.0.0.1/outer', children: [] },
    { frameId: 'FRAME-0002', protocolFrameId: 'p2', url: 'http://localhost/child', children: [] }
  ], executionContextIds: [] };
  const ownerReceipt = Object.freeze({}) as RunnerOwnedPageReceipt;
  const discovery = Object.create(PlaywrightBrowserDiscovery.prototype) as PlaywrightBrowserDiscovery;
  const ownerContext = { pages: () => [ownedPage] } as unknown as import('playwright').BrowserContext;
  const discoveryState = discovery as unknown as {
    browser: import('playwright').Browser;
    ids: { forContext(value: object): string; forPage(value: object): string };
    runnerOwnedPages: Set<Page>;
    runnerOwnedPageReceipts: Map<RunnerOwnedPageReceipt, { leaseId: string; page: Page; context: import('playwright').BrowserContext; contextId: string; pageId: string }>;
    runnerOwnedFixtureLeases: Set<string>;
  };
  discoveryState.browser = { contexts: () => [ownerContext] } as unknown as import('playwright').Browser;
  discoveryState.ids = { forContext: () => 'CONTEXT-0001', forPage: () => 'PAGE-0001' };
  discoveryState.runnerOwnedPages = new Set([ownedPage]);
  discoveryState.runnerOwnedPageReceipts = new Map([[ownerReceipt, { leaseId: 'lease-1', page: ownedPage, context: ownerContext,
    contextId: 'CONTEXT-0001', pageId: 'PAGE-0001' }]]);
  discoveryState.runnerOwnedFixtureLeases = new Set(['lease-1']);
  Object.assign(discovery, {
    async createRunnerOwnedPage(_url: string, intent: { mode: string; fixtureId: string; approvalReference: string }, leaseId?: string) {
      events.push(`create:owned:${intent.mode}`);
      return { page: ownedPage, pageId: 'PAGE-0001', discovered, ...(leaseId ? { ownerReceipt } : {}) };
    },
    async selectRunnerOwnedFrame(_page: Page, url: string) {
      events.push(`select:${url}`);
      await fakeFrame.waitForLoadState('load');
      return { frame: fakeFrame, frameId: 'FRAME-0002' };
    },
    async closeRunnerOwnedPage(page: Page) { events.push(page === ownedPage ? 'owned:close' : 'existing:close'); },
    async disconnect() { events.push('playwright:disconnect'); }
  });
  const consumeOwnerReceipt = discovery.consumeRunnerOwnedPageReceipt.bind(discovery);
  (discovery as unknown as { consumeRunnerOwnedPageReceipt: (...args: Parameters<typeof consumeOwnerReceipt>) => ReturnType<typeof consumeOwnerReceipt> })
    .consumeRunnerOwnedPageReceipt = (...args) => {
      const proof = consumeOwnerReceipt(...args);
      events.push(proof ? 'owner:receipt-verified' : 'owner:receipt-rejected');
      return proof;
    };
  const gasCalls: Array<{ endpoint: string; targetId: string; fixtureId: string }> = [];
  const gas = {
    async connectTestTarget(endpoint: string, authorization: { targetId: string; fixtureId: string }) {
      gasCalls.push({ endpoint, targetId: authorization.targetId, fixtureId: authorization.fixtureId });
      events.push('gas:attach');
      return [{ targetId: authorization.targetId, sessionId: 'SESSION-1', executionContextId: 31, frameId: 'F-1', defaultWorld: true }];
    },
    async disconnect() { events.push('gas:disconnect'); }
  } as unknown as GasAdapter;
  return { events, fakeFrame, mainFrame, pageHandlers, ownedPage, existingPage, discovery, gas, gasCalls };
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

function lifecycleDriver(f: ReturnType<typeof setup>, overrides: Partial<SyntheticFixtureDriver> = {}, expectedIdentity: FixtureRuntimeTargetIdentity =
  { backend: 'PLAYWRIGHT', scopeKind: 'PAGE', contextId: 'CONTEXT-0001', pageId: 'PAGE-0001' }): SyntheticFixtureDriver {
  const target = scenario().target;
  const lease: SyntheticFixtureLease = { schemaVersion: 1, kind: 'CDLD_SYNTHETIC_FIXTURE_LEASE', ownership: 'CDLD_SYNTHETIC',
    fixtureId: 'session-fixture', driverId: 'session-driver', leaseId: 'lease-1', target, ownedResourceIds: ['owned-fixture'] };
  return { driverId: 'session-driver', async setup() {
      assert.equal(f.events.some((item) => item.startsWith('create:owned')), false, 'fixture resource lease precedes runner page creation');
      f.events.push('fixture:setup'); return lease;
    },
    async verifyOwnership() { f.events.push('fixture:verify-ownership'); return true; }, async reset() { f.events.push('fixture:reset'); },
    async verifyReset() { f.events.push('fixture:verify-reset'); return true; },
    async attestTargetBinding(actualLease: SyntheticFixtureLease, identity: FixtureRuntimeTargetIdentity, challenge: string) {
      f.events.push('fixture:attest-target');
      const runtimeCreated = expectedIdentity.backend === 'PLAYWRIGHT' ? f.events.includes('create:owned:TEST') : f.events.includes('gas:attach');
      if (!runtimeCreated || actualLease.leaseId !== lease.leaseId || fixtureRuntimeIdentitySha256(identity) !== fixtureRuntimeIdentitySha256(expectedIdentity)) return null;
      return { schemaVersion: 1, kind: 'CDLD_FIXTURE_TARGET_ATTESTATION', driverId: 'session-driver', leaseId: actualLease.leaseId,
        challenge, attestationId: 'attestation-1', runtimeIdentitySha256: fixtureRuntimeIdentitySha256(identity) };
    },
    async teardown() { f.events.push('fixture:teardown'); },
    async verifyCleanup() { f.events.push('fixture:verify-cleanup'); return true; }, ...overrides };
}

function lifecycleJournal(): FixtureLifecycleJournal {
  return { async record(_entry: FixtureLifecycleEvidence) {}, async close() {} };
}

test('opt-in fixture lifecycle setup and reset verification precede runner-owned page creation', async () => {
  const f = setup();
  const session = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario(), discovery: f.discovery, gasAdapter: f.gas,
    fixtureLifecycle: { driver: lifecycleDriver(f), runId: 'session-run', journal: lifecycleJournal() } });
  assert.ok(f.events.indexOf('fixture:setup') < f.events.indexOf('create:owned:TEST'));
  assert.ok(f.events.indexOf('fixture:reset') < f.events.indexOf('create:owned:TEST'));
  assert.ok(f.events.indexOf('create:owned:TEST') < f.events.indexOf('fixture:attest-target'));
  assert.ok(f.events.indexOf('owner:receipt-verified') < f.events.indexOf('fixture:attest-target'));
  f.events.push('fixture:run-start'); await session.beginFixtureRun(); await session.finishFixtureRun('PASS');
  assert.ok(f.events.indexOf('fixture:attest-target') < f.events.indexOf('fixture:run-start'));
  const summary = await session.close();
  assert.equal(summary?.overallStatus, 'PASS');
  assert.ok(f.events.indexOf('owned:close') < f.events.indexOf('fixture:teardown'));
  assert.ok(f.events.includes('fixture:verify-cleanup'));
  assert.equal(f.events.includes('existing:close'), false);
});

test('setup/reset verification failure prevents page creation and closes only connected owned sessions', async () => {
  const f = setup();
  const driver = lifecycleDriver(f, { async verifyReset() { f.events.push('fixture:verify-reset'); return false; } });
  await assert.rejects(TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario(), discovery: f.discovery, gasAdapter: f.gas,
    fixtureLifecycle: { driver, runId: 'session-failed-run', journal: lifecycleJournal() } }), /TEST_FIXTURE_LIFECYCLE_OPEN_FAILED/);
  assert.equal(f.events.some((item) => item.startsWith('create:owned')), false);
  assert.equal(f.events.includes('owned:close'), false);
  assert.equal(f.events.includes('existing:close'), false);
  assert.ok(f.events.includes('gas:disconnect'));
  assert.ok(f.events.includes('playwright:disconnect'));
  assert.equal(f.events.includes('fixture:teardown'), true, 'a lease with verified ownership is cleaned after reset verification failure');
});

test('fixture lease with wrong target is rejected before page creation and foreign targets are untouched', async () => {
  const f = setup();
  const wrong = { ...scenario().target, pageUrl: 'http://127.0.0.1/other' };
  const driver = lifecycleDriver(f, { async setup() { f.events.push('fixture:setup'); return { schemaVersion: 1, kind: 'CDLD_SYNTHETIC_FIXTURE_LEASE', ownership: 'CDLD_SYNTHETIC',
    fixtureId: 'session-fixture', driverId: 'session-driver', leaseId: 'lease-1', target: wrong, ownedResourceIds: ['foreign-page'] }; } });
  await assert.rejects(TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario(), discovery: f.discovery, gasAdapter: f.gas,
    fixtureLifecycle: { driver, runId: 'session-wrong-target', journal: lifecycleJournal() } }), /TEST_FIXTURE_LIFECYCLE_OPEN_FAILED/);
  assert.equal(f.events.some((item) => item.startsWith('create:owned')), false);
  assert.equal(f.events.includes('existing:close'), false);
  assert.equal(f.events.includes('fixture:teardown'), false, 'unverified lease must never be torn down');
});

test('same URL and scope cannot make a foreign or pre-existing runtime page attestable', async () => {
  const f = setup();
  const driver = lifecycleDriver(f, { async attestTargetBinding() { f.events.push('fixture:attest-target'); return null; } });
  let caught: (Error & { fixtureLifecycle?: { targetBindingStatus: string } }) | undefined;
  try {
    await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario(), discovery: f.discovery,
      gasAdapter: f.gas, fixtureLifecycle: { driver, runId: 'session-foreign-page', journal: lifecycleJournal() } });
  } catch (error) { caught = error as Error & { fixtureLifecycle?: { targetBindingStatus: string } }; }
  assert.equal(caught?.message, 'TEST_FIXTURE_LIFECYCLE_OPEN_FAILED');
  assert.equal(caught?.fixtureLifecycle?.targetBindingStatus, 'FAILED');
  assert.ok(f.events.includes('owned:close'), 'the runner-owned page is closed during failed setup cleanup');
  assert.equal(f.events.includes('existing:close'), false);
  assert.equal(f.events.includes('fixture:run-start'), false);
});

test('missing or rejected owner receipt blocks driver attestation and closes only the runner-owned page', async () => {
  for (const mode of ['missing', 'rejected'] as const) {
    const f = setup();
    if (mode === 'missing') {
      const discovery = f.discovery as unknown as { createRunnerOwnedPage: (...args: unknown[]) => Promise<Record<string, unknown>> };
      const create = discovery.createRunnerOwnedPage.bind(f.discovery);
      discovery.createRunnerOwnedPage = async (...args) => {
        const created = await create(...args);
        delete created.ownerReceipt;
        return created;
      };
    } else {
      (f.discovery as unknown as { consumeRunnerOwnedPageReceipt: (...args: unknown[]) => null }).consumeRunnerOwnedPageReceipt = () => null;
    }
    const driver = lifecycleDriver(f, { async attestTargetBinding() { f.events.push('fixture:attest-target'); return null; } });
    let caught: (Error & { fixtureLifecycle?: { targetBindingStatus: string } }) | undefined;
    try {
      await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario(),
        discovery: f.discovery, gasAdapter: f.gas, fixtureLifecycle: { driver, runId: `receipt-${mode}`, journal: lifecycleJournal() } });
    } catch (error) { caught = error as Error & { fixtureLifecycle?: { targetBindingStatus: string } }; }
    assert.equal(caught?.message, 'TEST_FIXTURE_LIFECYCLE_OPEN_FAILED');
    assert.equal(caught?.fixtureLifecycle?.targetBindingStatus, 'FAILED');
    assert.equal(f.events.includes('fixture:attest-target'), false);
    assert.equal(f.events.includes('owned:close'), true);
    assert.equal(f.events.includes('existing:close'), false);
    assert.equal(f.events.includes('fixture:run-start'), false);
  }
});

test('fixture lifecycle explicitly rejects GAS_OOPIF and FRAME before any fixture or browser side effect', async () => {
  const f = setup();
  const driver = lifecycleDriver(f);
  await assert.rejects(TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'GAS_OOPIF', approvalReference: 'approved', scenario: scenario(),
    discovery: f.discovery, gasAdapter: f.gas, fixtureLifecycle: { driver, runId: 'gas-session-run', journal: lifecycleJournal() } }), /FIXTURE_LIFECYCLE_SCOPE_UNSUPPORTED/);
  await assert.rejects(TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario('FRAME'),
    discovery: f.discovery, gasAdapter: f.gas, fixtureLifecycle: { driver, runId: 'frame-session-run', journal: lifecycleJournal() } }), /FIXTURE_LIFECYCLE_SCOPE_UNSUPPORTED/);
  assert.equal(f.events.some((item) => item.startsWith('fixture:')), false);
  assert.equal(f.events.some((item) => item.startsWith('create:owned')), false);
  assert.equal(f.events.includes('gas:attach'), false);
});

test('target envelope guard accepts the authorized page/frame origins and rejects navigation or detached frames', async () => {
  const pageFixture = setup();
  const pageSession = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario(), discovery: pageFixture.discovery, gasAdapter: pageFixture.gas });
  await pageSession.assertTargetEnvelope();
  (pageFixture.ownedPage as unknown as { url(): string }).url = () => 'http://127.0.0.2/escaped';
  await assert.rejects(pageSession.assertTargetEnvelope(), /TARGET_ENVELOPE_VIOLATION/);
  await pageSession.close();
  assert.equal(pageFixture.pageHandlers.get('framenavigated')?.size, 0);
  assert.equal(pageFixture.pageHandlers.get('framedetached')?.size, 0);

  const frameFixture = setup();
  const frameSession = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario('FRAME'), discovery: frameFixture.discovery, gasAdapter: frameFixture.gas });
  await frameSession.assertTargetEnvelope();
  (frameFixture.fakeFrame as unknown as { url(): string }).url = () => 'http://attacker.invalid/escaped';
  await assert.rejects(frameSession.assertTargetEnvelope(), /TARGET_ENVELOPE_VIOLATION/);
  await frameSession.close();
});

test('failure diagnostics use the session envelope guard and never inspect an already-violated PAGE or FRAME', async () => {
  for (const scopeKind of ['PAGE', 'FRAME'] as const) {
    const f = setup();
    const session = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario(scopeKind), discovery: f.discovery, gasAdapter: f.gas });
    let locatorCalls = 0, runtimeCalls = 0, screenshotCalls = 0;
    const guardedPage = f.ownedPage as unknown as Record<string, any>;
    guardedPage.locator = () => { locatorCalls++; return { first() { return this; }, async evaluate() { return {}; } }; };
    guardedPage.evaluate = async () => { runtimeCalls++; return 'complete'; };
    guardedPage.screenshot = async () => { screenshotCalls++; return Buffer.from('synthetic'); };
    if (scopeKind === 'PAGE') guardedPage.url = () => 'http://127.0.0.2/escaped';
    else guardedPage.frames = () => [f.mainFrame];

    const result = await session.captureFailureDiagnostics('#private', true);
    assert.equal(result.dom.status, 'OMITTED_TARGET_ENVELOPE');
    assert.equal(result.runtime.status, 'OMITTED_TARGET_ENVELOPE');
    assert.equal(result.runtime.envelopeSafe, false);
    assert.equal(result.runtime.targetContentEvaluation, 'NOT_RUN');
    assert.equal(result.screenshot.status, 'OMITTED_TARGET_ENVELOPE');
    assert.deepEqual({ locatorCalls, runtimeCalls, screenshotCalls }, { locatorCalls: 0, runtimeCalls: 0, screenshotCalls: 0 });
    await session.close();
  }
});

test('navigation/detach event latch fails closed before a subsequent action can begin', async () => {
  const f = setup();
  const session = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario('FRAME'), discovery: f.discovery, gasAdapter: f.gas });
  (f.fakeFrame as unknown as { url(): string }).url = () => 'http://attacker.invalid/escape';
  for (const handler of f.pageHandlers.get('framenavigated') ?? []) handler(f.fakeFrame);
  (f.fakeFrame as unknown as { url(): string }).url = () => 'http://localhost/child';
  await assert.rejects(session.assertTargetEnvelope(), /TARGET_ENVELOPE_VIOLATION/);
  await session.close();
  assert.equal(f.pageHandlers.get('framenavigated')?.size, 0);
  assert.equal(f.pageHandlers.get('framedetached')?.size, 0);
});

test('out-of-origin navigation request is latched before the destination commits', async () => {
  const f = setup();
  const session = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario('FRAME'), discovery: f.discovery, gasAdapter: f.gas });
  const request = { isNavigationRequest: () => true, frame: () => f.fakeFrame, url: () => 'http://attacker.invalid/escape' };
  for (const handler of f.pageHandlers.get('request') ?? []) handler(request);
  await assert.rejects(session.assertTargetEnvelope(), /TARGET_ENVELOPE_VIOLATION/);
  await session.close();
  assert.equal(f.pageHandlers.get('request')?.size, 0);
});

test('FRAME scope independently latches an out-of-origin top-level navigation request before commit', async () => {
  const f = setup();
  const session = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario('FRAME'), discovery: f.discovery, gasAdapter: f.gas });
  const request = { isNavigationRequest: () => true, frame: () => f.mainFrame, url: () => 'http://attacker.invalid/top-level-escape' };
  for (const handler of f.pageHandlers.get('request') ?? []) handler(request);
  await assert.rejects(session.assertTargetEnvelope(), /TARGET_ENVELOPE_VIOLATION/);
  await session.close();
  assert.equal(f.pageHandlers.get('request')?.size, 0);
});

test('target envelope guard fails closed for a closed PAGE and a detached selected FRAME', async () => {
  const pageFixture = setup();
  const pageSession = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario(), discovery: pageFixture.discovery, gasAdapter: pageFixture.gas });
  (pageFixture.ownedPage as unknown as { isClosed(): boolean }).isClosed = () => true;
  await assert.rejects(pageSession.assertTargetEnvelope(), /TARGET_ENVELOPE_VIOLATION/);
  await pageSession.close();

  const frameFixture = setup();
  const frameSession = await TestPageSession.open({ endpoint: 'http://127.0.0.1:9444', backend: 'PLAYWRIGHT', approvalReference: 'approved', scenario: scenario('FRAME'), discovery: frameFixture.discovery, gasAdapter: frameFixture.gas });
  (frameFixture.ownedPage as unknown as { frames(): Frame[] }).frames = () => [];
  await assert.rejects(frameSession.assertTargetEnvelope(), /TARGET_ENVELOPE_VIOLATION/);
  await frameSession.close();
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
  const state = discovery as unknown as { runnerOwnedPages: Set<Page>; runnerOwnedPageReceipts: Map<object, unknown>; runnerOwnedFixtureLeases: Set<string>;
    playwrightFrameIds: WeakMap<Frame, string>; nextPlaywrightFrameId: number; sessions: Map<Page, unknown>; executionContextIds: Map<Page, Set<number>>; ids: SessionIds };
  state.runnerOwnedPages = new Set([page]);
  state.runnerOwnedPageReceipts = new Map();
  state.runnerOwnedFixtureLeases = new Set();
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
