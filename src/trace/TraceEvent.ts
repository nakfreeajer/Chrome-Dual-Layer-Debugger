export type TraceSource = 'CORE' | 'PLAYWRIGHT' | 'CDP' | 'GAS';

export interface TraceEvent {
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
  executionContextId?: number;
  url?: string;
  parentEventId?: string;
  correlationId?: string;
  data: unknown;
}
