/** Allocates deterministic debugger-local IDs for one discovery session. */
export class SessionIds {
  private readonly counters = new Map<string, number>();
  private contextIds = new WeakMap<object, string>();
  private pageIds = new WeakMap<object, string>();
  private readonly frameIds = new Map<string, string>();

  next(kind: 'CONTEXT' | 'PAGE' | 'FRAME'): string {
    const next = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, next);
    return `${kind}-${String(next).padStart(4, '0')}`;
  }

  forContext(identity: object): string {
    return this.retain(this.contextIds, identity, 'CONTEXT');
  }

  forPage(identity: object): string {
    return this.retain(this.pageIds, identity, 'PAGE');
  }

  forFrame(protocolFrameId: string): string {
    const known = this.frameIds.get(protocolFrameId);
    if (known) return known;
    const id = this.next('FRAME');
    this.frameIds.set(protocolFrameId, id);
    return id;
  }

  clear(): void {
    this.counters.clear();
    this.contextIds = new WeakMap<object, string>();
    this.pageIds = new WeakMap<object, string>();
    this.frameIds.clear();
  }

  private retain(map: WeakMap<object, string>, identity: object, kind: 'CONTEXT' | 'PAGE'): string {
    const known = map.get(identity);
    if (known) return known;
    const id = this.next(kind);
    map.set(identity, id);
    return id;
  }
}
