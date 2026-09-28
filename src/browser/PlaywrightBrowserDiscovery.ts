import { chromium, type Browser, type CDPSession, type Page } from 'playwright';
import { detectLayer } from '../core/LayerDetector.js';
import { SessionIds } from '../core/SessionIds.js';
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
    frameId: ids.next('FRAME'),
    protocolFrameId: node.frame.id,
    url: node.frame.url,
    ...(node.frame.name ? { name: node.frame.name } : {}),
    children: (node.childFrames ?? []).map(convert)
  });
  return [convert(tree)];
}

export function normalizeDiscoveredPage(input: PageDiscoveryInput, ids: SessionIds): DiscoveredPage {
  return {
    pageId: ids.next('PAGE'),
    contextId: input.contextId,
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
  private readonly sessions: CDPSession[] = [];
  private readonly executionContextIds = new Map<Page, Set<number>>();

  constructor(private readonly endpoint = 'http://127.0.0.1:9222') {}

  async connect(): Promise<void> {
    if (this.browser?.isConnected()) return;
    this.browser = await chromium.connectOverCDP(this.endpoint);
  }

  async discover(): Promise<DiscoveryResult> {
    await this.connect();
    const browser = this.browser;
    if (!browser) throw new Error('Browser connection was not established');

    const contexts = [];
    for (const context of browser.contexts()) {
      const contextId = this.ids.next('CONTEXT');
      const pages: DiscoveredPage[] = [];
      for (const page of context.pages()) {
        pages.push(await this.discoverPage(page, contextId));
      }
      contexts.push({ contextId, pages });
    }
    return { connected: true, contexts };
  }

  async disconnect(): Promise<void> {
    for (const session of this.sessions.splice(0)) {
      try { await session.detach(); } catch { /* Browser may have disconnected already. */ }
    }
    const browser = this.browser;
    this.browser = undefined;
    if (browser?.isConnected()) await browser.close();
  }

  private async discoverPage(page: Page, contextId: string): Promise<DiscoveredPage> {
    let title: string | undefined;
    try { title = await page.title(); } catch { /* Some special pages do not expose a title. */ }

    const session = await page.context().newCDPSession(page);
    this.sessions.push(session);
    const executionContextIds = new Set<number>();
    this.executionContextIds.set(page, executionContextIds);
    session.on('Runtime.executionContextCreated', (event: { context: { id: number } }) => {
      executionContextIds.add(event.context.id);
    });
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    const { frameTree } = await session.send('Page.getFrameTree') as { frameTree: ProtocolFrameTree };
    const frames = normalizeFrameTree(frameTree, this.ids);
    const url = page.url();

    return normalizeDiscoveredPage({
      contextId,
      url,
      ...(title === undefined ? {} : { title }),
      frames,
      executionContextIds: [...executionContextIds]
    }, this.ids);
  }

}
