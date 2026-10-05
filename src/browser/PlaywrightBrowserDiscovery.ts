import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
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
