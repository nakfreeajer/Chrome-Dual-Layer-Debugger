import { GasAdapter, type GasDiscoveryResult } from '../gas/GasAdapter.js';
import type { DiscoveryResult, DiscoveredFrame, DiscoveredPage } from '../browser/BrowserDiscovery.js';
import { PlaywrightBrowserDiscovery } from '../browser/PlaywrightBrowserDiscovery.js';
import { mapCrossLayerIdentities, type CrossLayerMappingResult } from '../core/CrossLayerMapper.js';
import { emitSessionEvent } from '../trace/DiscoveryEvents.js';
import { Timeline } from '../trace/Timeline.js';
import { FileJsonlTraceWriter } from '../trace/JsonlTraceWriter.js';
import { resolveFailureArtifactPath } from '../testing/FailureArtifact.js';

export const DISCOVERY_CLI_CONTRACT = Object.freeze({ contractId: 'cdld.discovery-cli', contractVersion: 1 } as const);

export interface DiscoveryContractOptions {
  endpoint: string;
  timelinePath: string;
}

export interface DiscoveryContractDependencies {
  createDiscovery(endpoint: string): { discover(): Promise<DiscoveryResult>; disconnect(): Promise<void> };
  createGasAdapter(): { discover(page: DiscoveredPage, endpoint: string): Promise<GasDiscoveryResult | { active: false; reason: 'BROWSER_ONLY' }>; disconnect(): Promise<void> };
  createTimeline(): Timeline;
  writeTimeline(path: string, timeline: Timeline): Promise<void>;
  writeOutput(line: string): void;
}

type DisconnectState = 'COMPLETED' | 'FAILED' | 'NOT_ATTEMPTED';
type MappingState = 'PROVEN' | 'UNKNOWN' | 'AMBIGUOUS';

interface SafeFrame {
  frameId: string;
  protocolFrameId?: string;
  children: SafeFrame[];
}

interface SafeGasEvidence {
  targets: Array<{ targetId: string; type: string }>;
  sessions: Array<{ targetId: string; sessionId: string; parentSessionId: string; detached: boolean }>;
  frames: Array<{ targetId: string; sessionId: string; frameId: string; parentFrameId: string }>;
  contexts: Array<{ targetId: string; sessionId: string; executionContextId: number; frameId: string; defaultWorld: boolean; ignored: boolean; alive: boolean }>;
}

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function safeIdentity(value: unknown): value is string {
  return typeof value === 'string' && identityPattern.test(value);
}

function safeFrame(frame: DiscoveredFrame): SafeFrame | null {
  if (!safeIdentity(frame.frameId) || (frame.protocolFrameId !== undefined && !safeIdentity(frame.protocolFrameId))) return null;
  const children: SafeFrame[] = [];
  for (const child of frame.children) {
    const normalized = safeFrame(child);
    if (!normalized) return null;
    children.push(normalized);
  }
  return { frameId: frame.frameId, ...(frame.protocolFrameId ? { protocolFrameId: frame.protocolFrameId } : {}), children };
}

function flattenSafeFrames(frames: SafeFrame[]): SafeFrame[] {
  return frames.flatMap((frame) => [frame, ...flattenSafeFrames(frame.children)]);
}

function safeBrowser(result: DiscoveryResult): {
  status: 'DISCOVERED' | 'MALFORMED_EVIDENCE';
  classification: 'BROWSER_ONLY' | 'BROWSER_PLUS_GAS' | 'MIXED' | 'UNKNOWN';
  contexts: Array<{ contextId: string; pages: Array<{ pageId: string; mode: string; frames: SafeFrame[]; executionContextIds: number[] }> }>;
} {
  const modes = new Set<string>();
  const contexts = [] as Array<{ contextId: string; pages: Array<{ pageId: string; mode: string; frames: SafeFrame[]; executionContextIds: number[] }> }>;
  let malformed = false;
  for (const context of result.contexts) {
    if (!safeIdentity(context.contextId)) { malformed = true; continue; }
    const pages = [] as typeof contexts[number]['pages'];
    for (const page of context.pages) {
      if (!safeIdentity(page.pageId) || !['BROWSER_ONLY', 'BROWSER_PLUS_GAS'].includes(page.mode)
        || page.executionContextIds.some((id) => !Number.isSafeInteger(id) || id < 0)) { malformed = true; continue; }
      const frames = [] as SafeFrame[];
      for (const frame of page.frames) {
        const normalized = safeFrame(frame);
        if (!normalized) { malformed = true; break; }
        frames.push(normalized);
      }
      if (malformed) continue;
      modes.add(page.mode);
      pages.push({ pageId: page.pageId, mode: page.mode, frames, executionContextIds: [...page.executionContextIds] });
    }
    contexts.push({ contextId: context.contextId, pages });
  }
  const classification = malformed || modes.size === 0 ? 'UNKNOWN'
    : modes.size > 1 ? 'MIXED' : [...modes][0] as 'BROWSER_ONLY' | 'BROWSER_PLUS_GAS';
  return { status: malformed ? 'MALFORMED_EVIDENCE' : 'DISCOVERED', classification, contexts };
}

function safeGas(gas: GasDiscoveryResult): SafeGasEvidence | null {
  if (!safeIdentity(gas.selectedTargetId) || !safeIdentity(gas.attachedSessionId)) return null;
  const targets = gas.targets.map((target) => ({ targetId: target.targetId, type: target.type }));
  const sessions = gas.sessions.map((session) => ({ targetId: session.targetId, sessionId: session.sessionId,
    parentSessionId: session.parentSessionId, detached: session.detached }));
  const frames = gas.frames.map((frame) => ({ targetId: frame.targetId, sessionId: frame.sessionId, frameId: frame.frameId, parentFrameId: frame.parentFrameId }));
  const contexts = gas.contexts.map((context) => ({ targetId: context.targetId, sessionId: context.sessionId,
    executionContextId: context.executionContextId, frameId: context.frameId, defaultWorld: context.defaultWorld,
    ignored: context.ignored, alive: context.alive }));
  if (targets.some((item) => !safeIdentity(item.targetId) || !['page', 'iframe'].includes(item.type))
    || sessions.some((item) => !safeIdentity(item.targetId) || !safeIdentity(item.sessionId) || (item.parentSessionId !== '' && !safeIdentity(item.parentSessionId)))
    || frames.some((item) => !safeIdentity(item.targetId) || !safeIdentity(item.sessionId) || !safeIdentity(item.frameId) || (item.parentFrameId !== '' && !safeIdentity(item.parentFrameId)))
    || contexts.some((item) => !safeIdentity(item.targetId) || !safeIdentity(item.sessionId) || !Number.isSafeInteger(item.executionContextId)
      || item.executionContextId < 0 || !safeIdentity(item.frameId))) return null;
  const targetIds = new Set(targets.map((item) => item.targetId));
  const sessionsById = new Map<string, SafeGasEvidence['sessions'][number]>();
  for (const session of sessions) {
    if (!targetIds.has(session.targetId)) return null;
    const prior = sessionsById.get(session.sessionId);
    if (prior && prior.targetId !== session.targetId) return null;
    sessionsById.set(session.sessionId, session);
  }
  if (sessionsById.get(gas.attachedSessionId)?.targetId !== gas.selectedTargetId
    || gas.attachedTargets.some((attached) => sessionsById.get(attached.sessionId)?.targetId !== attached.targetId)
    || frames.some((frame) => sessionsById.get(frame.sessionId)?.targetId !== frame.targetId)
    || contexts.some((context) => sessionsById.get(context.sessionId)?.targetId !== context.targetId)) return null;
  return { targets, sessions, frames, contexts };
}

function mappingStates(page: DiscoveredPage, gas: GasDiscoveryResult, mappings: CrossLayerMappingResult, validEvidence: boolean) {
  const frames = flattenSafeFrames((page.frames.map(safeFrame).filter(Boolean) as SafeFrame[]));
  const uniqueCandidates = (frameId: string): Set<string> => {
    const candidates = new Set<string>();
    for (const item of gas.frames) if (item.frameId === frameId) candidates.add(`${item.targetId}\0${item.sessionId}\0${item.frameId}`);
    for (const item of gas.contexts) if (item.frameId === frameId) candidates.add(`${item.targetId}\0${item.sessionId}\0${item.frameId}`);
    return candidates;
  };
  const proven = new Set(mappings.provenFrames.map((item) => item.playwrightFrameId));
  return {
    pageToGasTarget: { state: 'UNKNOWN' as const, reason: 'PLAYWRIGHT_TARGET_ID_NOT_EXPOSED' },
    frames: frames.map((frame) => {
      if (!validEvidence || !frame.protocolFrameId) return { playwrightFrameId: frame.frameId, state: 'UNKNOWN' as MappingState };
      const candidates = uniqueCandidates(frame.protocolFrameId);
      if (candidates.size > 1) return { playwrightFrameId: frame.frameId, protocolFrameId: frame.protocolFrameId, state: 'AMBIGUOUS' as MappingState };
      if (candidates.size === 1 && proven.has(frame.frameId)) return { playwrightFrameId: frame.frameId, protocolFrameId: frame.protocolFrameId, state: 'PROVEN' as MappingState };
      return { playwrightFrameId: frame.frameId, protocolFrameId: frame.protocolFrameId, state: 'UNKNOWN' as MappingState };
    }),
    provenFrames: validEvidence ? mappings.provenFrames : [],
    provenContexts: validEvidence ? mappings.provenContexts.filter((mapping) => gas.contexts.some((context) =>
      context.targetId === mapping.gasTargetId && context.sessionId === mapping.gasSessionId && context.frameId === mapping.gasFrameId
        && context.executionContextId === mapping.executionContextId && context.alive && context.defaultWorld && !context.ignored)) : [],
    gasContexts: gas.contexts.map((context) => ({ targetId: context.targetId, sessionId: context.sessionId,
      executionContextId: context.executionContextId, frameId: context.frameId,
      state: validEvidence && mappings.provenContexts.some((item) => item.gasTargetId === context.targetId && item.gasSessionId === context.sessionId
        && item.executionContextId === context.executionContextId && context.alive && context.defaultWorld && !context.ignored)
        ? 'PROVEN' as MappingState : 'UNKNOWN' as MappingState }))
  };
}

export function parseDiscoveryContractOptions(args: string[]): DiscoveryContractOptions {
  const values = new Map<string, string>();
  const allowed = new Set(['--format', '--endpoint', '--timeline']);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error('DISCOVERY_OPTIONS_INVALID');
    if (values.has(flag)) throw new Error('DISCOVERY_OPTIONS_INVALID');
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('DISCOVERY_OPTIONS_INVALID');
    values.set(flag, value);
    index += 1;
  }
  if (values.get('--format') !== 'json') throw new Error('DISCOVERY_OPTIONS_INVALID');
  const endpoint = values.get('--endpoint') ?? 'http://127.0.0.1:9222';
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new Error('DISCOVERY_OPTIONS_INVALID'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('DISCOVERY_OPTIONS_INVALID');
  }
  return { endpoint, timelinePath: values.get('--timeline') ?? '.agent-work/artifacts/timeline.jsonl' };
}

function defaultDependencies(): DiscoveryContractDependencies {
  return {
    createDiscovery: (endpoint) => new PlaywrightBrowserDiscovery(endpoint),
    createGasAdapter: () => new GasAdapter(),
    createTimeline: () => new Timeline(),
    async writeTimeline(path, timeline) {
      const writer = new FileJsonlTraceWriter(resolveFailureArtifactPath(path));
      try { for (const event of timeline.snapshot()) await writer.write(event); }
      finally { await writer.close(); }
    },
    writeOutput: (line) => console.log(line)
  };
}

/** Versioned, read-only machine contract. It reports evidence and explicit uncertainty, never ownership. */
export async function runDiscoveryContractCli(args: string[], overrides: Partial<DiscoveryContractDependencies> = {}): Promise<number> {
  const dependencies = { ...defaultDependencies(), ...overrides };
  const timeline = dependencies.createTimeline();
  let options: DiscoveryContractOptions;
  try { options = parseDiscoveryContractOptions(args); }
  catch {
    dependencies.writeOutput(JSON.stringify({ ...DISCOVERY_CLI_CONTRACT, outcome: 'FAILED', runId: timeline.runId,
      errorCode: 'INVALID_OPTIONS', browser: { status: 'NOT_STARTED', classification: 'UNKNOWN', contexts: [] }, gas: [],
      mappings: { provenFrames: [], provenContexts: [], unresolved: [] },
      cleanup: { gasAdapterDisconnects: [], browserDiscoveryDisconnect: 'NOT_ATTEMPTED', fixtureOwnership: 'NOT_ASSESSED' },
      timeline: { eventCount: 0, eventTypes: [] } }));
    return 1;
  }

  emitSessionEvent(timeline, 'SESSION_STARTED');
  const gasAdapters: Array<{ pageId: string; adapter: ReturnType<typeof dependencies.createGasAdapter> }> = [];
  let discovery: ReturnType<typeof dependencies.createDiscovery> | undefined;
  let browserResult: DiscoveryResult | undefined;
  let browserView: ReturnType<typeof safeBrowser> = { status: 'DISCOVERED', classification: 'UNKNOWN', contexts: [] };
  const gasPages: Array<Record<string, unknown>> = [];
  const mappingsOut: Array<Record<string, unknown>> = [];
  let errorCode: string | undefined;
  let browserDisconnect: DisconnectState = 'NOT_ATTEMPTED';
  const gasDisconnects: Array<{ pageId: string; status: DisconnectState }> = [];
  try {
    discovery = dependencies.createDiscovery(options.endpoint);
    browserResult = await discovery.discover();
    browserView = safeBrowser(browserResult);
    if (browserView.status !== 'DISCOVERED') errorCode = 'BROWSER_EVIDENCE_INVALID';
    for (const page of browserResult.contexts.flatMap((context) => context.pages)) {
      if (page.mode !== 'BROWSER_PLUS_GAS') continue;
      const adapter = dependencies.createGasAdapter();
      gasAdapters.push({ pageId: safeIdentity(page.pageId) ? page.pageId : 'UNKNOWN_PAGE', adapter });
      try {
        const gas = await adapter.discover(page, options.endpoint);
        if (!gas.active) {
          gasPages.push({ pageId: safeIdentity(page.pageId) ? page.pageId : null, status: 'UNKNOWN' });
          errorCode ??= 'GAS_CLASSIFICATION_CONFLICT';
          continue;
        }
        const safe = safeGas(gas);
        if (!safe) {
          gasPages.push({ pageId: safeIdentity(page.pageId) ? page.pageId : null, status: 'MALFORMED_EVIDENCE' });
          mappingsOut.push({ pageToGasTarget: { state: 'UNKNOWN', reason: 'MALFORMED_GAS_EVIDENCE' }, frames: [], provenFrames: [], provenContexts: [], gasContexts: [] });
          errorCode ??= 'GAS_EVIDENCE_INVALID';
          continue;
        }
        const activeSessions = new Set(gas.sessions.filter((session) => !session.detached).map((session) => session.sessionId));
        const mappingGas: GasDiscoveryResult = { ...gas,
          frames: gas.frames.filter((frame) => activeSessions.has(frame.sessionId)),
          contexts: gas.contexts.filter((context) => activeSessions.has(context.sessionId) && context.alive && context.defaultWorld && !context.ignored) };
        const rawMappings = mapCrossLayerIdentities([page], mappingGas);
        const valid = rawMappings.provenFrames.every((item) => safeIdentity(item.pageId) && safeIdentity(item.playwrightFrameId)
          && safeIdentity(item.protocolFrameId) && safeIdentity(item.gasFrameId) && safeIdentity(item.gasSessionId) && safeIdentity(item.gasTargetId))
          && rawMappings.provenContexts.every((item) => Number.isSafeInteger(item.executionContextId));
        gasPages.push({ pageId: safeIdentity(page.pageId) ? page.pageId : null, status: 'DISCOVERED', ...safe });
        mappingsOut.push(mappingStates(page, mappingGas, rawMappings, valid));
      } catch {
        gasPages.push({ pageId: safeIdentity(page.pageId) ? page.pageId : null, status: 'FAILED' });
        mappingsOut.push({ pageToGasTarget: { state: 'UNKNOWN', reason: 'GAS_DISCOVERY_FAILED' },
          frames: [], provenFrames: [], provenContexts: [], gasContexts: [] });
        errorCode ??= 'GAS_DISCOVERY_FAILED';
      }
    }
  } catch {
    errorCode ??= 'BROWSER_DISCOVERY_FAILED';
  } finally {
    for (const { pageId, adapter } of gasAdapters) {
      let status: DisconnectState = 'COMPLETED';
      try { await adapter.disconnect(); } catch { status = 'FAILED'; errorCode ??= 'DISCONNECT_FAILED'; }
      gasDisconnects.push({ pageId, status });
    }
    if (discovery) {
      try { await discovery.disconnect(); browserDisconnect = 'COMPLETED'; }
      catch { browserDisconnect = 'FAILED'; errorCode ??= 'DISCONNECT_FAILED'; }
    }
    emitSessionEvent(timeline, 'SESSION_ENDED');
    try { await dependencies.writeTimeline(options.timelinePath, timeline); }
    catch { errorCode ??= 'TIMELINE_WRITE_FAILED'; }
  }

  const events = timeline.snapshot();
  const response = { ...DISCOVERY_CLI_CONTRACT,
    outcome: errorCode ? (browserResult ? 'PARTIAL' : 'FAILED') : 'COMPLETE',
    runId: timeline.runId,
    ...(errorCode ? { errorCode } : {}),
    browser: browserResult ? browserView : { status: 'UNKNOWN', classification: 'UNKNOWN', contexts: [] },
    gas: gasPages,
    mappings: { provenFrames: mappingsOut.flatMap((item) => item.provenFrames as unknown[] ?? []),
      provenContexts: mappingsOut.flatMap((item) => item.provenContexts as unknown[] ?? []),
      unresolved: mappingsOut.flatMap((item) => {
        const pageToGasTarget = item.pageToGasTarget as Record<string, unknown>;
        const frames = item.frames as Array<Record<string, unknown>>;
        const contexts = item.gasContexts as Array<Record<string, unknown>>;
        return [{ kind: 'PLAYWRIGHT_PAGE_TO_GAS_TARGET', state: pageToGasTarget.state, reason: pageToGasTarget.reason },
          ...frames.filter((frame) => frame.state !== 'PROVEN').map((frame) => ({ kind: 'PLAYWRIGHT_FRAME_TO_GAS_FRAME', ...frame })),
      ...contexts.filter((context) => context.state !== 'PROVEN').map((context) => ({ kind: 'GAS_CONTEXT_TO_PLAYWRIGHT_FRAME', ...context }))];
      }) },
    cleanup: { gasAdapterDisconnects: gasDisconnects, browserDiscoveryDisconnect: browserDisconnect, fixtureOwnership: 'NOT_ASSESSED' },
    timeline: { eventCount: events.length, eventTypes: events.map((event) => event.type) }
  };
  dependencies.writeOutput(JSON.stringify(response));
  return errorCode ? (browserResult ? 2 : 1) : 0;
}
