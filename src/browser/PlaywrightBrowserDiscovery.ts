import { chromium, type Browser, type BrowserContext, type CDPSession, type Frame, type Page } from 'playwright';
import { detectLayer } from '../core/LayerDetector.js';
import { SessionIds } from '../core/SessionIds.js';
import { connectOverCDPOptions } from './ConnectOptions.js';
import { V1CorrelationObserver, V1ObserverScopeIds } from './V1CorrelationObserver.js';
import type { Timeline } from '../trace/Timeline.js';
import type { BrowserDiscovery, DiscoveryResult, DiscoveredFrame, DiscoveredPage, PageDiscoveryInput } from './BrowserDiscovery.js';

interface ProtocolFrame {
  id: string;
  url: string;
  name?: string;
}

export interface ProtocolFrameTree {
  frame: ProtocolFrame;
  childFrames?: ProtocolFrameTree[];
}

export interface RunnerPageTestIntent {
  mode: 'TEST';
  fixtureId: string;
  approvalReference: string;
}

declare const runnerOwnedPageReceiptBrand: unique symbol;

/** Opaque in-process capability issued only by the runner-owned page registry. */
export type RunnerOwnedPageReceipt = { readonly [runnerOwnedPageReceiptBrand]: true };
declare const runnerOwnedPageVerificationBrand: unique symbol;

/** Opaque one-use proof minted only after the discovery registry consumes a valid receipt. */
export type RunnerOwnedPageVerification = { readonly [runnerOwnedPageVerificationBrand]: true };

export interface RunnerOwnedPageIdentity {
  backend: 'PLAYWRIGHT';
  scopeKind: 'PAGE';
  contextId: string;
  pageId: string;
}

interface RunnerOwnedPageReceiptRecord {
  leaseId: string;
  page: Page;
  context: BrowserContext;
  contextId: string;
  pageId: string;
}

interface RunnerOwnedPageVerificationRecord {
  leaseId: string;
  page: Page;
  identity: RunnerOwnedPageIdentity;
  isCurrent(): boolean;
}

const runnerOwnedPageVerifications = new WeakMap<RunnerOwnedPageVerification, RunnerOwnedPageVerificationRecord>();

/** Lifecycle gate for the opaque proof; arbitrary IDs or caller-created objects cannot pass this check. */
export function consumeRunnerOwnedPageVerification(
  verification: unknown,
  fixtureLeaseId: string,
  page: object,
  identity: RunnerOwnedPageIdentity
): boolean {
  if (!verification || typeof verification !== 'object') return false;
  const opaque = verification as RunnerOwnedPageVerification;
  const record = runnerOwnedPageVerifications.get(opaque);
  if (!record) return false;
  runnerOwnedPageVerifications.delete(opaque);
  return record.leaseId === fixtureLeaseId && record.page === page && record.isCurrent()
    && record.identity.backend === identity.backend && record.identity.scopeKind === identity.scopeKind
    && record.identity.contextId === identity.contextId && record.identity.pageId === identity.pageId;
}

function validateRunnerPageTestIntent(intent: RunnerPageTestIntent | undefined): asserts intent is RunnerPageTestIntent {
  if (!intent || intent.mode !== 'TEST' || !intent.fixtureId.trim() || !intent.approvalReference.trim()
    || intent.fixtureId.includes('\0') || intent.approvalReference.includes('\0') || intent.approvalReference.length > 512) {
    throw new Error('A valid TEST authorization intent is required before creating a runner-owned page');
  }
}

export function normalizeFrameTree(tree: ProtocolFrameTree, ids = new SessionIds()): DiscoveredFrame[] {
  const convert = (node: ProtocolFrameTree): DiscoveredFrame => ({
    frameId: ids.forFrame(node.frame.id),
    protocolFrameId: node.frame.id,
    url: node.frame.url,
    ...(node.frame.name ? { name: node.frame.name } : {}),
    children: (node.childFrames ?? []).map(convert)
  });
  return [convert(tree)];
}

export function normalizeDiscoveredPage(
  input: PageDiscoveryInput,
  ids: SessionIds,
  contextIdentity: object,
  pageIdentity: object
): DiscoveredPage {
  return {
    pageId: ids.forPage(pageIdentity),
    contextId: ids.forContext(contextIdentity),
    url: input.url,
    ...(input.title === undefined ? {} : { title: input.title }),
    mode: detectLayer(input.url),
    frames: input.frames,
    executionContextIds: [...input.executionContextIds]
  };
}

export class PlaywrightBrowserDiscovery implements BrowserDiscovery {
  private browser?: Browser;
  private readonly ids = new SessionIds();
  private readonly sessions = new Map<Page, CDPSession>();
  private readonly executionContextIds = new Map<Page, Set<number>>();
  private readonly runnerOwnedPages = new Set<Page>();
  private readonly runnerOwnedPageReceipts = new Map<RunnerOwnedPageReceipt, RunnerOwnedPageReceiptRecord>();
  private readonly runnerOwnedFixtureLeases = new Set<string>();
  private playwrightFrameIds = new WeakMap<Frame, string>();
  private nextPlaywrightFrameId = 0;

  constructor(private readonly endpoint = 'http://127.0.0.1:9222') {}

  async connect(): Promise<void> {
    if (this.browser?.isConnected()) return;
    this.browser = await chromium.connectOverCDP(this.endpoint, connectOverCDPOptions(this.endpoint));
  }

  async discover(): Promise<DiscoveryResult> {
    await this.connect();
    const browser = this.browser;
    if (!browser) throw new Error('Browser connection was not established');

    const contexts = [];
    for (const context of browser.contexts()) {
      const contextId = this.ids.forContext(context);
      const pages: DiscoveredPage[] = [];
      for (const page of context.pages()) {
        pages.push(await this.discoverPage(page, context));
      }
      contexts.push({ contextId, pages });
    }
    return { connected: true, contexts };
  }

  async disconnect(): Promise<void> {
    for (const session of this.sessions.values()) {
      try { await session.detach(); } catch { /* Browser may have disconnected already. */ }
    }
    this.sessions.clear();
    this.executionContextIds.clear();
    this.ids.clear();
    this.runnerOwnedPages.clear();
    this.runnerOwnedPageReceipts.clear();
    this.runnerOwnedFixtureLeases.clear();
    this.playwrightFrameIds = new WeakMap<Frame, string>();
    this.nextPlaywrightFrameId = 0;
    const browser = this.browser;
    this.browser = undefined;
    if (browser?.isConnected()) await browser.close();
  }

  getPageById(pageId: string): Page | undefined {
    for (const context of this.browser?.contexts() ?? []) {
      for (const page of context.pages()) {
        if (this.ids.forPage(page) === pageId) return page;
      }
    }
    return undefined;
  }

  /** Creates and navigates one page owned by an explicitly authorized TEST runner. */
  async createRunnerOwnedPage(url: string, intent: RunnerPageTestIntent, fixtureLeaseId?: string): Promise<{
    page: Page; pageId: string; discovered: DiscoveredPage; ownerReceipt?: RunnerOwnedPageReceipt
  }> {
    validateRunnerPageTestIntent(intent);
    if (fixtureLeaseId !== undefined && (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(fixtureLeaseId)
      || this.runnerOwnedFixtureLeases.has(fixtureLeaseId))) {
      throw new Error('Fixture target receipt lease is invalid or already registered');
    }
    if (fixtureLeaseId !== undefined) this.runnerOwnedFixtureLeases.add(fixtureLeaseId);
    let page: Page | undefined;
    try {
      await this.connect();
      const browser = this.browser;
      const context = browser?.contexts()[0];
      if (!context) throw new Error('No connected browser context is available for a runner-owned page');
      page = await context.newPage();
      this.runnerOwnedPages.add(page);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      const discovered = await this.discoverPage(page, context);
      if (fixtureLeaseId === undefined) return { page, pageId: discovered.pageId, discovered };
      const ownerReceipt = Object.freeze({}) as RunnerOwnedPageReceipt;
      this.runnerOwnedPageReceipts.set(ownerReceipt, {
        leaseId: fixtureLeaseId, page, context, contextId: discovered.contextId, pageId: discovered.pageId
      });
      return { page, pageId: discovered.pageId, discovered, ownerReceipt };
    } catch (error) {
      try { if (page && this.runnerOwnedPages.has(page)) await this.closeRunnerOwnedPage(page); }
      catch { /* Preserve the creation failure; fixture lifecycle cleanup will fail closed. */ }
      finally { if (fixtureLeaseId !== undefined) this.runnerOwnedFixtureLeases.delete(fixtureLeaseId); }
      throw error;
    }
  }

  /** Waits for and selects one exact-URL child/main Frame inside a page created by this runner. */
  async selectRunnerOwnedFrame(page: Page, url: string, discovered: DiscoveredPage, timeoutMs = 5000): Promise<{ frame: Frame; frameId: string }> {
    if (!this.runnerOwnedPages.has(page)) throw new Error('Page is not owned by this TEST runner');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new Error('Frame selection timeout is invalid');
    const normalized: DiscoveredFrame[] = [];
    const visit = (items: readonly DiscoveredFrame[]) => { for (const item of items) { if (item.url === url) normalized.push(item); visit(item.children); } };
    visit(discovered.frames);
    const deadline = Date.now() + timeoutMs;
    let frames: import('playwright').Frame[] = [];
    do {
      frames = page.frames().filter((frame) => frame.url() === url);
      if (frames.length > 1) throw new Error('Exact frame URL is ambiguous inside runner-owned page');
      if (frames.length === 1) break;
      await page.waitForTimeout(Math.min(50, Math.max(1, deadline - Date.now())));
    } while (Date.now() < deadline);
    if (frames.length !== 1) throw new Error('Exact frame URL was not found inside runner-owned page');
    // The raw target/context backend also needs the remote document's runtime
    // context, which may not exist yet at frame attachment or DOMContentLoaded.
    await frames[0].waitForLoadState('load', { timeout: Math.max(1, deadline - Date.now()) });
    // Playwright exposes OOPIF frames semantically even when the page CDPSession's
    // Page.getFrameTree omits their remote frame node. Preserve that public Frame
    // selection without inventing a protocol FrameId or mapping.
    if (normalized.length === 1) return { frame: frames[0], frameId: normalized[0].frameId };
    const knownLocalId = this.playwrightFrameIds.get(frames[0]);
    if (knownLocalId) return { frame: frames[0], frameId: knownLocalId };
    this.nextPlaywrightFrameId += 1;
    const localFrameId = `PLAYWRIGHT-FRAME-${String(this.nextPlaywrightFrameId).padStart(4, '0')}`;
    this.playwrightFrameIds.set(frames[0], localFrameId);
    return { frame: frames[0], frameId: localFrameId };
  }

  async closeRunnerOwnedPage(page: Page): Promise<void> {
    if (!this.runnerOwnedPages.has(page)) throw new Error('Refusing to close a page not owned by this TEST runner');
    this.runnerOwnedPages.delete(page);
    for (const [receipt, record] of this.runnerOwnedPageReceipts) {
      if (record.page === page) {
        this.runnerOwnedPageReceipts.delete(receipt);
      }
    }
    if (!page.isClosed()) await page.close();
  }

  /** Consumes an owner-issued capability and verifies the exact registered PAGE object and IDs once. */
  consumeRunnerOwnedPageReceipt(
    receipt: unknown,
    fixtureLeaseId: string,
    page: Page,
    identity: RunnerOwnedPageIdentity
  ): RunnerOwnedPageVerification | null {
    if (!receipt || typeof receipt !== 'object') return null;
    const typedReceipt = receipt as RunnerOwnedPageReceipt;
    const record = this.runnerOwnedPageReceipts.get(typedReceipt);
    if (!record) return null;

    // Any attempted use burns the capability, including wrong-lease/identity attempts.
    this.runnerOwnedPageReceipts.delete(typedReceipt);
    if (record.leaseId !== fixtureLeaseId || record.page !== page || !this.runnerOwnedPages.has(record.page)
      || record.page.isClosed() || !identity || typeof identity !== 'object'
      || identity.backend !== 'PLAYWRIGHT' || identity.scopeKind !== 'PAGE'
      || identity.contextId !== record.contextId || identity.pageId !== record.pageId
      || !this.browser?.contexts().includes(record.context) || !record.context.pages().includes(record.page)
      || this.ids.forContext(record.context) !== record.contextId || this.ids.forPage(record.page) !== record.pageId) return null;

    const samePageId = record.context.pages().filter((candidate) => this.ids.forPage(candidate) === record.pageId);
    if (samePageId.length !== 1 || samePageId[0] !== record.page) return null;
    const verification = Object.freeze({}) as RunnerOwnedPageVerification;
    runnerOwnedPageVerifications.set(verification, {
      leaseId: record.leaseId, page: record.page, identity: { backend: 'PLAYWRIGHT', scopeKind: 'PAGE',
        contextId: record.contextId, pageId: record.pageId },
      isCurrent: () => this.runnerOwnedPages.has(record.page) && !record.page.isClosed()
        && !!this.browser?.contexts().includes(record.context) && record.context.pages().includes(record.page)
        && this.ids.forContext(record.context) === record.contextId && this.ids.forPage(record.page) === record.pageId
    });
    return verification;
  }

  createV1Observer(pageId: string, timeline: Timeline, ids: V1ObserverScopeIds): V1CorrelationObserver {
    const page = this.getPageById(pageId);
    if (!page) throw new Error(`Discovered page ${pageId} is no longer available`);
    return new V1CorrelationObserver(page, timeline, ids);
  }

  private async discoverPage(page: Page, context: BrowserContext): Promise<DiscoveredPage> {
    let title: string | undefined;
    try { title = await page.title(); } catch { /* Some special pages do not expose a title. */ }

    let session = this.sessions.get(page);
    let executionContextIds = this.executionContextIds.get(page);
    if (!session) {
      session = await page.context().newCDPSession(page);
      this.sessions.set(page, session);
      executionContextIds = new Set<number>();
      this.executionContextIds.set(page, executionContextIds);
      session.on('Runtime.executionContextCreated', (event: { context: { id: number } }) => {
        executionContextIds?.add(event.context.id);
      });
      await session.send('Page.enable');
      await session.send('Runtime.enable');
    }
    executionContextIds ??= new Set<number>();
    const { frameTree } = await session.send('Page.getFrameTree') as { frameTree: ProtocolFrameTree };
    const frames = normalizeFrameTree(frameTree, this.ids);
    const url = page.url();

    return normalizeDiscoveredPage({
      url,
      ...(title === undefined ? {} : { title }),
      frames,
      executionContextIds: [...executionContextIds]
    }, this.ids, context, page);
  }

}
