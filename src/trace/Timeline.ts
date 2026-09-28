import type { TraceEvent } from './TraceEvent.js';

export class Timeline {
  private readonly events: TraceEvent[] = [];

  append(event: TraceEvent): void {
    this.events.push(event);
  }

  snapshot(): readonly TraceEvent[] {
    return this.events;
  }
}
