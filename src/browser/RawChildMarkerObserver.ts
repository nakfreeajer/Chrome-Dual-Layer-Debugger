import type { CDPSession } from 'playwright';
import { extractV1CompletionMarker } from '../correlation/V1EvidenceProducer.js';
import type { V1CompletionMarkerEvidence } from '../correlation/V1CorrelationRecognizer.js';

const MARKER_NAME = 'CDLD_CORRELATION_V1';
const CHILD_TARGET_FILTER = [{ type: 'iframe' }, { exclude: true }];

interface RecordValue { [key: string]: unknown; }

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reduce one nested Target.receivedMessageFromTarget payload to the exact
 * marker identity fields. Raw CDP payloads and unrelated console values never
 * escape this function.
 */
export function normalizeChildRuntimeMarker(message: unknown, runId: string): V1CompletionMarkerEvidence | undefined {
  if (typeof message !== 'string') return undefined;
  let packet: unknown;
  try { packet = JSON.parse(message) as unknown; } catch { return undefined; }
  if (!isRecord(packet) || packet.method !== 'Runtime.consoleAPICalled' || !isRecord(packet.params)) return undefined;
  const params = packet.params;
  if (params.type !== 'info' || !Array.isArray(params.args) || params.args.length !== 2) return undefined;
  const [name, payload] = params.args;
  if (!isRecord(name) || name.type !== 'string' || name.value !== MARKER_NAME) return undefined;
  if (!isRecord(payload) || payload.type !== 'string' || typeof payload.value !== 'string') return undefined;
  return extractV1CompletionMarker(`${MARKER_NAME} ${payload.value}`, runId);
}

type AttachedTargetEvent = { sessionId?: unknown; targetInfo?: unknown };
type DetachedTargetEvent = { sessionId?: unknown };
type ReceivedTargetMessageEvent = { sessionId?: unknown; message?: unknown };
interface CommandAck { resolve: () => void; reject: (error: Error) => void; }

/**
 * Observes only console.info V1 markers on iframe targets related to one
 * already-discovered GAS page. Target sessions carry no correlation authority;
 * their normalized marker evidence feeds the page observer's existing
 * V1CorrelationRecognizer.
 */
export class RawChildMarkerObserver {
  private readonly childSessionIds = new Set<string>();
  private readonly pending = new Set<Promise<void>>();
  private readonly commandAcks = new Map<number, CommandAck>();
  private nextCommandId = 0;
  private started = false;
  private stopped = false;
  private fatalError?: Error;
  private readyResolve?: () => void;
  private readyReject?: (error: Error) => void;
  private readyPromise?: Promise<void>;

  constructor(
    private readonly session: CDPSession,
    private readonly runId: string,
    private readonly onMarker: (evidence: V1CompletionMarkerEvidence) => void
  ) {
    if (!runId.trim()) throw new Error('Raw marker observer runId must be non-empty');
  }

  async start(timeoutMs = 5000): Promise<void> {
    if (this.started || this.stopped) throw new Error('Raw marker observer can only be started once');
    this.started = true;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.session.on('Target.attachedToTarget', this.onAttachedToTarget);
    this.session.on('Target.detachedFromTarget', this.onDetachedFromTarget);
    this.session.on('Target.receivedMessageFromTarget', this.onReceivedMessageFromTarget);
    try {
      await this.session.send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: false,
        filter: CHILD_TARGET_FILTER
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.readyPromise,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Timed out waiting for a child OOPIF Runtime session')), timeoutMs);
          })
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      await Promise.all([...this.pending]);
      if (this.fatalError) throw this.fatalError;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.session.off('Target.attachedToTarget', this.onAttachedToTarget);
    this.session.off('Target.detachedFromTarget', this.onDetachedFromTarget);
    this.session.off('Target.receivedMessageFromTarget', this.onReceivedMessageFromTarget);
    for (const [id, ack] of this.commandAcks) {
      ack.reject(new Error('Raw marker observer stopped before child Runtime acknowledgement'));
      this.commandAcks.delete(id);
    }
    await Promise.allSettled([...this.pending]);
    try {
      await this.session.send('Target.setAutoAttach', {
        autoAttach: false,
        waitForDebuggerOnStart: false,
        flatten: false,
        filter: CHILD_TARGET_FILTER
      });
    } catch { /* A disconnected page already released its child targets. */ }
    for (const sessionId of this.childSessionIds) {
      try { await this.session.send('Target.detachFromTarget', { sessionId }); }
      catch { /* A target may have detached naturally. */ }
    }
    this.childSessionIds.clear();
  }

  private readonly onAttachedToTarget = (event: AttachedTargetEvent): void => {
    if (!this.started || this.stopped || !isRecord(event.targetInfo) || event.targetInfo.type !== 'iframe') return;
    if (typeof event.sessionId !== 'string' || !event.sessionId || this.childSessionIds.has(event.sessionId)) return;
    const sessionId = event.sessionId;
    this.childSessionIds.add(sessionId);
    const operation = this.enableRuntime(sessionId);
    this.pending.add(operation);
    void operation.then(() => {
      this.readyResolve?.();
    }, (error: unknown) => {
      const normalized = error instanceof Error ? error : new Error('Failed to enable child Runtime observation');
      this.fatalError = normalized;
      this.readyReject?.(normalized);
    }).finally(() => this.pending.delete(operation));
  };

  private readonly onDetachedFromTarget = (event: DetachedTargetEvent): void => {
    if (typeof event.sessionId === 'string') this.childSessionIds.delete(event.sessionId);
  };

  private readonly onReceivedMessageFromTarget = (event: ReceivedTargetMessageEvent): void => {
    if (!this.started || this.stopped || typeof event.sessionId !== 'string' ||
        !this.childSessionIds.has(event.sessionId) || typeof event.message !== 'string') return;
    let packet: unknown;
    try { packet = JSON.parse(event.message) as unknown; } catch { return; }
    if (isRecord(packet) && typeof packet.id === 'number') {
      const ack = this.commandAcks.get(packet.id);
      if (ack) {
        this.commandAcks.delete(packet.id);
        if (isRecord(packet.error)) ack.reject(new Error('Child Runtime.enable was rejected'));
        else ack.resolve();
        return;
      }
    }
    const marker = normalizeChildRuntimeMarker(event.message, this.runId);
    if (marker) this.onMarker(marker);
  };

  private async enableRuntime(sessionId: string): Promise<void> {
    const id = ++this.nextCommandId;
    const message = JSON.stringify({ id, method: 'Runtime.enable', params: {} });
    const acknowledgement = new Promise<void>((resolve, reject) => this.commandAcks.set(id, { resolve, reject }));
    try {
      await this.session.send('Target.sendMessageToTarget', { sessionId, message });
      await acknowledgement;
    } catch (error) {
      this.commandAcks.delete(id);
      throw error;
    }
  }
}
