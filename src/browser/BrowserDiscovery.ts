import type { DebugLayerMode } from '../core/LayerDetector.js';

export interface DiscoveredFrame {
  frameId: string;
  protocolFrameId?: string;
  url: string;
  name?: string;
  children: DiscoveredFrame[];
}

export interface DiscoveredPage {
  pageId: string;
  contextId: string;
  url: string;
  title?: string;
  mode: DebugLayerMode;
  frames: DiscoveredFrame[];
  executionContextIds: number[];
}

export interface DiscoveredContext {
  contextId: string;
  pages: DiscoveredPage[];
}

export interface DiscoveryResult {
  connected: true;
  contexts: DiscoveredContext[];
}

export interface PageDiscoveryInput {
  contextId: string;
  url: string;
  title?: string;
  frames: DiscoveredFrame[];
  executionContextIds: number[];
}

export interface BrowserDiscovery {
  discover(): Promise<DiscoveryResult>;
  disconnect(): Promise<void>;
}
