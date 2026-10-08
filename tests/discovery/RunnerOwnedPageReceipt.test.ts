import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeRunnerOwnedPageVerification, PlaywrightBrowserDiscovery, type RunnerOwnedPageIdentity, type RunnerOwnedPageReceipt } from '../../src/browser/PlaywrightBrowserDiscovery.js';
import type { Browser, BrowserContext, Page } from 'playwright';

const intent = { mode: 'TEST' as const, fixtureId: 'receipt-fixture', approvalReference: 'approved synthetic fixture' };

function createDiscovery() {
  const discovery = new PlaywrightBrowserDiscovery('http://127.0.0.1:9444');
  const pages: Page[] = [];
  const pageRecords = new WeakMap<Page, { url: string; closed: boolean }>();
  const context = {
    pages: () => pages,
    async newPage() {
      const record = { url: 'about:blank', closed: false };
      const page = {
        context: () => context,
        isClosed: () => record.closed,
        url: () => record.url,
        async goto(url: string) { record.url = url; },
        async close() { record.closed = true; }
      } as unknown as Page;
      pageRecords.set(page, record);
      pages.push(page);
      return page;
    }
  } as unknown as BrowserContext;
  const browser = { isConnected: () => true, contexts: () => [context] } as unknown as Browser;
  const internal = discovery as unknown as {
    browser: Browser;
    ids: { forContext(context: object): string; forPage(page: object): string };
    discoverPage(page: Page, context: BrowserContext): Promise<unknown>;
  };
  internal.browser = browser;
  internal.discoverPage = async (page, ownerContext) => ({
    pageId: internal.ids.forPage(page), contextId: internal.ids.forContext(ownerContext), url: page.url(), mode: 'BROWSER_ONLY', frames: [], executionContextIds: []
  });

  async function create(leaseId: string) {
    const result = await discovery.createRunnerOwnedPage('http://127.0.0.1:4567/fixture', intent, leaseId);
    return { ...result, identity: { backend: 'PLAYWRIGHT', scopeKind: 'PAGE', contextId: result.discovered.contextId, pageId: result.pageId } as RunnerOwnedPageIdentity,
      isClosed: () => pageRecords.get(result.page)?.closed === true };
  }
  return { discovery, pages, create };
}

test('owner receipt is private, lease-bound, tied to exact Page and IDs, and consumed once', async () => {
  const f = createDiscovery();
  const created = await f.create('lease-A');
  assert.equal(Object.keys(created.ownerReceipt as object).length, 0, 'receipt carries no enumerable ID or metadata');
  const verification = f.discovery.consumeRunnerOwnedPageReceipt(created.ownerReceipt, 'lease-A', created.page, created.identity);
  assert.ok(verification, 'valid owner receipt mints an opaque verification capability');
  assert.equal(consumeRunnerOwnedPageVerification(verification, 'lease-A', created.page, created.identity), true);
  assert.equal(consumeRunnerOwnedPageVerification(verification, 'lease-A', created.page, created.identity), false, 'verification capability is one-use');
  assert.equal(f.discovery.consumeRunnerOwnedPageReceipt(created.ownerReceipt, 'lease-A', created.page, created.identity), null, 'replay is rejected');
  assert.equal(created.isClosed(), false);
  const pageCount = f.pages.length;
  await assert.rejects(f.discovery.createRunnerOwnedPage('http://127.0.0.1:4567/fixture', intent, 'lease-A'), /receipt lease is invalid or already registered/);
  assert.equal(f.pages.length, pageCount, 'consumed lease cannot register an ambiguous second page');
});

test('verification capability cannot be caller-forged and wrong lease, page, or identity consumes it', async () => {
  const f = createDiscovery();
  const created = await f.create('lease-bound');
  const proof = f.discovery.consumeRunnerOwnedPageReceipt(created.ownerReceipt, 'lease-bound', created.page, created.identity);
  assert.ok(proof);
  assert.equal(consumeRunnerOwnedPageVerification({}, 'lease-bound', created.page, created.identity), false,
    'arbitrary object is not a capability');
  assert.equal(consumeRunnerOwnedPageVerification(proof, 'wrong-lease', created.page, created.identity), false);
  assert.equal(consumeRunnerOwnedPageVerification(proof, 'lease-bound', created.page, created.identity), false,
    'failed use burns the one-use capability');

  const other = await f.create('lease-page-bound');
  const pageBoundProof = f.discovery.consumeRunnerOwnedPageReceipt(other.ownerReceipt, 'lease-page-bound', other.page, other.identity);
  assert.ok(pageBoundProof);
  assert.equal(consumeRunnerOwnedPageVerification(pageBoundProof, 'lease-page-bound', created.page, other.identity), false);
  assert.equal(consumeRunnerOwnedPageVerification(pageBoundProof, 'lease-page-bound', other.page,
    { ...other.identity, pageId: 'PAGE-FORGED' }), false);
});

test('wrong lease and wrong identity attempts burn the receipt and cannot attest a matching-URL foreign page', async () => {
  const f = createDiscovery();
  const owned = await f.create('lease-A');
  const foreign = await f.create('lease-B');
  assert.equal(owned.page.url(), foreign.page.url(), 'the synthetic pages deliberately have identical URLs');
  assert.equal(f.discovery.consumeRunnerOwnedPageReceipt(owned.ownerReceipt, 'lease-A', foreign.page, owned.identity), null,
    'matching URL cannot substitute for exact runner-owned Page object');
  assert.equal(f.discovery.consumeRunnerOwnedPageReceipt(owned.ownerReceipt, 'lease-A', owned.page, owned.identity), null, 'wrong-page attempt consumed the one-use receipt');
  assert.equal(f.discovery.consumeRunnerOwnedPageReceipt(owned.ownerReceipt, 'lease-B', owned.page, owned.identity), null);
  const wrongLease = await f.create('lease-C');
  assert.equal(f.discovery.consumeRunnerOwnedPageReceipt(wrongLease.ownerReceipt, 'lease-D', wrongLease.page, wrongLease.identity), null);
  assert.equal(f.discovery.consumeRunnerOwnedPageReceipt(wrongLease.ownerReceipt, 'lease-C', wrongLease.page, wrongLease.identity), null, 'wrong-lease attempt consumed the one-use receipt');
  assert.equal(f.discovery.consumeRunnerOwnedPageReceipt(foreign.ownerReceipt, 'lease-B', foreign.page,
    { ...foreign.identity, pageId: owned.identity.pageId }), null, 'identity mismatch is rejected even with an owner receipt');
  assert.equal(f.discovery.consumeRunnerOwnedPageReceipt(foreign.ownerReceipt, 'lease-B', foreign.page, foreign.identity), null, 'wrong-identity attempt consumed the one-use receipt');
});

test('closed or explicitly closed runner page invalidates any outstanding receipt', async () => {
  const f = createDiscovery();
  const closed = await f.create('lease-closed');
  await closed.page.close();
  assert.equal(f.discovery.consumeRunnerOwnedPageReceipt(closed.ownerReceipt, 'lease-closed', closed.page, closed.identity), null);

  const explicitlyClosed = await f.create('lease-explicit-close');
  const staleVerification = f.discovery.consumeRunnerOwnedPageReceipt(explicitlyClosed.ownerReceipt, 'lease-explicit-close',
    explicitlyClosed.page, explicitlyClosed.identity);
  assert.ok(staleVerification);
  await f.discovery.closeRunnerOwnedPage(explicitlyClosed.page);
  assert.equal(consumeRunnerOwnedPageVerification(staleVerification, 'lease-explicit-close', explicitlyClosed.page, explicitlyClosed.identity), false,
    'page closure invalidates a verification already minted from its receipt');
  assert.equal(explicitlyClosed.isClosed(), true);
});

test('a lease cannot receive an ambiguous second page receipt', async () => {
  const f = createDiscovery();
  await f.create('lease-unique');
  const countBefore = f.pages.length;
  await assert.rejects(f.discovery.createRunnerOwnedPage('http://127.0.0.1:4567/fixture', intent, 'lease-unique'), /receipt lease is invalid or already registered/);
  assert.equal(f.pages.length, countBefore, 'duplicate lease is rejected before creating a browser page');
});

test('receipt created without fixture lease cannot be used as an ownership proof', async () => {
  const f = createDiscovery();
  const ordinary = await f.discovery.createRunnerOwnedPage('http://127.0.0.1:4567/fixture', intent);
  assert.equal(ordinary.ownerReceipt, undefined);
  assert.equal(f.discovery.consumeRunnerOwnedPageReceipt({} as RunnerOwnedPageReceipt, 'lease-A', ordinary.page,
    { backend: 'PLAYWRIGHT', scopeKind: 'PAGE', contextId: ordinary.discovered.contextId, pageId: ordinary.pageId }), null);
});
