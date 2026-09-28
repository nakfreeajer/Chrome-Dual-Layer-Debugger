import type { TraceEvent } from './TraceEvent.js';

export interface JsonlTraceWriter {
  write(event: TraceEvent): Promise<void>;
  close(): Promise<void>;
}
