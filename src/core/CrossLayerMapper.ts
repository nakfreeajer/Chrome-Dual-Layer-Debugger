import type { DiscoveredPage } from '../browser/BrowserDiscovery.js';
import type { GasDiscoveryResult } from '../gas/GasAdapter.js';

export interface ProvenFrameMapping {
  pageId: string;
  playwrightFrameId: string;
  protocolFrameId: string;
  gasFrameId: string;
  gasSessionId: string;
  gasTargetId: string;
  evidence: 'dependency-frame-registry' | 'dependency-context-frameId';
}

export interface ProvenContextMapping {
  pageId: string;
  playwrightFrameId: string;
  protocolFrameId: string;
  gasFrameId: string;
  gasSessionId: string;
  gasTargetId: string;
  executionContextId: number;
}

export interface CrossLayerMappingResult {
  provenFrames: ProvenFrameMapping[];
  provenContexts: ProvenContextMapping[];
  unmappedPlaywrightFrameIds: string[];
  unmappedGasFrameIds: string[];
  unmappedGasContextIds: number[];
  unmappedPlaywrightPageIds: string[];
}

interface PlaywrightFrameEvidence {
  pageId: string;
  frameId: string;
  protocolFrameId?: string;
}

function flattenFrames(pages: DiscoveredPage[]): PlaywrightFrameEvidence[] {
  const result: PlaywrightFrameEvidence[] = [];
  const visit = (pageId: string, frames: DiscoveredPage['frames']): void => {
    for (const frame of frames) {
      result.push({ pageId, frameId: frame.frameId, protocolFrameId: frame.protocolFrameId });
      visit(pageId, frame.children);
    }
  };
  for (const page of pages) visit(page.pageId, page.frames);
  return result;
}

export function mapCrossLayerIdentities(pages: DiscoveredPage[], gas: GasDiscoveryResult): CrossLayerMappingResult {
  const playwrightFrames = flattenFrames(pages);
  const gasFrameEvidence = new Map<string, (typeof gas.frames)[number]>();
  for (const frame of gas.frames) {
    gasFrameEvidence.set(`${frame.frameId}:${frame.sessionId}`, frame);
  }
  for (const context of gas.contexts) {
    if (!context.frameId) continue;
    const key = `${context.frameId}:${context.sessionId}`;
    if (!gasFrameEvidence.has(key)) {
      gasFrameEvidence.set(key, {
        frameId: context.frameId,
        sessionId: context.sessionId,
        targetId: context.targetId,
        parentFrameId: ''
      });
    }
  }
  const gasFramesById = new Map<string, Array<(typeof gas.frames)[number]>>();
  for (const frame of gasFrameEvidence.values()) {
    const current = gasFramesById.get(frame.frameId) ?? [];
    current.push(frame);
    gasFramesById.set(frame.frameId, current);
  }

  const provenFrames: ProvenFrameMapping[] = [];
  const frameEvidence = new Map<string, ProvenFrameMapping>();
  const mappedPlaywrightIds = new Set<string>();
  const mappedGasIds = new Set<string>();
  for (const frame of playwrightFrames) {
    if (!frame.protocolFrameId) continue;
    const candidates = gasFramesById.get(frame.protocolFrameId) ?? [];
    if (candidates.length !== 1) continue;
    const candidate = candidates[0];
    const mapping = {
      pageId: frame.pageId,
      playwrightFrameId: frame.frameId,
      protocolFrameId: frame.protocolFrameId,
      gasFrameId: candidate.frameId,
      gasSessionId: candidate.sessionId,
      gasTargetId: candidate.targetId,
      evidence: gas.frames.some((gasFrame) => gasFrame.frameId === candidate.frameId && gasFrame.sessionId === candidate.sessionId)
        ? 'dependency-frame-registry' as const
        : 'dependency-context-frameId' as const
    };
    provenFrames.push(mapping);
    frameEvidence.set(candidate.frameId, mapping);
    mappedPlaywrightIds.add(frame.frameId);
    mappedGasIds.add(candidate.frameId);
  }

  const provenContexts: ProvenContextMapping[] = [];
  const mappedContextKeys = new Set<string>();
  for (const context of gas.contexts) {
    const mapping = frameEvidence.get(context.frameId);
    if (!mapping || context.targetId !== mapping.gasTargetId || context.sessionId !== mapping.gasSessionId) continue;
    provenContexts.push({
      pageId: mapping.pageId,
      playwrightFrameId: mapping.playwrightFrameId,
      protocolFrameId: mapping.protocolFrameId,
      gasFrameId: mapping.gasFrameId,
      gasSessionId: context.sessionId,
      gasTargetId: context.targetId,
      executionContextId: context.executionContextId
    });
    mappedContextKeys.add(`${context.sessionId}:${context.executionContextId}`);
  }

  return {
    provenFrames,
    provenContexts,
    unmappedPlaywrightFrameIds: playwrightFrames.filter((frame) => !mappedPlaywrightIds.has(frame.frameId)).map((frame) => frame.frameId),
    unmappedGasFrameIds: gas.frames.filter((frame) => !mappedGasIds.has(frame.frameId)).map((frame) => frame.frameId),
    unmappedGasContextIds: gas.contexts.filter((context) => !mappedContextKeys.has(`${context.sessionId}:${context.executionContextId}`)).map((context) => context.executionContextId),
    // Playwright exposes no public CDP TargetId through this discovery result.
    unmappedPlaywrightPageIds: pages.map((page) => page.pageId)
  };
}
