export interface TargetIdentity {
  pageId: string;
  targetId?: string;
  sessionId?: string;
  mainFrameId?: string;
  url?: string;
}

export class TargetRegistry {
  private readonly targets = new Map<string, TargetIdentity>();

  set(identity: TargetIdentity): void {
    this.targets.set(identity.pageId, identity);
  }

  get(pageId: string): TargetIdentity | undefined {
    return this.targets.get(pageId);
  }
}
