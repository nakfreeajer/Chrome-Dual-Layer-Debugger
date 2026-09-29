import type { DiscoveryResult, DiscoveredFrame, DiscoveredPage } from '../browser/BrowserDiscovery.js';
import type { CrossLayerMappingResult } from '../core/CrossLayerMapper.js';
import type { GasDiscoveryResult } from '../gas/GasAdapter.js';
import { redactGasSecrets } from '../gas/GasAdapter.js';
import type { TraceEvent } from './TraceEvent.js';
import { Timeline } from './Timeline.js';

function emit(timeline: Timeline, event: Parameters<Timeline['create']>[0]): ReturnType<Timeline['create']> {
  const normalized = timeline.create(event);
  timeline.append(normalized);
  return normalized;
}

export function emitSessionEvent(timeline: Timeline, type: 'SESSION_STARTED' | 'SESSION_ENDED'): TraceEvent {
  return emit(timeline, { source: 'CORE', category: 'SESSION', type, data: {} });
}

function emitFrame(timeline: Timeline, page: DiscoveredPage, frame: DiscoveredFrame, redact: (value: string) => string): void {
  emit(timeline, {
    source: 'PLAYWRIGHT', category: 'FRAME', type: 'FRAME_DISCOVERED',
    contextId: page.contextId, pageId: page.pageId, frameId: frame.frameId,
    ...(frame.protocolFrameId === undefined ? {} : { protocolFrameId: frame.protocolFrameId }),
    url: redact(frame.url), data: { ...(frame.name === undefined ? {} : { name: frame.name }) }
  });
  for (const child of frame.children) emitFrame(timeline, page, child, redact);
}

export function emitBrowserDiscovery(timeline: Timeline, result: DiscoveryResult, redact: (value: string) => string = (value) => value): void {
  for (const context of result.contexts) {
    emit(timeline, { source: 'PLAYWRIGHT', category: 'SESSION', type: 'CONTEXT_DISCOVERED', contextId: context.contextId, data: {} });
    for (const page of context.pages) {
      emit(timeline, {
        source: 'PLAYWRIGHT', category: 'PAGE', type: 'PAGE_DISCOVERED',
        contextId: context.contextId, pageId: page.pageId, url: redact(page.url),
        data: { mode: page.mode }
      });
      for (const frame of page.frames) emitFrame(timeline, page, frame, redact);
      for (const executionContextId of page.executionContextIds) {
        emit(timeline, {
          source: 'CDP', category: 'RUNTIME', type: 'BROWSER_EXECUTION_CONTEXT_DISCOVERED',
          contextId: page.contextId, pageId: page.pageId, executionContextId, data: {}
        });
      }
    }
  }
}

export function emitGasDiscovery(timeline: Timeline, gas: GasDiscoveryResult, redact: (value: string) => string = redactGasSecrets): void {
  for (const target of gas.targets) emit(timeline, {
    source: 'GAS', category: 'TARGET', type: 'GAS_TARGET_DISCOVERED',
    targetId: target.targetId, url: redact(target.url), data: { type: target.type }
  });
  for (const session of gas.sessions) emit(timeline, {
    source: 'GAS', category: 'SESSION', type: 'GAS_SESSION_DISCOVERED',
    targetId: session.targetId, sessionId: session.sessionId,
    data: { parentSessionId: session.parentSessionId, detached: session.detached }
  });
  for (const frame of gas.frames) emit(timeline, {
    source: 'GAS', category: 'FRAME', type: 'GAS_FRAME_DISCOVERED',
    targetId: frame.targetId, sessionId: frame.sessionId, frameId: frame.frameId,
    ...(frame.url === undefined ? {} : { url: redact(frame.url) }),
    data: { parentFrameId: frame.parentFrameId }
  });
  for (const context of gas.contexts) emit(timeline, {
    source: 'GAS', category: 'RUNTIME', type: 'GAS_EXECUTION_CONTEXT_DISCOVERED',
    targetId: context.targetId, sessionId: context.sessionId,
    frameId: context.frameId, executionContextId: context.executionContextId,
    url: redact(context.origin),
    data: { name: redact(context.name), defaultWorld: context.defaultWorld, ignored: context.ignored, alive: context.alive }
  });
  if (gas.matchedRuntimeContext) {
    const context = gas.matchedRuntimeContext;
    emit(timeline, {
      source: 'GAS', category: 'GAS', type: 'GENERIC_GAS_RUNTIME_CONTEXT_MATCHED',
      targetId: context.targetId, sessionId: context.sessionId,
      frameId: context.frameId, executionContextId: context.executionContextId,
      data: { profileName: gas.profileName }
    });
  }
}

export function emitMappingEvidence(timeline: Timeline, mappings: CrossLayerMappingResult): void {
  for (const mapping of mappings.provenFrames) emit(timeline, {
    source: 'TRACE', category: 'TRACE', type: 'MAPPING_PROVEN',
    pageId: mapping.pageId, frameId: mapping.playwrightFrameId,
    protocolFrameId: mapping.protocolFrameId, targetId: mapping.gasTargetId,
    sessionId: mapping.gasSessionId,
    data: { gasFrameId: mapping.gasFrameId, evidence: mapping.evidence, mappingKind: 'FRAME' }
  });
  for (const mapping of mappings.provenContexts) emit(timeline, {
    source: 'TRACE', category: 'TRACE', type: 'MAPPING_PROVEN',
    pageId: mapping.pageId, frameId: mapping.playwrightFrameId,
    protocolFrameId: mapping.protocolFrameId, targetId: mapping.gasTargetId,
    sessionId: mapping.gasSessionId, executionContextId: mapping.executionContextId,
    data: { gasFrameId: mapping.gasFrameId, evidence: 'shared-protocol-frame-and-target-session', mappingKind: 'EXECUTION_CONTEXT' }
  });
  const unmapped: Array<{ kind: string; identity: string }> = [
    ...mappings.unmappedPlaywrightPageIds.map((identity) => ({ kind: 'PLAYWRIGHT_PAGE_TO_GAS_TARGET', identity })),
    ...mappings.unmappedPlaywrightFrameIds.map((identity) => ({ kind: 'PLAYWRIGHT_FRAME_TO_GAS_FRAME', identity })),
    ...mappings.unmappedGasFrameIds.map((identity) => ({ kind: 'GAS_FRAME_TO_PLAYWRIGHT_FRAME', identity })),
    ...mappings.unmappedGasContextIds.map((identity) => ({ kind: 'GAS_EXECUTION_CONTEXT_TO_PLAYWRIGHT_FRAME', identity: String(identity) }))
  ];
  for (const item of unmapped) emit(timeline, {
    source: 'TRACE', category: 'TRACE', type: 'IDENTITY_UNMAPPED',
    data: { kind: item.kind, identity: item.identity, status: 'UNMAPPED' }
  });
}
