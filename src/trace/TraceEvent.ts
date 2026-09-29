export type TraceSource = 'CORE' | 'PLAYWRIGHT' | 'CDP' | 'GAS' | 'TRACE';

export interface TraceEvent {
  runId: string;
  eventId: string;
  traceId?: string;
  sequence: number;
  timestamp: string;
  monotonicTimestamp?: number;
  source: TraceSource;
  category: string;
  type: string;
  browserId?: string;
  contextId?: string;
  pageId?: string;
  targetId?: string;
  frameId?: string;
  protocolFrameId?: string;
  sessionId?: string;
  executionContextId?: number;
  url?: string;
  parentEventId?: string;
  correlationId?: string;
  data: unknown;
}
