import type { Timeline } from '../trace/Timeline.js';
import type { TraceEvent } from '../trace/TraceEvent.js';

const CORRELATION_TOKEN = /^V01H-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVER_EXECUTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Privacy-minimized CDP request evidence. Never pass a raw body; token arrays
 * contain distinct token values, with identical wire occurrences collapsed. */
export interface V1RequestEvidence {
  runId: string;
  requestId: string;
  contractVersion?: unknown;
  correlationTokens: readonly string[];
}

/** Privacy-minimized CDP response evidence. Never pass a raw body; token arrays
 * contain distinct token values, with identical wire occurrences collapsed. */
export interface V1ResponseEvidence {
  runId: string;
  requestId: string;
  correlationTokens: readonly string[];
  serverExecutionIds?: readonly string[];
}

/** Explicit application completion marker evidence. */
export interface V1CompletionMarkerEvidence {
  runId: string;
  markerName: string;
  contractVersion?: unknown;
  correlationToken: string;
  serverExecutionId?: string;
  outcome?: string;
}

export type V1CorrelationRejectionReason =
  | 'INVALID_REQUEST_ID'
  | 'DUPLICATE_REQUEST_EVIDENCE'
  | 'MISSING_REQUEST_TOKEN'
  | 'MULTIPLE_REQUEST_TOKENS'
  | 'MALFORMED_REQUEST_TOKEN'
  | 'MISSING_REQUEST_VERSION'
  | 'UNKNOWN_REQUEST_VERSION'
  | 'DUPLICATE_TOKEN_CLAIM'
  | 'MISSING_RESPONSE'
  | 'RESPONSE_REQUEST_ID_MISMATCH'
  | 'DUPLICATE_RESPONSE_EVIDENCE'
  | 'MISSING_RESPONSE_TOKEN'
  | 'MULTIPLE_RESPONSE_TOKENS'
  | 'MALFORMED_RESPONSE_TOKEN'
  | 'RESPONSE_TOKEN_MISMATCH'
  | 'MALFORMED_RESPONSE_SERVER_EXECUTION_ID'
  | 'MISSING_COMPLETION_MARKER'
  | 'DUPLICATE_COMPLETION_MARKER'
  | 'CONFLICTING_COMPLETION_OUTCOME'
  | 'INVALID_COMPLETION_MARKER_NAME'
  | 'MISSING_MARKER_VERSION'
  | 'UNKNOWN_MARKER_VERSION'
  | 'MARKER_TOKEN_MISMATCH'
  | 'MALFORMED_MARKER_SERVER_EXECUTION_ID'
  | 'MISSING_MARKER_OUTCOME'
  | 'UNKNOWN_MARKER_OUTCOME'
  | 'SERVER_EXECUTION_ID_CONFLICT'
  | 'TRANSPORT_FAILURE'
  | 'INCOMPLETE_TRANSPORT'
  | 'DUPLICATE_TRANSPORT_TERMINAL_EVIDENCE'
  | 'FOREIGN_RUN_EVIDENCE';

export interface ProvenV1Correlation {
  requestId: string;
  correlationId: string;
  serverExecutionId: string;
  outcome: 'success' | 'failure';
  contractVersion: 1;
}

export interface UncorrelatedV1Candidate {
  requestId?: string;
  reason: V1CorrelationRejectionReason;
  /** False for ordinary traffic with no token and no declared contract version. */
  emitTraceEvent: boolean;
}

export interface V1CorrelationResult {
  runId: string;
  proven: readonly ProvenV1Correlation[];
  uncorrelated: readonly UncorrelatedV1Candidate[];
}

interface RequestRecord {
  evidence: V1RequestEvidence;
  duplicate: boolean;
}

/**
 * Run-scoped, order-independent V1 evidence recognizer. It deliberately emits
 * no proof until finalize(), so a later duplicate token claim can invalidate
 * every competing request before any correlationId is assigned.
 */
export class V1CorrelationRecognizer {
  private readonly requests = new Map<string, RequestRecord>();
  private readonly responses = new Map<string, V1ResponseEvidence[]>();
  private readonly markers: V1CompletionMarkerEvidence[] = [];
  private readonly transportFinished = new Map<string, number>();
  private readonly transportFailures = new Set<string>();
  private readonly foreignEvidence = new Set<V1CorrelationRejectionReason>();
  private finalized = false;

  constructor(readonly runId: string) {
    if (!runId.trim()) throw new Error('V1 recognizer runId must be non-empty');
  }

  observeRequest(evidence: V1RequestEvidence): void {
    this.assertOpen();
    if (!this.sameRun(evidence.runId)) return;
    const previous = this.requests.get(evidence.requestId);
    if (previous) previous.duplicate = true;
    else this.requests.set(evidence.requestId, { evidence: this.copyRequest(evidence), duplicate: false });
  }

  observeResponse(evidence: V1ResponseEvidence): void {
    this.assertOpen();
    if (!this.sameRun(evidence.runId)) return;
    const entries = this.responses.get(evidence.requestId) ?? [];
    entries.push({
      runId: evidence.runId,
      requestId: evidence.requestId,
      correlationTokens: [...evidence.correlationTokens],
      ...(evidence.serverExecutionIds === undefined ? {} : { serverExecutionIds: [...evidence.serverExecutionIds] })
    });
    this.responses.set(evidence.requestId, entries);
  }

  observeCompletionMarker(evidence: V1CompletionMarkerEvidence): void {
    this.assertOpen();
    if (!this.sameRun(evidence.runId)) return;
    this.markers.push({ ...evidence });
  }

  observeTransportFinished(runId: string, requestId: string): void {
    this.assertOpen();
    if (!this.sameRun(runId)) return;
    this.transportFinished.set(requestId, (this.transportFinished.get(requestId) ?? 0) + 1);
  }

  observeTransportFailure(runId: string, requestId: string): void {
    this.assertOpen();
    if (!this.sameRun(runId)) return;
    this.transportFailures.add(requestId);
  }

  finalize(): V1CorrelationResult {
    this.assertOpen();
    this.finalized = true;

    const claims = new Map<string, string[]>();
    for (const [requestId, record] of this.requests) {
      for (const token of record.evidence.correlationTokens) {
        if (!CORRELATION_TOKEN.test(token)) continue;
        const claimants = claims.get(token) ?? [];
        claimants.push(requestId);
        claims.set(token, claimants);
      }
    }

    const proven: ProvenV1Correlation[] = [];
    const uncorrelated: UncorrelatedV1Candidate[] = [...this.foreignEvidence].map((reason) => ({ reason, emitTraceEvent: true }));

    for (const [requestId, record] of this.requests) {
      const req = record.evidence;
      const candidate = req.contractVersion !== undefined || req.correlationTokens.length > 0;
      if (!candidate && !record.duplicate) continue;

      const reject = (reason: V1CorrelationRejectionReason): void => {
        uncorrelated.push({ ...(requestId ? { requestId } : {}), reason, emitTraceEvent: candidate || record.duplicate });
      };

      if (!requestId.trim()) { reject('INVALID_REQUEST_ID'); continue; }
      if (record.duplicate) { reject('DUPLICATE_REQUEST_EVIDENCE'); continue; }
      if (req.correlationTokens.length === 0) { reject('MISSING_REQUEST_TOKEN'); continue; }
      if (req.correlationTokens.length !== 1) { reject('MULTIPLE_REQUEST_TOKENS'); continue; }
      const token = req.correlationTokens[0];
      if (!CORRELATION_TOKEN.test(token)) { reject('MALFORMED_REQUEST_TOKEN'); continue; }
      if (req.contractVersion === undefined) { reject('MISSING_REQUEST_VERSION'); continue; }
      if (req.contractVersion !== 1) { reject('UNKNOWN_REQUEST_VERSION'); continue; }
      if ((claims.get(token)?.length ?? 0) !== 1) { reject('DUPLICATE_TOKEN_CLAIM'); continue; }

      if (this.transportFailures.has(requestId)) { reject('TRANSPORT_FAILURE'); continue; }
      if ((this.transportFinished.get(requestId) ?? 0) === 0) { reject('INCOMPLETE_TRANSPORT'); continue; }
      if ((this.transportFinished.get(requestId) ?? 0) !== 1) { reject('DUPLICATE_TRANSPORT_TERMINAL_EVIDENCE'); continue; }

      const responseEvidence = this.responses.get(requestId) ?? [];
      if (responseEvidence.length === 0) {
        const tokenOnOtherRequest = [...this.responses.values()].flat().some((response) => response.requestId !== requestId && response.correlationTokens.includes(token));
        reject(tokenOnOtherRequest ? 'RESPONSE_REQUEST_ID_MISMATCH' : 'MISSING_RESPONSE');
        continue;
      }
      if (responseEvidence.length !== 1) { reject('DUPLICATE_RESPONSE_EVIDENCE'); continue; }
      const response = responseEvidence[0];
      if (response.correlationTokens.length === 0) { reject('MISSING_RESPONSE_TOKEN'); continue; }
      if (response.correlationTokens.length !== 1) { reject('MULTIPLE_RESPONSE_TOKENS'); continue; }
      const responseToken = response.correlationTokens[0];
      if (!CORRELATION_TOKEN.test(responseToken)) { reject('MALFORMED_RESPONSE_TOKEN'); continue; }
      if (responseToken !== token) { reject('RESPONSE_TOKEN_MISMATCH'); continue; }
      if (response.serverExecutionIds && response.serverExecutionIds.length > 1) { reject('MALFORMED_RESPONSE_SERVER_EXECUTION_ID'); continue; }
      const responseServerId = response.serverExecutionIds?.[0];
      if (responseServerId !== undefined && !SERVER_EXECUTION_ID.test(responseServerId)) { reject('MALFORMED_RESPONSE_SERVER_EXECUTION_ID'); continue; }

      const markerIndexes = this.markers.filter((marker) => marker.correlationToken === token);
      if (markerIndexes.length === 0) { reject('MISSING_COMPLETION_MARKER'); continue; }
      if (markerIndexes.length !== 1) {
        const outcomes = new Set(markerIndexes.map((marker) => marker.outcome));
        const executionIds = new Set(markerIndexes.map((marker) => marker.serverExecutionId));
        reject(outcomes.size > 1 ? 'CONFLICTING_COMPLETION_OUTCOME' : executionIds.size > 1 ? 'SERVER_EXECUTION_ID_CONFLICT' : 'DUPLICATE_COMPLETION_MARKER');
        continue;
      }
      const marker = markerIndexes[0];
      if (marker.markerName !== 'CDLD_CORRELATION_V1') { reject('INVALID_COMPLETION_MARKER_NAME'); continue; }
      if (marker.contractVersion === undefined) { reject('MISSING_MARKER_VERSION'); continue; }
      if (marker.contractVersion !== 1) { reject('UNKNOWN_MARKER_VERSION'); continue; }
      if (marker.correlationToken !== token) { reject('MARKER_TOKEN_MISMATCH'); continue; }
      if (!marker.serverExecutionId || !SERVER_EXECUTION_ID.test(marker.serverExecutionId)) { reject('MALFORMED_MARKER_SERVER_EXECUTION_ID'); continue; }
      if (!marker.outcome) { reject('MISSING_MARKER_OUTCOME'); continue; }
      if (marker.outcome !== 'success' && marker.outcome !== 'failure') { reject('UNKNOWN_MARKER_OUTCOME'); continue; }
      if (responseServerId !== undefined && responseServerId !== marker.serverExecutionId) { reject('SERVER_EXECUTION_ID_CONFLICT'); continue; }

      proven.push({
        requestId,
        correlationId: token,
        serverExecutionId: marker.serverExecutionId,
        outcome: marker.outcome,
        contractVersion: 1
      });
    }

    // An unmatched explicit marker is diagnostic evidence, never a correlation.
    const requestTokenClaims = new Set([...this.requests.values()].flatMap(({ evidence }) => evidence.correlationTokens));
    this.markers.forEach((marker) => {
      if (requestTokenClaims.has(marker.correlationToken)) return;
      if (marker.markerName === 'CDLD_CORRELATION_V1' || marker.correlationToken) {
        uncorrelated.push({ reason: 'MARKER_TOKEN_MISMATCH', emitTraceEvent: true });
      }
    });

    return { runId: this.runId, proven, uncorrelated };
  }

  private sameRun(runId: string): boolean {
    if (runId === this.runId) return true;
    this.foreignEvidence.add('FOREIGN_RUN_EVIDENCE');
    return false;
  }

  private copyRequest(evidence: V1RequestEvidence): V1RequestEvidence {
    return { runId: evidence.runId, requestId: evidence.requestId, contractVersion: evidence.contractVersion, correlationTokens: [...evidence.correlationTokens] };
  }

  private assertOpen(): void {
    if (this.finalized) throw new Error('V1 recognizer has already been finalized');
  }
}

/** Emit only proven identity or bounded reason-code evidence into the shared Timeline. */
export function emitV1CorrelationEvents(
  timeline: Timeline,
  result: V1CorrelationResult,
  options: { observerScopeId?: string } = {}
): TraceEvent[] {
  if (timeline.runId !== result.runId) throw new Error('Correlation result runId must match Timeline');
  const emitted: TraceEvent[] = [];
  for (const proof of result.proven) {
    const event = timeline.create({
      source: 'TRACE',
      category: 'CORRELATION',
      type: 'CORRELATION_PROVEN',
      correlationId: proof.correlationId,
      data: {
        contractVersion: proof.contractVersion,
        ...(options.observerScopeId ? { observerScopeId: options.observerScopeId } : {}),
        requestId: proof.requestId,
        serverExecutionId: proof.serverExecutionId,
        outcome: proof.outcome,
        status: 'CORRELATED',
        versionEvidence: ['request', 'completion-marker']
      }
    });
    timeline.append(event);
    emitted.push(event);
  }
  for (const candidate of result.uncorrelated) {
    if (!candidate.emitTraceEvent) continue;
    const event = timeline.create({
      source: 'TRACE',
      category: 'CORRELATION',
      type: 'CORRELATION_UNCORRELATED',
      data: {
        status: 'UNCORRELATED',
        reason: candidate.reason,
        ...(options.observerScopeId ? { observerScopeId: options.observerScopeId } : {}),
        ...(candidate.requestId ? { requestId: candidate.requestId } : {})
      }
    });
    timeline.append(event);
    emitted.push(event);
  }
  return emitted;
}
