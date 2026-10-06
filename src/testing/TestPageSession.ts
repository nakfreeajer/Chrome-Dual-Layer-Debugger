import type { Frame, Page } from 'playwright';
import { PlaywrightBrowserDiscovery } from '../browser/PlaywrightBrowserDiscovery.js';
import { GasAdapter, type GasTestTargetContext } from '../gas/GasAdapter.js';
import { GasOopifActionBackend } from './GasOopifActionBackend.js';
import { PlaywrightActionBackend } from './PlaywrightActionBackend.js';
import type { ActionBackend, TestTargetAuthorization, TestingBackendId } from './ActionContract.js';
import type { SmokeScenario } from './SmokeScenario.js';

interface DebugTarget { id?: unknown; targetId?: unknown; type?: unknown; url?: unknown; }
type FetchTargets = (url: string) => Promise<DebugTarget[]>;

async function defaultFetchTargets(url: string): Promise<DebugTarget[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('Unable to read browser target list');
  const targets: unknown = await response.json();
  if (!Array.isArray(targets)) throw new Error('Browser target list is malformed');
  return targets as DebugTarget[];
}

async function findExactTarget(endpoint: string, targetType: 'page' | 'iframe', url: string, fetchTargets: FetchTargets): Promise<string> {
  const targetListUrl = new URL('/json/list', endpoint).toString();
  const deadline = Date.now() + 5000;
  do {
    const matches = (await fetchTargets(targetListUrl)).filter((target) => target.type === targetType && target.url === url);
    if (matches.length > 1) throw new Error('Exact browser target URL is ambiguous');
    if (matches.length === 1) {
      const targetId = typeof matches[0].targetId === 'string' ? matches[0].targetId : matches[0].id;
      if (typeof targetId !== 'string' || !targetId.trim()) throw new Error('Exact browser target has no native identity');
      return targetId;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error('Exact browser target URL was not found');
}

export interface TestPageSessionOptions {
  endpoint: string;
  backend: TestingBackendId;
  approvalReference: string;
  scenario: SmokeScenario;
  discovery?: PlaywrightBrowserDiscovery;
  gasAdapter?: GasAdapter;
  fetchTargets?: FetchTargets;
}

/** Owns the one page created for a smoke run and its exact selected backend scope. */
export class TestPageSession {
  private readonly discovery: PlaywrightBrowserDiscovery;
  private readonly gas: GasAdapter;
  private ownedPage?: Page;
  private closed = false;

  readonly backend: ActionBackend;
  readonly authorization: TestTargetAuthorization;
  readonly selectedTargetId: string;
  readonly selectedScope: Page | Frame;

  private constructor(
    discovery: PlaywrightBrowserDiscovery,
    gas: GasAdapter,
    page: Page,
    backend: ActionBackend,
    authorization: TestTargetAuthorization,
    selectedTargetId: string,
    selectedScope: Page | Frame
  ) {
    this.discovery = discovery;
    this.gas = gas;
    this.ownedPage = page;
    this.backend = backend;
    this.authorization = authorization;
    this.selectedTargetId = selectedTargetId;
    this.selectedScope = selectedScope;
  }

  static async open(options: TestPageSessionOptions): Promise<TestPageSession> {
    if (options.backend !== 'PLAYWRIGHT' && options.backend !== 'GAS_OOPIF') throw new Error('A supported TEST backend is required');
    if (typeof options.approvalReference !== 'string' || !options.approvalReference.trim()
      || options.approvalReference.length > 512 || options.approvalReference.includes('\0')) {
      throw new Error('A valid TEST approval reference is required before browser navigation');
    }
    if (typeof options.scenario?.scenarioId !== 'string' || !options.scenario.scenarioId.trim() || options.scenario.scenarioId.includes('\0')) {
      throw new Error('A valid TEST fixture identity is required before browser navigation');
    }
    const discovery = options.discovery ?? new PlaywrightBrowserDiscovery(options.endpoint);
    const gas = options.gasAdapter ?? new GasAdapter();
    const fetchTargets = options.fetchTargets ?? defaultFetchTargets;
    let page: Page | undefined;
    try {
      const created = await discovery.createRunnerOwnedPage(options.scenario.target.pageUrl, {
        mode: 'TEST', fixtureId: options.scenario.scenarioId, approvalReference: options.approvalReference
      });
      page = created.page;
      let selectedScope: Page | Frame = page;
      let selectedTargetId = created.pageId;
      let exactScopeUrl = options.scenario.target.pageUrl;
      let targetType: 'page' | 'iframe' = 'page';
      if (options.scenario.target.scope.kind === 'FRAME') {
        const selected = await discovery.selectRunnerOwnedFrame(page, options.scenario.target.scope.url, created.discovered);
        selectedScope = selected.frame;
        selectedTargetId = selected.frameId;
        exactScopeUrl = options.scenario.target.scope.url;
        targetType = 'iframe';
      }
      let backend: ActionBackend;
      let authorization: TestTargetAuthorization;
      if (options.backend === 'PLAYWRIGHT') {
        backend = new PlaywrightActionBackend(selectedTargetId, selectedScope);
        authorization = { mode: 'TEST', backend: options.backend, targetId: selectedTargetId, fixtureId: options.scenario.scenarioId, approvalReference: options.approvalReference };
      } else {
        const nativeTargetId = await findExactTarget(options.endpoint, targetType, exactScopeUrl, fetchTargets);
        const contexts: GasTestTargetContext[] = await gas.connectTestTarget(options.endpoint, {
          mode: 'TEST', targetId: nativeTargetId, fixtureId: options.scenario.scenarioId, approvalReference: options.approvalReference
        });
        if (contexts.length !== 1 || contexts[0].targetId !== nativeTargetId) throw new Error('Authorized GAS target has an ambiguous default execution context');
        backend = new GasOopifActionBackend(nativeTargetId, contexts[0].sessionId, contexts[0].executionContextId, gas);
        authorization = { mode: 'TEST', backend: options.backend, targetId: nativeTargetId, fixtureId: options.scenario.scenarioId, approvalReference: options.approvalReference };
        selectedTargetId = nativeTargetId;
      }
      return new TestPageSession(discovery, gas, page, backend, authorization, selectedTargetId, selectedScope);
    } catch (error) {
      if (page) {
        try { await discovery.closeRunnerOwnedPage(page); } catch { /* Continue disconnecting owned sessions. */ }
      }
      try { await gas.disconnect(); } finally { await discovery.disconnect(); }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const page = this.ownedPage;
    this.ownedPage = undefined;
    let closeError: unknown;
    try {
      if (page) await this.discovery.closeRunnerOwnedPage(page);
    } catch (error) { closeError = error; }
    try { await this.gas.disconnect(); } catch (error) { closeError ??= error; }
    try { await this.discovery.disconnect(); } catch (error) { closeError ??= error; }
    if (closeError) throw closeError;
  }
}
