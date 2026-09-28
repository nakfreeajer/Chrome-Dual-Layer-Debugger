import type { TraceEvent } from './TraceEvent.js';
import { SessionClock } from '../core/SessionClock.js';

export class TraceEventIds {
  private sequence = 0;

  create(input: Omit<TraceEvent, 'eventId' | 'sequence' | 'timestamp'> & { timestamp?: string }): TraceEvent {
    this.sequence += 1;
    const sequence = this.sequence;
    return {
      ...input,
      eventId: `EVENT-${String(sequence).padStart(6, '0')}`,
      sequence,
      timestamp: input.timestamp ?? new SessionClock().now()
    };
  }
}

export class Timeline {
  private readonly events: TraceEvent[] = [];
  private readonly ids = new TraceEventIds();

  create(input: Omit<TraceEvent, 'eventId' | 'sequence' | 'timestamp'> & { timestamp?: string }): TraceEvent {
    return this.ids.create(input);
  }

  append(event: TraceEvent): void {
    if (this.events.length && event.sequence <= this.events[this.events.length - 1].sequence) {
      throw new Error('Timeline events must be appended in strictly increasing sequence order');
    }
    this.events.push(event);
  }

  snapshot(): readonly TraceEvent[] {
    return this.events;
  }
}
