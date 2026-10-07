import { createRequire } from 'node:module';
import { detectLayer } from '../core/LayerDetector.js';
import type { DiscoveredPage } from '../browser/BrowserDiscovery.js';

const require = createRequire(import.meta.url);

export interface GasTargetInfo {
  targetId: string;
  type: string;
  url: string;
}

export interface GasSessionInfo {
  sessionId: string;
  targetId: string;
  parentSessionId: string;
  detached: boolean;
}

export interface GasFrameInfo {
  frameId: string;
  sessionId: string;
  targetId: string;
  parentFrameId: string;
  url?: string;
}

export interface GasRuntimeContextInfo {
  targetId: string;
  sessionId: string;
  executionContextId: number;
  frameId: string;
  origin: string;
  name: string;
  defaultWorld: boolean;
  ignored: boolean;
  alive: boolean;
}

export interface GasDiscoveryResult {
  active: true;
  profileName: string;
  selectedTargetId: string;
  attachedSessionId: string;
  attachedTargets: Array<{ targetId: string; sessionId: string }>;
  profileTargetCandidates: string[];
  skippedAmbiguousProfileTargets: boolean;
  matchedRuntimeContext?: Pick<GasRuntimeContextInfo, 'targetId' | 'sessionId' | 'executionContextId' | 'frameId'>;
  targets: GasTargetInfo[];
  sessions: GasSessionInfo[];
  frames: GasFrameInfo[];
  contexts: GasRuntimeContextInfo[];
}

export interface InactiveGasResult {
  active: false;
  reason: 'BROWSER_ONLY';
}

interface DependencyState {
  registries: {
    targets: Map<string, Record<string, unknown>>;
    sessions: Map<string, Record<string, unknown>>;
    frames: Map<string, Record<string, unknown>>;
    contexts: Map<string, Record<string, unknown>>;
  };
}

export interface GasScopedCommand {
  targetId: string;
  sessionId: string;
  method: string;
  params?: Record<string, unknown>;
  executionContextId?: number;
  timeoutMs?: number;
  testAuthorization?: { mode: 'TEST'; targetId: string; fixtureId: string };
}

export interface GasTestTargetAuthorization {
  mode: 'TEST';
  targetId: string;
  fixtureId: string;
  approvalReference: string;
}

export interface GasTestTargetContext {
  targetId: string;
  sessionId: string;
  executionContextId: number;
  frameId: string;
  defaultWorld: boolean;
}

export interface GasRemoteDebugApi {
  connectBrowserCdp(options: { host: string; port: number }): Promise<DependencyState>;
  discoverTargets(state: DependencyState): Promise<Array<Record<string, unknown>>>;
  attachRecursive(state: DependencyState, options: { targetSelector: (target: Record<string, unknown>) => boolean }): Promise<{ targetInfo: Record<string, unknown>; sessionId: string } | null>;
  waitForDefaultContexts(state: DependencyState, options: {
    timeoutMs: number;
    pollMs: number;
    predicate?: (contexts: Array<Record<string, unknown>>) => Array<Record<string, unknown>> | false;
  }): Promise<unknown[] | null>;
  listRuntimeContexts(state: DependencyState, options?: { includeIgnoredContexts?: boolean }): Array<Record<string, unknown>>;
  findRuntimeContext(state: DependencyState, predicate: (probe: unknown, context: Record<string, unknown>) => boolean, options: { timeoutMs: number; pollMs: number; probeExpression: string }): Promise<Record<string, unknown> | null>;
  sendScopedCdpCommand?(state: DependencyState, request: GasScopedCommand): Promise<unknown>;
  disconnect(state: DependencyState): Promise<void>;
  redactSecrets(value: string): string;
  genericGasProfile: {
    name: string;
    targetSelector(target: Record<string, unknown>, options?: { targetType?: string }): boolean;
    buildProbeExpression(globals?: string[]): string;
    contextPredicate(probe: unknown, context: unknown, options?: { globals?: string[] }): boolean;
  };
}

const dependency = require('gas-remote-debug') as GasRemoteDebugApi;

export function redactGasSecrets(value: string): string {
  const redacted = dependency.redactSecrets(value);
  try {
    const url = new URL(redacted);
    url.pathname = url.pathname.replace(/(\/macros\/s\/)[^/]+/i, '$1[REDACTED]');
    if (url.search) {
      for (const key of url.searchParams.keys()) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return redacted;
  }
}

export function parseBrowserEndpoint(endpoint: string): { host: string; port: number } {
  const parsed = new URL(endpoint);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported browser debugging endpoint protocol: ${parsed.protocol}`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const secure = parsed.protocol === 'https:' || parsed.protocol === 'wss:';
  const port = Number(parsed.port || (secure ? 443 : 80));
  return { host, port };
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function idField(record: Record<string, unknown>, primary: string, fallback = ''): string {
  return stringField(record[primary]) || stringField(record[fallback]);
}

export class GasAdapter {
  private state?: DependencyState;
  private readonly api: GasRemoteDebugApi;

  constructor(api: GasRemoteDebugApi = dependency) {
    this.api = api;
  }

  async discover(page: DiscoveredPage, endpoint: string): Promise<GasDiscoveryResult | InactiveGasResult> {
    if (detectLayer(page.url) !== 'BROWSER_PLUS_GAS') return { active: false, reason: 'BROWSER_ONLY' };
    if (this.state) throw new Error('GasAdapter is already connected; disconnect before starting another discovery');

    const state = await this.api.connectBrowserCdp(parseBrowserEndpoint(endpoint));
    this.state = state;
    try {
      const targetInfos = await this.api.discoverTargets(state);
      const candidates = targetInfos.filter((target) =>
        target.type === 'page' && target.url === page.url && idField(target, 'targetId', 'id')
      );
      if (candidates.length !== 1) {
        throw new Error(`Expected one exact-URL page target for GAS discovery, found ${candidates.length}`);
      }
      const selectedTargetId = idField(candidates[0], 'targetId', 'id');
      const attached = await this.api.attachRecursive(state, {
        targetSelector: (target) => idField(target, 'targetId', 'id') === selectedTargetId
      });
      if (!attached) throw new Error('gas-remote-debug did not attach the selected existing GAS page target');

      const attachedTargets = [{ targetId: selectedTargetId, sessionId: attached.sessionId }];
      const profileCandidates = targetInfos.filter((target) => target.type === 'iframe'
        && this.api.genericGasProfile.targetSelector(target, { targetType: 'iframe' }));
      if (profileCandidates.length === 1) {
        const siblingTargetId = idField(profileCandidates[0], 'targetId', 'id');
        const siblingAttached = await this.api.attachRecursive(state, {
          targetSelector: (target) => idField(target, 'targetId', 'id') === siblingTargetId
        });
        if (siblingAttached) attachedTargets.push({ targetId: siblingTargetId, sessionId: siblingAttached.sessionId });
      }

      await this.api.waitForDefaultContexts(state, { timeoutMs: 5000, pollMs: 100 });
      const contexts = this.api.listRuntimeContexts(state, { includeIgnoredContexts: false })
        .filter((context) => typeof context.executionContextId === 'number');
      const globals = ['google', 'google.script'];
      const runtimeMatch = await this.api.findRuntimeContext(state,
        (probe) => this.api.genericGasProfile.contextPredicate(probe, null, { globals }),
        { timeoutMs: 5000, pollMs: 250, probeExpression: this.api.genericGasProfile.buildProbeExpression(globals) });
      const sessions = [...state.registries.sessions.values()];
      const frames = [...state.registries.frames.values()];
      const targets = [...state.registries.targets.values()];
      const sessionTargetIds = new Map(sessions.map((session) => [
        stringField(session.sessionId),
        stringField(session.targetId)
      ]));

      return {
        active: true,
        profileName: this.api.genericGasProfile.name,
        selectedTargetId,
        attachedSessionId: attached.sessionId,
        attachedTargets,
        profileTargetCandidates: profileCandidates.map((target) => idField(target, 'targetId', 'id')),
        skippedAmbiguousProfileTargets: profileCandidates.length > 1,
        ...(runtimeMatch && typeof runtimeMatch.executionContextId === 'number' ? {
          matchedRuntimeContext: {
            targetId: stringField(runtimeMatch.targetId),
            sessionId: stringField(runtimeMatch.sessionId),
            executionContextId: runtimeMatch.executionContextId,
            frameId: stringField(runtimeMatch.frameId)
          }
        } : {}),
        targets: targets.map((target) => ({
          targetId: idField(target, 'targetId', 'id'),
          type: stringField(target.type),
          url: this.api.redactSecrets(stringField(target.url))
        })),
        sessions: sessions.map((session) => ({
          sessionId: stringField(session.sessionId),
          targetId: stringField(session.targetId),
          parentSessionId: stringField(session.parentSessionId),
          detached: session.detached === true
        })),
        frames: frames.map((frame) => {
          const sessionId = stringField(frame.sessionId);
          return {
            frameId: stringField(frame.frameId),
            sessionId,
            targetId: sessionTargetIds.get(sessionId) || '',
            parentFrameId: stringField(frame.parentFrameId),
            ...(typeof frame.url === 'string' ? { url: this.api.redactSecrets(frame.url) } : {})
          };
        }),
        contexts: contexts.map((context) => ({
          targetId: stringField(context.targetId),
          sessionId: stringField(context.sessionId),
          executionContextId: context.executionContextId as number,
          frameId: stringField(context.frameId),
          origin: this.api.redactSecrets(stringField(context.origin)),
          name: stringField(context.name),
          defaultWorld: context.defaultWorld === true,
          ignored: context.ignored === true,
          alive: context.alive === true
        }))
      };
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  /** Attach an already-existing explicitly authorized synthetic TEST target by native targetId. */
  async connectTestTarget(endpoint: string, authorization: GasTestTargetAuthorization): Promise<GasTestTargetContext[]> {
    if (authorization.mode !== 'TEST' || !authorization.targetId.trim() || !authorization.fixtureId.trim() || !authorization.approvalReference.trim()) {
      throw new Error('A target-bound TEST authorization is required');
    }
    if (this.state) throw new Error('GasAdapter is already connected; disconnect before starting another discovery');
    const state = await this.api.connectBrowserCdp(parseBrowserEndpoint(endpoint));
    this.state = state;
    try {
      const targets = await this.api.discoverTargets(state);
      const matches = targets.filter((target) => idField(target, 'targetId', 'id') === authorization.targetId
        && (target.type === 'page' || target.type === 'iframe'));
      if (matches.length !== 1) throw new Error('Authorized TEST target is missing or ambiguous');
      const attached = await this.api.attachRecursive(state, {
        targetSelector: (target) => idField(target, 'targetId', 'id') === authorization.targetId
      });
      if (!attached) throw new Error('gas-remote-debug did not attach the authorized existing TEST target');
      const attachedSessionId = attached.sessionId;
      const readyContexts = await this.api.waitForDefaultContexts(state, {
        timeoutMs: 5000,
        pollMs: 100,
        predicate: (contexts) => {
          const exactContexts = contexts.filter((context) => context.targetId === authorization.targetId
            && context.sessionId === attachedSessionId
            && Number.isSafeInteger(context.executionContextId));
          return exactContexts.length > 0 ? exactContexts : false;
        }
      });
      if (!Array.isArray(readyContexts) || readyContexts.length === 0) {
        throw new Error('Authorized TEST target has no live default execution context');
      }
      const contexts = [...state.registries.contexts.values()]
        .filter((context) => context.targetId === authorization.targetId
          && context.sessionId === attachedSessionId
          && context.alive === true
          && context.defaultWorld === true
          && Number.isSafeInteger(context.executionContextId))
        .map((context) => ({
          targetId: authorization.targetId,
          sessionId: attachedSessionId,
          executionContextId: context.executionContextId as number,
          frameId: stringField(context.frameId),
          defaultWorld: true
        }));
      if (contexts.length === 0) throw new Error('Authorized TEST target has no live default execution context');
      return contexts;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const state = this.state;
    this.state = undefined;
    if (state) await this.api.disconnect(state);
  }

  async sendScopedCommand(request: GasScopedCommand): Promise<unknown> {
    if (!this.state) throw new Error('GasAdapter is not connected');
    if (!this.api.sendScopedCdpCommand) throw new Error('gas-remote-debug scoped control API is unavailable');
    return this.api.sendScopedCdpCommand(this.state, request);
  }
}
