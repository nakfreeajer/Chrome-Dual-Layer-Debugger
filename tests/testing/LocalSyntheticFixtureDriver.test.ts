import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { FixtureLifecycleController, type FixtureLifecycleEvidence, type FixtureLifecycleJournal,
  type FixtureRuntimeTargetIdentity } from '../../src/testing/FixtureLifecycle.js';
import { LocalSyntheticFixtureDriver, LOCAL_SYNTHETIC_FIXTURE_ID } from '../../src/testing/LocalSyntheticFixtureDriver.js';
import { PlaywrightBrowserDiscovery, type RunnerOwnedPageIdentity, type RunnerOwnedPageReceipt } from '../../src/browser/PlaywrightBrowserDiscovery.js';
import type { SmokeTarget } from '../../src/testing/SmokeScenario.js';

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function journalFixture() {
  const entries: FixtureLifecycleEvidence[] = [];
  const journal: FixtureLifecycleJournal = { async record(entry) { entries.push(entry); }, async close() {} };
  return { entries, journal };
}

function targetFor(driver: LocalSyntheticFixtureDriver): SmokeTarget {
  return { pageUrl: driver.pageUrl, scope: { kind: 'PAGE' } };
}

function mintOwnerVerification(leaseId: string, identity: RunnerOwnedPageIdentity): { proof: object; page: object } {
  const discovery = Object.create(PlaywrightBrowserDiscovery.prototype) as PlaywrightBrowserDiscovery;
  const page = { isClosed: () => false } as unknown as import('playwright').Page;
  const context = { pages: () => [page] } as unknown as import('playwright').BrowserContext;
  const receipt = Object.freeze({}) as RunnerOwnedPageReceipt;
  const state = discovery as unknown as {
    browser: import('playwright').Browser;
    ids: { forContext(value: object): string; forPage(value: object): string };
    runnerOwnedPages: Set<import('playwright').Page>;
    runnerOwnedPageReceipts: Map<RunnerOwnedPageReceipt, { leaseId: string; page: import('playwright').Page;
      context: import('playwright').BrowserContext; contextId: string; pageId: string }>;
    runnerOwnedFixtureLeases: Set<string>;
  };
  state.browser = { contexts: () => [context] } as unknown as import('playwright').Browser;
  state.ids = { forContext: () => identity.contextId, forPage: () => identity.pageId };
  state.runnerOwnedPages = new Set([page]);
  state.runnerOwnedPageReceipts = new Map([[receipt, { leaseId, page, context,
    contextId: identity.contextId, pageId: identity.pageId }]]);
  state.runnerOwnedFixtureLeases = new Set([leaseId]);
  const proof = discovery.consumeRunnerOwnedPageReceipt(receipt, leaseId, page, identity);
  assert.ok(proof);
  return { proof, page };
}

test('real loopback driver completes lease, reset, target receipt gate, run and independent cleanup verification', async () => {
  const driver = new LocalSyntheticFixtureDriver(await reservePort());
  const target = targetFor(driver);
  const journal = journalFixture();
  const identity: FixtureRuntimeTargetIdentity = { backend: 'PLAYWRIGHT', scopeKind: 'PAGE', contextId: 'CONTEXT-SYNTHETIC', pageId: 'PAGE-SYNTHETIC' };
  const controller = new FixtureLifecycleController({ driver, request: { fixtureId: LOCAL_SYNTHETIC_FIXTURE_ID, target }, runId: 'run-local-fixture', journal: journal.journal });

  const lease = await controller.prepare();
  assert.deepEqual(lease.ownedResourceIds.length, 2);
  assert.equal(await driver.verifyOwnership(lease), true);
  assert.equal(await driver.verifyReset(lease), true);
  const page = await fetch(driver.pageUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Synthetic fixture ready/);

  const owner = mintOwnerVerification(lease.leaseId, identity);
  await controller.bindTarget({ fixtureId: lease.fixtureId, target, runtimeIdentity: identity, ownerVerification: owner.proof as never, page: owner.page });
  await controller.startRun();
  await controller.finishRun('PASS');
  const summary = await controller.finish('VERIFIED');
  assert.equal(summary.overallStatus, 'PASS');
  assert.equal(summary.targetBindingStatus, 'VERIFIED');
  assert.equal(summary.teardownStatus, 'VERIFIED');
  assert.equal(summary.cleanupVerificationStatus, 'VERIFIED');
  assert.equal(await driver.verifyCleanup(lease), true);
  assert.equal(JSON.stringify(journal.entries).includes('ownerReceipt'), false);
  assert.equal(JSON.stringify(journal.entries).includes('fixture-server-'), false);
});

test('loopback driver rejects a port conflict and never touches the listener that owns it', async () => {
  const owner = createServer((_request, response) => { response.writeHead(200); response.end('unrelated-owner-still-running'); });
  await new Promise<void>((resolve, reject) => { owner.once('error', reject); owner.listen(0, '127.0.0.1', resolve); });
  const address = owner.address();
  assert.ok(address && typeof address === 'object');
  const driver = new LocalSyntheticFixtureDriver(address.port);
  await assert.rejects(driver.setup({ fixtureId: LOCAL_SYNTHETIC_FIXTURE_ID, target: targetFor(driver) }), /LOCAL_FIXTURE_SETUP_FAILED/);
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(await response.text(), 'unrelated-owner-still-running');
  assert.equal(owner.listening, true);
  await new Promise<void>((resolve, reject) => owner.close((error) => error ? reject(error) : resolve()));
});

test('driver rejects wrong scope and target before binding a loopback resource', async () => {
  const driver = new LocalSyntheticFixtureDriver(await reservePort());
  await assert.rejects(driver.setup({ fixtureId: LOCAL_SYNTHETIC_FIXTURE_ID, target: { pageUrl: driver.pageUrl, scope: { kind: 'FRAME', url: driver.pageUrl } } }), /LOCAL_FIXTURE_TARGET_MISMATCH/);
  await assert.rejects(driver.setup({ fixtureId: 'UNLISTED-FIXTURE', target: targetFor(driver) }), /LOCAL_FIXTURE_TARGET_MISMATCH/);
});

test('cleanup verification independently fails if another listener acquires the port after owned teardown', async () => {
  const driver = new LocalSyntheticFixtureDriver(await reservePort());
  const lease = await driver.setup({ fixtureId: LOCAL_SYNTHETIC_FIXTURE_ID, target: targetFor(driver) });
  await driver.teardown(lease);
  const unrelated = createServer((_request, response) => { response.writeHead(200); response.end('unrelated'); });
  await new Promise<void>((resolve, reject) => { unrelated.once('error', reject); unrelated.listen(driver.port, '127.0.0.1', resolve); });
  assert.equal(await driver.verifyCleanup(lease), false);
  assert.equal(unrelated.listening, true);
  await new Promise<void>((resolve, reject) => unrelated.close((error) => error ? reject(error) : resolve()));
  assert.equal(await driver.verifyCleanup(lease), true);
});
