import type { DebugLayerMode } from './LayerDetector.js';

export interface DebugSessionState {
  sessionId: string;
  activePageId?: string;
  activeUrl?: string;
  mode?: DebugLayerMode;
}

export class DebugSession {
  readonly state: DebugSessionState;

  constructor(sessionId: string) {
    this.state = { sessionId };
  }
}
