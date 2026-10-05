import type { CDPSession, Page } from 'playwright';
import { V1CorrelationRecognizer, emitV1CorrelationEvents, type V1CorrelationResult } from '../correlation/V1CorrelationRecognizer.js';
import { extractV1RequestEvidence, extractV1ResponseEvidence } from '../correlation/V1EvidenceProducer.js';
import { RawChildMarkerObserver } from './RawChildMarkerObserver.js';
import type { Timeline } from '../trace/Timeline.js';
import type { TraceEvent } from '../trace/TraceEvent.js';

interface RequestWillBeSent {
  requestId: string;
  type?: string;
  request: { url: string; method: string; postData?: string; headers?: Record<string, string> };
}
interface ResponseReceived { requestId: string; }
interface RequestTerminal { requestId: string; }
interface ResponseBody { body: string; base64Encoded: boolean; }

const MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024;

export class V1ObserverScopeIds {
  private nextId = 0;

  next(): string {
    this.nextId += 1;
    return `V1-OBSERVER-${String(this.nextId).padStart(6, '0')}`;
  }
}

/** One page-scoped CDP session owns its native requestId namespace and recognizer. */
export class V1CorrelationObserver {
  readonly observerScopeId: string;
  private session?: CDPSession;
  private rawMarkerObserver?: RawChildMarkerObserver;
  private readonly recognizer: V1CorrelationRecognizer;
  private readonly candidateRequests = new Set<string>();
  private readonly responseCounts = new Map<string, number>();
  private readonly responseCaptured = new Set<string>();
  private readonly pending = new Set<Promise<void>>();
  private started = false;
  private stopped = false;

  constructor(
    private readonly page: Page,
    private readonly timeline: Timeline,
    ids: V1ObserverScopeIds
  ) {
    this.observerScopeId = ids.next();
    this.recognizer = new V1CorrelationRecognizer(timeline.runId);
  }

  async start(): Promise<void> {
    if (this.started || this.stopped) throw new Error('V1 observer can only be started once');
    this.session = await this.page.context().newCDPSession(this.page);
    this.session.on('Network.requestWillBeSent', this.onRequestWillBeSent);
    this.session.on('Network.responseReceived', this.onResponseReceived);
    this.session.on('Network.loadingFinished', this.onLoadingFinished);
    this.session.on('Network.loadingFailed', this.onLoadingFailed);
    try {
      this.started = true;
      this.rawMarkerObserver = new RawChildMarkerObserver(this.session, this.timeline.runId, (marker) => {
        this.recognizer.observeCompletionMarker(marker);
      });
      await this.rawMarkerObserver.start();
      await this.session.send('Network.enable');
    } catch (error) {
      this.removeListeners();
      await this.rawMarkerObserver?.stop().catch(() => undefined);
      this.rawMarkerObserver = undefined;
      const session = this.session;
      this.session = undefined;
      try { await session.detach(); } catch { /* The attach may already have failed. */ }
      this.stopped = true;
      throw error;
    }
  }

  async stop(): Promise<{ result: V1CorrelationResult; events: TraceEvent[] }> {
    if (this.stopped) throw new Error('V1 observer has already stopped');
    this.stopped = true;
    this.removeListeners();
    await this.rawMarkerObserver?.stop();
    this.rawMarkerObserver = undefined;
    await Promise.allSettled([...this.pending]);
    const session = this.session;
    this.session = undefined;
    if (session) {
      try { await session.detach(); } catch { /* The browser may have disconnected. */ }
    }
    const result = this.recognizer.finalize();
    const events = emitV1CorrelationEvents(this.timeline, result, { observerScopeId: this.observerScopeId });
    return { result, events };
  }

  private readonly onRequestWillBeSent = (params: RequestWillBeSent): void => {
    if (!this.started || this.stopped || !params?.requestId || !params.request) return;
    const contentType = Object.entries(params.request.headers ?? {}).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
    const evidence = extractV1RequestEvidence({
      runId: this.timeline.runId,
      requestId: params.requestId,
      url: params.request.url,
      method: params.request.method,
      resourceType: params.type ?? '',
      ...(contentType === undefined ? {} : { contentType }),
      ...(params.request.postData === undefined ? {} : { postData: params.request.postData })
    });
    if (!evidence) return;
    this.candidateRequests.add(params.requestId);
    this.recognizer.observeRequest(evidence);
  };

  private readonly onResponseReceived = (params: ResponseReceived): void => {
    if (!this.started || this.stopped || !this.candidateRequests.has(params?.requestId)) return;
    this.responseCounts.set(params.requestId, (this.responseCounts.get(params.requestId) ?? 0) + 1);
  };

  private readonly onLoadingFinished = (params: RequestTerminal): void => {
    if (!this.started || this.stopped || !this.candidateRequests.has(params?.requestId)) return;
    const requestId = params.requestId;
    this.recognizer.observeTransportFinished(this.timeline.runId, requestId);
    if (this.responseCaptured.has(requestId)) return;
    this.responseCaptured.add(requestId);
    const responseCount = this.responseCounts.get(requestId) ?? 0;
    if (responseCount === 0) return;
    const task = this.readCandidateResponse(requestId, responseCount);
    this.pending.add(task);
    void task.then(() => this.pending.delete(task), () => this.pending.delete(task));
  };

  private readonly onLoadingFailed = (params: RequestTerminal): void => {
    if (!this.started || this.stopped || !this.candidateRequests.has(params?.requestId)) return;
    this.recognizer.observeTransportFailure(this.timeline.runId, params.requestId);
  };

  private async readCandidateResponse(requestId: string, count: number): Promise<void> {
    let evidence: ReturnType<typeof extractV1ResponseEvidence>;
    try {
      const response = await this.session?.send('Network.getResponseBody', { requestId }) as ResponseBody | undefined;
      if (!response || typeof response.body !== 'string') throw new Error('Missing body');
      const body = response.base64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body;
      if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BODY_BYTES) throw new Error('Response exceeds bounded inspection size');
      evidence = extractV1ResponseEvidence({ runId: this.timeline.runId, requestId, body });
    } catch {
      evidence = undefined;
    }
    const reduced = evidence ?? { runId: this.timeline.runId, requestId, correlationTokens: [] };
    for (let index = 0; index < count; index += 1) this.recognizer.observeResponse(reduced);
  }

  private removeListeners(): void {
    this.session?.off('Network.requestWillBeSent', this.onRequestWillBeSent);
    this.session?.off('Network.responseReceived', this.onResponseReceived);
    this.session?.off('Network.loadingFinished', this.onLoadingFinished);
    this.session?.off('Network.loadingFailed', this.onLoadingFailed);
  }
}
