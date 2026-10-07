import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { TraceEvent } from '../trace/TraceEvent.js';
import type { Timeline } from '../trace/Timeline.js';
import type { AssertionPredicate, TestingBackendId } from './ActionContract.js';
import type { ActionOperation } from './ActionContract.js';

export const FAILURE_ARTIFACT_KIND = 'CDLD_TEST1D_FAILURE' as const;
export const FAILURE_ARTIFACT_MAX_BYTES = 256 * 1024;
function artifactRoot(): string { return resolve('.agent-work/artifacts'); }

export interface TimelineEventRef { runId: string; eventId: string; }
export interface ValueSummary { type: string; canonicalByteLength?: number; sha256?: string; unsupported?: true; }
export interface FailureArtifactInput {
  timeline: Timeline;
  backend: TestingBackendId;
  runnerKind: 'SMOKE' | 'MONKEY';
  scenarioId?: string;
  profileId?: string;
  stepId?: string;
  operation?: ActionOperation;
  predicate?: AssertionPredicate;
  errorCode?: string;
  stopReason?: string;
  target: { scopeKind: 'PAGE' | 'FRAME'; targetId: string; pageUrl: string; scopeUrl?: string };
  refs: readonly TimelineEventRef[];
  actual?: unknown;
  expected?: unknown;
  selector?: string;
  syntheticDetails?: boolean;
  diagnostics?: unknown;
  truncation?: string[];
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function canonical(value: unknown, seen = new Set<object>()): string | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : undefined;
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const items = value.map((item) => canonical(item, seen));
    seen.delete(value);
    return items.some((item) => item === undefined) ? undefined : `[${items.join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    if (Object.getPrototypeOf(object) !== Object.prototype && Object.getPrototypeOf(object) !== null) return undefined;
    if (seen.has(object)) return undefined;
    seen.add(object);
    const keys = Object.keys(object).sort();
    const pairs: string[] = [];
    for (const key of keys) {
      const child = canonical(object[key], seen);
      if (child === undefined) { seen.delete(object); return undefined; }
      pairs.push(`${JSON.stringify(key)}:${child}`);
    }
    seen.delete(object);
    return `{${pairs.join(',')}}`;
  }
  return undefined;
}

export function summarizeFailureValue(value: unknown): ValueSummary {
  const serialized = canonical(value);
  if (serialized === undefined) return { type: typeOf(value), unsupported: true };
  const bytes = Buffer.from(serialized, 'utf8');
  return { type: typeOf(value), canonicalByteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export function resolveFailureArtifactPath(path: string): string {
  const full = resolve(path);
  const fromRoot = relative(artifactRoot(), full);
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) {
    throw new Error('Failure artifact path must be inside .agent-work/artifacts');
  }
  return full;
}

function privacySafeOrigin(value: string): Record<string, unknown> {
  try {
    const url = new URL(value);
    const origin = url.origin;
    return { protocol: url.protocol, loopback: ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname), sha256: createHash('sha256').update(origin).digest('hex') };
  } catch { return { protocol: 'invalid', loopback: false, invalid: true }; }
}

function correlationRelationship(timeline: Timeline, refs: readonly TimelineEventRef[], selected: readonly TraceEvent[]): string {
  const all = timeline.snapshot();
  const proofs = all.filter((event) => event.type === 'CORRELATION_PROVEN' && typeof event.correlationId === 'string');
  for (const event of selected) {
    if (event.correlationId && proofs.some((proof) => proof.correlationId === event.correlationId)) return 'PROVEN_BY_EXISTING_EVIDENCE';
    if (event.parentEventId && proofs.some((proof) => proof.eventId === event.parentEventId && proof.runId === event.runId)) return 'PROVEN_BY_EXISTING_EVIDENCE';
  }
  if (proofs.length && refs.some((ref) => ref.runId === timeline.runId)) return 'RUN_CONTEXT_ONLY';
  return 'UNKNOWN';
}

export function buildFailureArtifact(input: FailureArtifactInput): Record<string, unknown> {
  const timelineEvents = input.timeline.snapshot();
  const selected: TraceEvent[] = input.refs.map((ref) => {
    if (ref.runId !== input.timeline.runId) throw new Error('Failure artifact Timeline reference has foreign runId');
    const event = timelineEvents.find((candidate) => candidate.runId === ref.runId && candidate.eventId === ref.eventId);
    if (!event) throw new Error('Failure artifact Timeline reference does not exist');
    return event;
  });
  const refs = input.refs.map((ref) => ({ runId: ref.runId, eventId: ref.eventId }));
  const actualSummary = input.actual === undefined ? undefined : summarizeFailureValue(input.actual);
  const expectedSummary = input.expected === undefined ? undefined : summarizeFailureValue(input.expected);
  const detailAllowed = input.syntheticDetails === true;
  const targetOrigin = privacySafeOrigin(input.target.pageUrl);
  const diagnostics = input.diagnostics ?? { status: 'NOT_REQUESTED' };
  const artifact: Record<string, unknown> = {
    kind: FAILURE_ARTIFACT_KIND, schemaVersion: 1, runId: input.timeline.runId, backend: input.backend,
    runnerKind: input.runnerKind, ...(input.scenarioId ? { scenarioId: input.scenarioId } : {}), ...(input.profileId ? { profileId: input.profileId } : {}),
    ...(input.stepId ? { stepId: input.stepId } : {}), ...(input.operation ? { operation: input.operation } : {}), ...(input.predicate ? { predicate: input.predicate } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}), ...(input.stopReason ? { stopReason: input.stopReason } : {}),
    target: { scopeKind: input.target.scopeKind, targetId: input.target.targetId, origin: targetOrigin,
      ...(input.target.scopeUrl ? { scopeOrigin: privacySafeOrigin(input.target.scopeUrl) } : {}) },
    timelineRefs: refs, correlationRelationship: correlationRelationship(input.timeline, refs, selected),
    values: { ...(actualSummary ? { actual: actualSummary } : {}), ...(expectedSummary ? { expected: expectedSummary } : {}) },
    ...(input.selector === undefined ? {} : { selectorSummary: { type: 'string', length: input.selector.length, sha256: createHash('sha256').update(input.selector).digest('hex') } }),
    diagnostics, ...(input.truncation?.length ? { truncation: input.truncation } : {})
  };
  if (detailAllowed) {
    if (typeof input.selector === 'string' && input.selector.length <= 4096) artifact.selector = input.selector;
    for (const [key, value, summary] of [['actual', input.actual, actualSummary], ['expected', input.expected, expectedSummary]] as const) {
      if (value === undefined || !summary || summary.unsupported) continue;
      const raw = canonical(value);
      if (raw !== undefined && Buffer.byteLength(raw, 'utf8') <= 4096) (artifact as Record<string, unknown>)[`${key}Raw`] = value;
    }
  }
  const bytes = Buffer.from(JSON.stringify(artifact), 'utf8');
  if (bytes.length > FAILURE_ARTIFACT_MAX_BYTES) {
    delete artifact.selector; delete artifact.actualRaw; delete artifact.expectedRaw;
    const compactDiagnostics: Record<string, unknown> = {};
    if (diagnostics && typeof diagnostics === 'object') {
      for (const key of ['dom', 'runtime', 'screenshot']) {
        const component = (diagnostics as Record<string, unknown>)[key];
        compactDiagnostics[key] = component && typeof component === 'object' ? { status: (component as Record<string, unknown>).status ?? 'OMITTED_SIZE_LIMIT' } : { status: 'OMITTED_SIZE_LIMIT' };
      }
    }
    artifact.diagnostics = compactDiagnostics;
    artifact.truncation = [...(input.truncation ?? []), 'OPTIONAL_DETAILS_DROPPED_SIZE_LIMIT'];
  }
  if (Buffer.byteLength(JSON.stringify(artifact), 'utf8') >= FAILURE_ARTIFACT_MAX_BYTES) throw new Error('Minimal failure artifact exceeds size limit');
  return artifact;
}

export async function writeFailureArtifact(path: string, artifact: Record<string, unknown>): Promise<void> {
  const full = resolveFailureArtifactPath(path);
  const bytes = Buffer.from(`${JSON.stringify(artifact)}\n`, 'utf8');
  if (bytes.length > FAILURE_ARTIFACT_MAX_BYTES) throw new Error('Failure artifact exceeds size limit');
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes, { flag: 'wx' });
}
