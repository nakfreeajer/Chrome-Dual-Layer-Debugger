import type { TraceEvent } from './TraceEvent.js';
import { SessionClock } from '../core/SessionClock.js';
import { randomUUID } from 'node:crypto';

export type TimelineEventInput = Omit<TraceEvent, 'runId' | 'eventId' | 'sequence' | 'timestamp'> & { timestamp?: string };

export class TraceEventIds {
  private sequence = 0;

  constructor(private readonly runId: string) {}

  create(input: TimelineEventInput): TraceEvent {
    this.sequence += 1;
    const sequence = this.sequence;
    return {
      ...input,
      runId: this.runId,
      eventId: `EVENT-${String(sequence).padStart(6, '0')}`,
      sequence,
      timestamp: input.timestamp ?? new SessionClock().now()
    };
  }
}

export class Timeline {
  private readonly events: TraceEvent[] = [];
  private readonly ids: TraceEventIds;
  private readonly identity: string;

  get runId(): string {
    return this.identity;
  }

  constructor(options: { runId?: string } = {}) {
    this.identity = options.runId ?? randomUUID();
    if (!this.identity.trim()) throw new Error('Timeline runId must be a non-empty string');
    this.ids = new TraceEventIds(this.identity);
  }

  create(input: TimelineEventInput): TraceEvent {
    return this.ids.create(input);
  }

  append(event: TraceEvent): void {
    if (event.runId !== this.runId) {
      throw new Error('Timeline event runId must match the owning Timeline');
    }
    if (this.events.length && event.sequence <= this.events[this.events.length - 1].sequence) {
      throw new Error('Timeline events must be appended in strictly increasing sequence order');
    }
    this.events.push(event);
  }

  snapshot(): readonly TraceEvent[] {
    return this.events;
  }
}
