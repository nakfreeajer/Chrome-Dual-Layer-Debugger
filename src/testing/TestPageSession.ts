import type { Frame, Page, Request } from 'playwright';
import { PlaywrightBrowserDiscovery, type RunnerOwnedPageIdentity, type RunnerOwnedPageReceipt } from '../browser/PlaywrightBrowserDiscovery.js';
import { GasAdapter, type GasTestTargetContext } from '../gas/GasAdapter.js';
import { GasOopifActionBackend } from './GasOopifActionBackend.js';
import { PlaywrightActionBackend } from './PlaywrightActionBackend.js';
import { captureFailureDiagnostics, type FailureDiagnosticResult } from './FailureDiagnostics.js';
import type { ActionBackend, TestTargetAuthorization, TestingBackendId } from './ActionContract.js';
import type { SmokeScenario } from './SmokeScenario.js';
import type { SmokeTarget } from './SmokeScenario.js';
import { FixtureLifecycleController, createDefaultFixtureLifecycleJournal, type FixtureLifecycleJournal, type FixtureLifecycleSummary, type FixtureRuntimeTargetIdentity, type SyntheticFixtureDriver } from './FixtureLifecycle.js';

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
  scenario?: Pick<SmokeScenario, 'scenarioId' | 'target'>;
  fixtureId?: string;
  target?: SmokeTarget;
  discovery?: PlaywrightBrowserDiscovery;
  gasAdapter?: GasAdapter;
  fetchTargets?: FetchTargets;
  fixtureLifecycle?: { driver: SyntheticFixtureDriver; runId: string; journal?: FixtureLifecycleJournal };
}

/** Owns the one page created for a smoke run and its exact selected backend scope. */
export class TestPageSession {
  private readonly discovery: PlaywrightBrowserDiscovery;
  private readonly gas: GasAdapter;
  private ownedPage?: Page;
  private closed = false;
  private envelopeViolation = false;
  private readonly navigationHandler: (frame: Frame) => void;
  private readonly detachHandler: (frame: Frame) => void;
  private readonly requestHandler: (request: Request) => void;

  readonly backend: ActionBackend;
  readonly authorization: TestTargetAuthorization;
  readonly selectedTargetId: string;
  readonly selectedScope: Page | Frame;
  private readonly authorizedPageOrigin: string;
  private readonly authorizedScopeOrigin: string;
  private readonly selectedScopeKind: 'PAGE' | 'FRAME';
  private readonly fixtureLifecycle?: FixtureLifecycleController;
  private finalLifecycleSummary?: FixtureLifecycleSummary;

  private constructor(
    discovery: PlaywrightBrowserDiscovery,
    gas: GasAdapter,
    page: Page,
    backend: ActionBackend,
    authorization: TestTargetAuthorization,
    selectedTargetId: string,
    selectedScope: Page | Frame,
    authorizedPageOrigin: string,
    authorizedScopeOrigin: string,
    fixtureLifecycle?: FixtureLifecycleController
  ) {
    this.discovery = discovery;
    this.gas = gas;
    this.ownedPage = page;
    this.backend = backend;
    this.authorization = authorization;
    this.selectedTargetId = selectedTargetId;
    this.selectedScope = selectedScope;
    this.authorizedPageOrigin = authorizedPageOrigin;
    this.authorizedScopeOrigin = authorizedScopeOrigin;
    this.selectedScopeKind = selectedScope === page ? 'PAGE' : 'FRAME';
    this.fixtureLifecycle = fixtureLifecycle;
    this.navigationHandler = (frame) => {
      try {
        if (frame === page.mainFrame() && TestPageSession.originOf(page.url()) !== this.authorizedPageOrigin) this.envelopeViolation = true;
        if (this.selectedScope !== page && frame === this.selectedScope && TestPageSession.originOf(frame.url()) !== this.authorizedScopeOrigin) this.envelopeViolation = true;
      } catch { this.envelopeViolation = true; }
    };
    this.detachHandler = (frame) => {
      if (frame === page.mainFrame() || (this.selectedScope !== page && frame === this.selectedScope)) this.envelopeViolation = true;
    };
    this.requestHandler = (request) => {
      try {
        if (!request.isNavigationRequest()) return;
        const frame = request.frame();
        const destinationOrigin = TestPageSession.originOf(request.url());
        if (frame === page.mainFrame() && destinationOrigin !== this.authorizedPageOrigin) this.envelopeViolation = true;
        if (this.selectedScope !== page && frame === this.selectedScope && destinationOrigin !== this.authorizedScopeOrigin) {
          this.envelopeViolation = true;
        }
      } catch { this.envelopeViolation = true; }
    };
    page.on('framenavigated', this.navigationHandler);
    page.on('framedetached', this.detachHandler);
    page.on('request', this.requestHandler);
  }

  static async open(options: TestPageSessionOptions): Promise<TestPageSession> {
    if (options.backend !== 'PLAYWRIGHT' && options.backend !== 'GAS_OOPIF') throw new Error('A supported TEST backend is required');
    if (typeof options.approvalReference !== 'string' || !options.approvalReference.trim()
      || options.approvalReference.length > 512 || options.approvalReference.includes('\0')) {
      throw new Error('A valid TEST approval reference is required before browser navigation');
    }
    const fixtureId = options.scenario?.scenarioId ?? options.fixtureId;
    const target = options.scenario?.target ?? options.target;
    if (typeof fixtureId !== 'string' || !fixtureId.trim() || fixtureId.includes('\0')) {
      throw new Error('A valid TEST fixture identity is required before browser navigation');
    }
    if (!target || typeof target.pageUrl !== 'string') throw new Error('A valid TEST target is required before browser navigation');
    if (options.fixtureLifecycle && (options.backend !== 'PLAYWRIGHT' || target.scope.kind !== 'PAGE')) {
      throw new Error('FIXTURE_LIFECYCLE_SCOPE_UNSUPPORTED');
    }
    const authorizedPageOrigin = TestPageSession.originOf(target.pageUrl);
    const authorizedScopeOrigin = target.scope.kind === 'FRAME' ? TestPageSession.originOf(target.scope.url) : authorizedPageOrigin;
    const discovery = options.discovery ?? new PlaywrightBrowserDiscovery(options.endpoint);
    const gas = options.gasAdapter ?? new GasAdapter();
    const fetchTargets = options.fetchTargets ?? defaultFetchTargets;
    const fixtureLifecycle = options.fixtureLifecycle ? new FixtureLifecycleController({
      driver: options.fixtureLifecycle.driver,
      request: { fixtureId, target },
      runId: options.fixtureLifecycle.runId,
      journal: options.fixtureLifecycle.journal ?? createDefaultFixtureLifecycleJournal(options.fixtureLifecycle.runId)
    }) : undefined;
    let page: Page | undefined;
    try {
      const fixtureLease = fixtureLifecycle ? await fixtureLifecycle.prepare() : undefined;
      const created = await discovery.createRunnerOwnedPage(target.pageUrl, {
        mode: 'TEST', fixtureId, approvalReference: options.approvalReference
      }, fixtureLease?.leaseId);
      page = created.page;
      let selectedScope: Page | Frame = page;
      let selectedTargetId = created.pageId;
      let exactScopeUrl = target.pageUrl;
      let targetType: 'page' | 'iframe' = 'page';
      let selectedFrameId: string | undefined;
      if (target.scope.kind === 'FRAME') {
        const selected = await discovery.selectRunnerOwnedFrame(page, target.scope.url, created.discovered);
        selectedScope = selected.frame;
        selectedTargetId = selected.frameId;
        selectedFrameId = selected.frameId;
        exactScopeUrl = target.scope.url;
        targetType = 'iframe';
      }
      if (TestPageSession.originOf(page.url()) !== authorizedPageOrigin) throw new Error('TARGET_ENVELOPE_VIOLATION');
      if (selectedScope !== page && TestPageSession.originOf((selectedScope as Frame).url()) !== authorizedScopeOrigin) throw new Error('TARGET_ENVELOPE_VIOLATION');
      let backend: ActionBackend;
      let authorization: TestTargetAuthorization;
      let runtimeIdentity: FixtureRuntimeTargetIdentity | undefined;
      if (options.backend === 'PLAYWRIGHT') {
        if (fixtureLifecycle) {
          if (selectedScope === page) {
            runtimeIdentity = { backend: 'PLAYWRIGHT', scopeKind: 'PAGE', contextId: created.discovered.contextId, pageId: created.pageId };
          } else {
            const findFrame = (frames: typeof created.discovered.frames): typeof created.discovered.frames[number] | undefined => {
              for (const frame of frames) {
                if (frame.frameId === selectedFrameId) return frame;
                const nested = findFrame(frame.children);
                if (nested) return nested;
              }
              return undefined;
            };
            const discoveredFrame = findFrame(created.discovered.frames);
            if (!discoveredFrame?.protocolFrameId || !selectedFrameId) throw new Error('FIXTURE_TARGET_PROTOCOL_IDENTITY_UNAVAILABLE');
            runtimeIdentity = { backend: 'PLAYWRIGHT', scopeKind: 'FRAME', contextId: created.discovered.contextId,
              pageId: created.pageId, frameId: selectedFrameId, protocolFrameId: discoveredFrame.protocolFrameId };
          }
        }
        backend = new PlaywrightActionBackend(selectedTargetId, selectedScope);
        authorization = { mode: 'TEST', backend: options.backend, targetId: selectedTargetId, fixtureId, approvalReference: options.approvalReference };
      } else {
        const nativeTargetId = await findExactTarget(options.endpoint, targetType, exactScopeUrl, fetchTargets);
        const contexts: GasTestTargetContext[] = await gas.connectTestTarget(options.endpoint, {
          mode: 'TEST', targetId: nativeTargetId, fixtureId, approvalReference: options.approvalReference
        });
        if (contexts.length !== 1 || contexts[0].targetId !== nativeTargetId) throw new Error('Authorized GAS target has an ambiguous default execution context');
        if (fixtureLifecycle) runtimeIdentity = { backend: 'GAS_OOPIF', scopeKind: target.scope.kind, targetId: contexts[0].targetId,
          sessionId: contexts[0].sessionId, executionContextId: contexts[0].executionContextId, frameId: contexts[0].frameId };
        backend = new GasOopifActionBackend(nativeTargetId, contexts[0].sessionId, contexts[0].executionContextId, gas);
        authorization = { mode: 'TEST', backend: options.backend, targetId: nativeTargetId, fixtureId, approvalReference: options.approvalReference };
        selectedTargetId = nativeTargetId;
      }
      if (fixtureLifecycle) {
        if (!runtimeIdentity) throw new Error('FIXTURE_TARGET_RUNTIME_IDENTITY_UNAVAILABLE');
        const ownerVerification = created.ownerReceipt ? discovery.consumeRunnerOwnedPageReceipt(
          created.ownerReceipt, fixtureLease!.leaseId, page, runtimeIdentity as RunnerOwnedPageIdentity) ?? undefined : undefined;
        await fixtureLifecycle.bindTarget({ fixtureId, runtimeIdentity, target: {
          pageUrl: page.url(), scope: selectedScope === page ? { kind: 'PAGE' } : { kind: 'FRAME', url: (selectedScope as Frame).url() }
        }, ownerVerification, page });
      }
      return new TestPageSession(discovery, gas, page, backend, authorization, selectedTargetId, selectedScope, authorizedPageOrigin, authorizedScopeOrigin, fixtureLifecycle);
    } catch (error) {
      let resourcesClosed: 'VERIFIED' | 'FAILED' = 'VERIFIED';
      if (page) {
        try { await discovery.closeRunnerOwnedPage(page); } catch { resourcesClosed = 'FAILED'; }
      }
      try { await gas.disconnect(); } catch { resourcesClosed = 'FAILED'; }
      try { await discovery.disconnect(); } catch { resourcesClosed = 'FAILED'; }
      if (fixtureLifecycle) {
        const summary = await fixtureLifecycle.finish(resourcesClosed);
        const lifecycleError = new Error('TEST_FIXTURE_LIFECYCLE_OPEN_FAILED', { cause: error }) as Error & { fixtureLifecycle?: FixtureLifecycleSummary };
        lifecycleError.fixtureLifecycle = summary;
        throw lifecycleError;
      }
      throw error;
    }
  }

  private static originOf(value: string): string {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      return url.origin;
    } catch { throw new Error('TARGET_ENVELOPE_VIOLATION'); }
  }

  /** Rechecks the exact runner-owned page/frame containment immediately around every generated action. */
  async assertTargetEnvelope(): Promise<void> {
    const initialPage = this.ownedPage;
    if (this.backend.backend === 'GAS_OOPIF' && this.selectedScope !== initialPage && initialPage && !initialPage.isClosed()) {
      // Raw child-target input can return before Playwright forwards the already-issued
      // navigation request from the OOPIF. Let that public request event reach the
      // latch before the runner is allowed to start another generated action.
      await initialPage.waitForTimeout(50);
    }
    try {
      const page = this.ownedPage;
      if (!page || this.closed || page.isClosed() || this.envelopeViolation) throw new Error();
      if (TestPageSession.originOf(page.url()) !== this.authorizedPageOrigin) throw new Error();
      if (this.selectedScope !== page) {
        if (!page.frames().includes(this.selectedScope as Frame)) throw new Error();
        if (TestPageSession.originOf((this.selectedScope as Frame).url()) !== this.authorizedScopeOrigin) throw new Error();
      }
    } catch { throw new Error('TARGET_ENVELOPE_VIOLATION'); }
  }

  async beginFixtureRun(): Promise<void> {
    if (this.fixtureLifecycle) await this.fixtureLifecycle.startRun();
  }

  async finishFixtureRun(outcome: 'PASS' | 'FAIL' | 'UNKNOWN'): Promise<void> {
    if (this.fixtureLifecycle) await this.fixtureLifecycle.finishRun(outcome);
  }

  /** Captures bounded diagnostics only from this session's exact runner-owned page/scope. */
  async captureFailureDiagnostics(selector?: string, syntheticDetails = false): Promise<FailureDiagnosticResult> {
    const page = this.ownedPage;
    if (!page) return {
      dom: { status: selector ? 'OMITTED_TARGET_ENVELOPE' : 'NOT_REQUESTED' },
      runtime: { status: 'OMITTED_TARGET_ENVELOPE', pageClosed: true, frameAttached: false, scopeKind: this.selectedScopeKind, envelopeSafe: false, targetContentEvaluation: 'NOT_RUN' },
      screenshot: { status: syntheticDetails ? 'OMITTED_TARGET_ENVELOPE' : 'NOT_REQUESTED' }
    };
    return captureFailureDiagnostics({ page, scope: this.selectedScope, selector,
      authorizedPageOrigin: this.authorizedPageOrigin, authorizedScopeOrigin: this.authorizedScopeOrigin, syntheticDetails,
      assertTargetEnvelope: () => this.assertTargetEnvelope() });
  }

  async close(): Promise<void | FixtureLifecycleSummary> {
    if (this.closed) return this.finalLifecycleSummary;
    this.closed = true;
    const page = this.ownedPage;
    this.ownedPage = undefined;
    let closeError: unknown;
    page?.off('framenavigated', this.navigationHandler);
    page?.off('framedetached', this.detachHandler);
    page?.off('request', this.requestHandler);
    try {
      if (page) await this.discovery.closeRunnerOwnedPage(page);
    } catch (error) { closeError = error; }
    try { await this.gas.disconnect(); } catch (error) { closeError ??= error; }
    try { await this.discovery.disconnect(); } catch (error) { closeError ??= error; }
    if (this.fixtureLifecycle) {
      this.finalLifecycleSummary = await this.fixtureLifecycle.finish(closeError ? 'FAILED' : 'VERIFIED');
      return this.finalLifecycleSummary;
    }
    if (closeError) throw closeError;
    return undefined;
  }
}
