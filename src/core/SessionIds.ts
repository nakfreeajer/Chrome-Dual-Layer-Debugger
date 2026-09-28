/** Allocates deterministic debugger-local IDs for one discovery session. */
export class SessionIds {
  private readonly counters = new Map<string, number>();

  next(kind: 'CONTEXT' | 'PAGE' | 'FRAME'): string {
    const next = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, next);
    return `${kind}-${String(next).padStart(4, '0')}`;
  }
}
