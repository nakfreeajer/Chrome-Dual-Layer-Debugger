import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, type FileHandle } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { SmokeTarget } from './SmokeScenario.js';
import { resolveFailureArtifactPath } from './FailureArtifact.js';

export type FixturePhaseStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'VERIFIED' | 'FAILED' | 'UNKNOWN';
export type FixtureCleanupStatus = 'VERIFIED' | 'FAILED' | 'UNKNOWN';
export type FixtureLifecyclePhase = 'SETUP' | 'VERIFY_OWNERSHIP' | 'RESET' | 'VERIFY_RESET' | 'TARGET_BINDING' | 'RUN' | 'TEARDOWN' | 'VERIFY_CLEANUP' | 'BROWSER_RESOURCES';

export interface SyntheticFixtureLease {
  schemaVersion: 1;
  kind: 'CDLD_SYNTHETIC_FIXTURE_LEASE';
  ownership: 'CDLD_SYNTHETIC';
  fixtureId: string;
  driverId: string;
  leaseId: string;
  target: SmokeTarget;
  /** Exact identifiers of resources created and owned by this lease; never inferred. */
  ownedResourceIds: readonly string[];
}

export type FixtureRuntimeTargetIdentity =
  | { backend: 'PLAYWRIGHT'; scopeKind: 'PAGE'; contextId: string; pageId: string }
  | { backend: 'PLAYWRIGHT'; scopeKind: 'FRAME'; contextId: string; pageId: string; frameId: string; protocolFrameId: string }
  | { backend: 'GAS_OOPIF'; scopeKind: 'PAGE' | 'FRAME'; targetId: string; sessionId: string; executionContextId: number; frameId: string };

/** Driver-issued, one-use proof that a newly observed runtime identity belongs to a prepared lease. */
export interface FixtureTargetAttestation {
  schemaVersion: 1;
  kind: 'CDLD_FIXTURE_TARGET_ATTESTATION';
  driverId: string;
  leaseId: string;
  challenge: string;
  attestationId: string;
  runtimeIdentitySha256: string;
}

export interface SyntheticFixtureRequest {
  fixtureId: string;
  target: SmokeTarget;
}

/** Injected by trusted host code; the CLI never loads a user-supplied module or script. */
export interface SyntheticFixtureDriver {
  readonly driverId: string;
  setup(request: SyntheticFixtureRequest): Promise<unknown>;
  verifyOwnership(lease: SyntheticFixtureLease): Promise<boolean>;
  reset(lease: SyntheticFixtureLease): Promise<void>;
  verifyReset(lease: SyntheticFixtureLease): Promise<boolean>;
  /**
   * Must independently prove that the observed target was created/owned for this lease, using trusted host
   * evidence rather than URL/origin or the caller-supplied identity alone. Return null when unproven.
   * The fresh challenge prevents a prior lease/session attestation from being replayed.
   */
  attestTargetBinding(lease: SyntheticFixtureLease, actual: FixtureRuntimeTargetIdentity, challenge: string): Promise<FixtureTargetAttestation | null>;
  teardown(lease: SyntheticFixtureLease): Promise<void>;
  verifyCleanup(lease: SyntheticFixtureLease): Promise<boolean>;
}

export interface FixtureLifecycleEvidence {
  schemaVersion: 1;
  runId: string;
  sequence: number;
  fixtureId: string;
  driverId: string;
  phase: FixtureLifecyclePhase;
  status: FixturePhaseStatus;
  ownership?: 'CDLD_SYNTHETIC';
  resourceCount?: number;
  scopeKind?: 'PAGE' | 'FRAME';
  targetIdentitySha256?: string;
  recordedAt: string;
}

export interface FixtureLifecycleJournal {
  readonly path?: string;
  record(entry: FixtureLifecycleEvidence): Promise<void>;
  close(): Promise<void>;
}

export class FixtureOperationTimeoutError extends Error {
  constructor(readonly phase: FixtureLifecyclePhase) {
    super(`FIXTURE_OPERATION_TIMEOUT:${phase}`);
    this.name = 'FixtureOperationTimeoutError';
  }
}

async function withTimeout<T>(phase: FixtureLifecyclePhase, timeoutMs: number, operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new FixtureOperationTimeoutError(phase)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface FixtureLifecycleSummary {
  schemaVersion: 1;
  runId: string;
  fixtureId: string;
  driverId: string;
  setupStatus: FixturePhaseStatus;
  ownershipStatus: FixturePhaseStatus;
  resetStatus: FixturePhaseStatus;
  resetVerificationStatus: FixturePhaseStatus;
  targetBindingStatus: FixturePhaseStatus;
  runStatus: FixturePhaseStatus;
  browserResourceClosureStatus: FixturePhaseStatus;
  teardownStatus: FixturePhaseStatus;
  cleanupVerificationStatus: FixtureCleanupStatus;
  overallStatus: 'PASS' | 'FAIL' | 'UNKNOWN';
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function validId(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error(`${name} is invalid`);
}

function targetEqual(a: SmokeTarget, b: SmokeTarget): boolean {
  return a.pageUrl === b.pageUrl && a.scope.kind === b.scope.kind
    && (a.scope.kind === 'PAGE' || (b.scope.kind === 'FRAME' && a.scope.url === b.scope.url));
}

function validateRuntimeIdentity(value: unknown): value is FixtureRuntimeTargetIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.scopeKind !== 'PAGE' && item.scopeKind !== 'FRAME') return false;
  if (item.backend === 'PLAYWRIGHT') {
    const expectedKeys = item.scopeKind === 'PAGE'
      ? ['backend', 'scopeKind', 'contextId', 'pageId']
      : ['backend', 'scopeKind', 'contextId', 'pageId', 'frameId', 'protocolFrameId'];
    if (Object.keys(item).length !== expectedKeys.length || Object.keys(item).some((key) => !expectedKeys.includes(key))) return false;
    return typeof item.contextId === 'string' && idPattern.test(item.contextId)
      && typeof item.pageId === 'string' && idPattern.test(item.pageId)
      && (item.scopeKind === 'PAGE' || (typeof item.frameId === 'string' && idPattern.test(item.frameId)
        && typeof item.protocolFrameId === 'string' && idPattern.test(item.protocolFrameId)));
  }
  if (item.backend !== 'GAS_OOPIF') return false;
  const expectedKeys = ['backend', 'scopeKind', 'targetId', 'sessionId', 'executionContextId', 'frameId'];
  if (Object.keys(item).length !== expectedKeys.length || Object.keys(item).some((key) => !expectedKeys.includes(key))) return false;
  return typeof item.targetId === 'string' && idPattern.test(item.targetId)
    && typeof item.sessionId === 'string' && idPattern.test(item.sessionId)
    && Number.isSafeInteger(item.executionContextId) && (item.executionContextId as number) >= 0
    && typeof item.frameId === 'string' && idPattern.test(item.frameId);
}

/** Canonical, privacy-safe digest shared by CDLD and trusted fixture drivers. */
export function fixtureRuntimeIdentitySha256(identity: FixtureRuntimeTargetIdentity): string {
  const canonical = identity.backend === 'PLAYWRIGHT'
    ? identity.scopeKind === 'PAGE'
      ? { backend: identity.backend, scopeKind: identity.scopeKind, contextId: identity.contextId, pageId: identity.pageId }
      : { backend: identity.backend, scopeKind: identity.scopeKind, contextId: identity.contextId, pageId: identity.pageId, frameId: identity.frameId, protocolFrameId: identity.protocolFrameId }
    : { backend: identity.backend, scopeKind: identity.scopeKind, targetId: identity.targetId, sessionId: identity.sessionId, executionContextId: identity.executionContextId, frameId: identity.frameId };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

function validateLease(value: unknown, request: SyntheticFixtureRequest, driverId: string): SyntheticFixtureLease {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('FIXTURE_LEASE_INVALID');
  const lease = value as Partial<SyntheticFixtureLease>;
  if (lease.schemaVersion !== 1 || lease.kind !== 'CDLD_SYNTHETIC_FIXTURE_LEASE' || lease.ownership !== 'CDLD_SYNTHETIC'
    || lease.fixtureId !== request.fixtureId || lease.driverId !== driverId || typeof lease.leaseId !== 'string' || !idPattern.test(lease.leaseId)
    || !lease.target || !targetEqual(lease.target, request.target) || !Array.isArray(lease.ownedResourceIds)
    || lease.ownedResourceIds.length === 0 || lease.ownedResourceIds.some((id) => typeof id !== 'string' || !idPattern.test(id))
    ) {
    throw new Error('FIXTURE_LEASE_INVALID');
  }
  return Object.freeze({ ...lease, target: Object.freeze({ ...lease.target, scope: Object.freeze({ ...lease.target.scope }) }),
    ownedResourceIds: Object.freeze([...lease.ownedResourceIds]) }) as SyntheticFixtureLease;
}

/** Creates a private append-only, per-run lifecycle journal. It never records URLs or resource IDs. */
export class FileFixtureLifecycleJournal implements FixtureLifecycleJournal {
  readonly path: string;
  private handle?: FileHandle;
  private closed = false;

  constructor(private readonly runId: string) {
    if (!runIdPattern.test(runId)) throw new Error('Fixture lifecycle runId is invalid');
    this.path = resolveFailureArtifactPath(`.agent-work/artifacts/fixture-lifecycle-${runId}.jsonl`);
  }

  async record(entry: FixtureLifecycleEvidence): Promise<void> {
    if (this.closed) throw new Error('Fixture lifecycle journal is closed');
    if (entry.runId !== this.runId) throw new Error('Fixture lifecycle journal runId mismatch');
    const bytes = Buffer.from(`${JSON.stringify(entry)}\n`, 'utf8');
    if (bytes.length > 4096) throw new Error('Fixture lifecycle evidence exceeds size limit');
    if (!this.handle) {
      await mkdir(dirname(this.path), { recursive: true });
      this.handle = await open(this.path, 'wx');
    }
    await this.handle.write(bytes);
    await this.handle.sync();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const handle = this.handle;
    this.handle = undefined;
    if (handle) await handle.close();
  }
}

export async function readFixtureLifecycleJournal(path: string): Promise<FixtureLifecycleEvidence[]> {
  const full = resolveFailureArtifactPath(path);
  const bytes = await readFile(full);
  if (bytes.length > 256 * 1024) throw new Error('Fixture lifecycle journal exceeds size limit');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const lines = text.split('\n').filter(Boolean);
  const entries: FixtureLifecycleEvidence[] = [];
  let expectedRunId: string | undefined;
  let expectedFixtureId: string | undefined;
  let expectedDriverId: string | undefined;
  const allowedKeys = new Set(['schemaVersion', 'runId', 'sequence', 'fixtureId', 'driverId', 'phase', 'status', 'ownership', 'resourceCount', 'scopeKind', 'targetIdentitySha256', 'recordedAt']);
  for (const line of lines) {
    const item: unknown = JSON.parse(line);
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Fixture lifecycle journal record is malformed');
    const record = item as FixtureLifecycleEvidence;
    if (Object.keys(item).some((key) => !allowedKeys.has(key))) throw new Error('Fixture lifecycle journal record contains unsupported fields');
    if (record.schemaVersion !== 1 || !runIdPattern.test(record.runId) || !idPattern.test(record.fixtureId) || !idPattern.test(record.driverId)
      || !Number.isSafeInteger(record.sequence) || record.sequence !== entries.length + 1
      || !['SETUP', 'VERIFY_OWNERSHIP', 'RESET', 'VERIFY_RESET', 'TARGET_BINDING', 'RUN', 'TEARDOWN', 'VERIFY_CLEANUP', 'BROWSER_RESOURCES'].includes(record.phase)
      || !['NOT_STARTED', 'IN_PROGRESS', 'VERIFIED', 'FAILED', 'UNKNOWN'].includes(record.status)
      || (record.ownership !== undefined && record.ownership !== 'CDLD_SYNTHETIC')
      || (record.resourceCount !== undefined && (!Number.isSafeInteger(record.resourceCount) || record.resourceCount < 0))
      || (record.scopeKind !== undefined && record.scopeKind !== 'PAGE' && record.scopeKind !== 'FRAME')
      || (record.targetIdentitySha256 !== undefined && !/^[a-f0-9]{64}$/.test(record.targetIdentitySha256))
      || typeof record.recordedAt !== 'string' || !Number.isFinite(Date.parse(record.recordedAt))) throw new Error('Fixture lifecycle journal record is invalid');
    if (expectedRunId === undefined) { expectedRunId = record.runId; expectedFixtureId = record.fixtureId; expectedDriverId = record.driverId; }
    if (record.runId !== expectedRunId || record.fixtureId !== expectedFixtureId || record.driverId !== expectedDriverId) throw new Error('Fixture lifecycle journal identity changed within the run');
    entries.push(record);
  }
  return entries;
}

/** An incomplete or missing verification record is UNKNOWN, never an implicit cleanup success. */
export function fixtureCleanupStatusFromEvidence(entries: readonly FixtureLifecycleEvidence[]): FixtureCleanupStatus {
  const last = [...entries].reverse().find((entry) => entry.phase === 'VERIFY_CLEANUP');
  if (!last || last.status === 'IN_PROGRESS' || last.status === 'UNKNOWN') return 'UNKNOWN';
  return last.status === 'VERIFIED' ? 'VERIFIED' : 'FAILED';
}

export class FixtureLifecycleController {
  private sequence = 0;
  private lease?: SyntheticFixtureLease;
  private prepared = false;
  private finished?: FixtureLifecycleSummary;
  private setupStatus: FixturePhaseStatus = 'NOT_STARTED';
  private ownershipStatus: FixturePhaseStatus = 'NOT_STARTED';
  private resetStatus: FixturePhaseStatus = 'NOT_STARTED';
  private resetVerificationStatus: FixturePhaseStatus = 'NOT_STARTED';
  private targetBindingStatus: FixturePhaseStatus = 'NOT_STARTED';
  private runStatus: FixturePhaseStatus = 'NOT_STARTED';
  private browserResourceClosureStatus: FixturePhaseStatus = 'NOT_STARTED';
  private teardownStatus: FixturePhaseStatus = 'NOT_STARTED';
  private cleanupVerificationStatus: FixtureCleanupStatus = 'UNKNOWN';
  private interrupted = false;
  private journalUnavailable = false;

  constructor(
    private readonly options: { driver: SyntheticFixtureDriver; request: SyntheticFixtureRequest; runId: string; journal: FixtureLifecycleJournal; operationTimeoutMs?: number }
  ) {
    validId(options.request.fixtureId, 'fixtureId');
    if (!runIdPattern.test(options.runId)) throw new Error('Fixture lifecycle runId is invalid');
    if (!options.driver || !idPattern.test(options.driver.driverId)) throw new Error('Eligible synthetic fixture driver is required');
    if (options.operationTimeoutMs !== undefined && (!Number.isSafeInteger(options.operationTimeoutMs) || options.operationTimeoutMs < 1 || options.operationTimeoutMs > 120_000)) throw new Error('Fixture operation timeout is invalid');
  }

  get verifiedLease(): SyntheticFixtureLease | undefined { return this.prepared ? this.lease : undefined; }

  private async record(phase: FixtureLifecyclePhase, status: FixturePhaseStatus, extra: Partial<FixtureLifecycleEvidence> = {}): Promise<void> {
    const sequence = this.sequence + 1;
    try {
      await this.options.journal.record({ schemaVersion: 1, runId: this.options.runId, sequence,
        fixtureId: this.options.request.fixtureId, driverId: this.options.driver.driverId, phase, status,
        recordedAt: new Date().toISOString(), ...extra });
    } catch (error) {
      this.journalUnavailable = true;
      throw error;
    }
    this.sequence = sequence;
  }

  async prepare(): Promise<SyntheticFixtureLease> {
    if (this.sequence !== 0 || this.prepared || this.finished) throw new Error('FIXTURE_LIFECYCLE_ALREADY_STARTED');
    let activePhase: FixtureLifecyclePhase = 'SETUP';
    try {
      this.setupStatus = 'IN_PROGRESS';
      await this.record('SETUP', 'IN_PROGRESS');
      const candidate = await withTimeout('SETUP', this.options.operationTimeoutMs ?? 30_000, () => this.options.driver.setup(this.options.request));
      this.lease = validateLease(candidate, this.options.request, this.options.driver.driverId);
      await this.record('SETUP', 'VERIFIED', { ownership: 'CDLD_SYNTHETIC', resourceCount: this.lease.ownedResourceIds.length, scopeKind: this.lease.target.scope.kind });
      this.setupStatus = 'VERIFIED';

      activePhase = 'VERIFY_OWNERSHIP';
      this.ownershipStatus = 'IN_PROGRESS';
      await this.record('VERIFY_OWNERSHIP', 'IN_PROGRESS');
      const owned = await withTimeout('VERIFY_OWNERSHIP', this.options.operationTimeoutMs ?? 30_000, () => this.options.driver.verifyOwnership(this.lease!));
      if (!owned) throw new Error('FIXTURE_OWNERSHIP_NOT_VERIFIED');
      await this.record('VERIFY_OWNERSHIP', 'VERIFIED', { ownership: 'CDLD_SYNTHETIC', resourceCount: this.lease.ownedResourceIds.length, scopeKind: this.lease.target.scope.kind });
      this.ownershipStatus = 'VERIFIED';

      activePhase = 'RESET';
      this.resetStatus = 'IN_PROGRESS';
      await this.record('RESET', 'IN_PROGRESS', { ownership: 'CDLD_SYNTHETIC', resourceCount: this.lease.ownedResourceIds.length });
      await withTimeout('RESET', this.options.operationTimeoutMs ?? 30_000, () => this.options.driver.reset(this.lease!));
      await this.record('RESET', 'VERIFIED', { ownership: 'CDLD_SYNTHETIC', resourceCount: this.lease.ownedResourceIds.length });
      this.resetStatus = 'VERIFIED';

      activePhase = 'VERIFY_RESET';
      this.resetVerificationStatus = 'IN_PROGRESS';
      await this.record('VERIFY_RESET', 'IN_PROGRESS');
      if (!await withTimeout('VERIFY_RESET', this.options.operationTimeoutMs ?? 30_000, () => this.options.driver.verifyReset(this.lease!))) throw new Error('FIXTURE_RESET_NOT_VERIFIED');
      await this.record('VERIFY_RESET', 'VERIFIED', { ownership: 'CDLD_SYNTHETIC' });
      this.resetVerificationStatus = 'VERIFIED';
      this.prepared = true;
      return this.lease;
    } catch (error) {
      const timedOut = error instanceof FixtureOperationTimeoutError;
      if (timedOut) this.interrupted = true;
      const status: FixturePhaseStatus = timedOut ? 'UNKNOWN' : 'FAILED';
      if (activePhase === 'SETUP') this.setupStatus = status;
      else if (activePhase === 'VERIFY_OWNERSHIP') this.ownershipStatus = status;
      else if (activePhase === 'RESET') this.resetStatus = status;
      else if (activePhase === 'VERIFY_RESET') this.resetVerificationStatus = status;
      try {
        await this.record(activePhase, status);
      } catch { /* Journal failure must not authorize proceeding or cleanup. */ }
      throw error;
    }
  }

  async bindTarget(actual: { fixtureId: string; target: SmokeTarget; runtimeIdentity: FixtureRuntimeTargetIdentity }): Promise<void> {
    if (!this.prepared || !this.lease || this.targetBindingStatus !== 'NOT_STARTED') throw new Error('FIXTURE_PRECONDITIONS_NOT_VERIFIED');
    this.targetBindingStatus = 'IN_PROGRESS';
    await this.record('TARGET_BINDING', 'IN_PROGRESS', { ownership: 'CDLD_SYNTHETIC', scopeKind: actual.target.scope.kind });
    if (actual.fixtureId !== this.lease.fixtureId || !targetEqual(actual.target, this.lease.target) || !validateRuntimeIdentity(actual.runtimeIdentity)
      || actual.runtimeIdentity.scopeKind !== actual.target.scope.kind) {
      this.targetBindingStatus = 'FAILED';
      await this.record('TARGET_BINDING', 'FAILED', { ownership: 'CDLD_SYNTHETIC', scopeKind: actual.target.scope.kind });
      throw new Error('FIXTURE_TARGET_BINDING_MISMATCH');
    }
    const identityHash = fixtureRuntimeIdentitySha256(actual.runtimeIdentity);
    const challenge = randomUUID();
    let attestation: FixtureTargetAttestation | null;
    try {
      attestation = await withTimeout('TARGET_BINDING', this.options.operationTimeoutMs ?? 30_000,
        () => this.options.driver.attestTargetBinding(this.lease!, actual.runtimeIdentity, challenge));
    } catch (error) {
      const timedOut = error instanceof FixtureOperationTimeoutError;
      const status: FixturePhaseStatus = timedOut ? 'UNKNOWN' : 'FAILED';
      if (timedOut) this.interrupted = true;
      this.targetBindingStatus = status;
      try { await this.record('TARGET_BINDING', status, { ownership: 'CDLD_SYNTHETIC', scopeKind: actual.target.scope.kind }); }
      catch { /* Journal failure cannot authorize RUN or turn failed evidence into success. */ }
      if (timedOut) throw error;
      throw new Error('FIXTURE_TARGET_ATTESTATION_NOT_VERIFIED', { cause: error });
    }
    if (!attestation || attestation.schemaVersion !== 1 || attestation.kind !== 'CDLD_FIXTURE_TARGET_ATTESTATION'
      || attestation.driverId !== this.lease.driverId || attestation.leaseId !== this.lease.leaseId
      || attestation.challenge !== challenge
      || typeof attestation.attestationId !== 'string' || !idPattern.test(attestation.attestationId)
      || typeof attestation.runtimeIdentitySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(attestation.runtimeIdentitySha256)
      || attestation.runtimeIdentitySha256 !== identityHash) {
      this.targetBindingStatus = 'FAILED';
      await this.record('TARGET_BINDING', 'FAILED', { ownership: 'CDLD_SYNTHETIC', scopeKind: actual.target.scope.kind });
      throw new Error('FIXTURE_TARGET_ATTESTATION_NOT_VERIFIED');
    }
    this.targetBindingStatus = 'VERIFIED';
    await this.record('TARGET_BINDING', 'VERIFIED', { ownership: 'CDLD_SYNTHETIC', scopeKind: actual.target.scope.kind, targetIdentitySha256: identityHash });
  }

  async startRun(): Promise<void> {
    if (!this.prepared || this.targetBindingStatus !== 'VERIFIED' || this.runStatus !== 'NOT_STARTED') throw new Error('FIXTURE_PRECONDITIONS_NOT_VERIFIED');
    this.runStatus = 'IN_PROGRESS';
    await this.record('RUN', 'IN_PROGRESS', { ownership: 'CDLD_SYNTHETIC' });
  }

  async finishRun(outcome: 'PASS' | 'FAIL' | 'UNKNOWN'): Promise<void> {
    if (this.runStatus !== 'IN_PROGRESS') throw new Error('FIXTURE_RUN_NOT_STARTED');
    this.runStatus = outcome === 'PASS' ? 'VERIFIED' : outcome === 'FAIL' ? 'FAILED' : 'UNKNOWN';
    await this.record('RUN', this.runStatus, { ownership: 'CDLD_SYNTHETIC' });
  }

  async finish(browserResourceClosureStatus: 'VERIFIED' | 'FAILED'): Promise<FixtureLifecycleSummary> {
    if (this.finished) return this.finished;
    this.browserResourceClosureStatus = browserResourceClosureStatus;
    try { await this.record('BROWSER_RESOURCES', browserResourceClosureStatus); }
    catch { this.browserResourceClosureStatus = 'UNKNOWN'; }

    if (this.lease && this.ownershipStatus === 'VERIFIED' && !this.interrupted) {
      try {
        this.teardownStatus = 'IN_PROGRESS';
        await this.record('TEARDOWN', 'IN_PROGRESS', { ownership: 'CDLD_SYNTHETIC', resourceCount: this.lease.ownedResourceIds.length });
        if (!await withTimeout('TEARDOWN', this.options.operationTimeoutMs ?? 30_000, () => this.options.driver.verifyOwnership(this.lease!))) throw new Error('FIXTURE_OWNERSHIP_NOT_VERIFIED');
        await withTimeout('TEARDOWN', this.options.operationTimeoutMs ?? 30_000, () => this.options.driver.teardown(this.lease!));
        this.teardownStatus = 'VERIFIED';
        await this.record('TEARDOWN', 'VERIFIED', { ownership: 'CDLD_SYNTHETIC', resourceCount: this.lease.ownedResourceIds.length });
      } catch (error) {
        this.teardownStatus = error instanceof FixtureOperationTimeoutError ? 'UNKNOWN' : 'FAILED';
        if (error instanceof FixtureOperationTimeoutError) this.interrupted = true;
        try { await this.record('TEARDOWN', this.teardownStatus); } catch { this.teardownStatus = 'UNKNOWN'; }
      }
      if (!this.interrupted) {
        try {
          await this.record('VERIFY_CLEANUP', 'IN_PROGRESS', { ownership: 'CDLD_SYNTHETIC' });
          const clean = await withTimeout('VERIFY_CLEANUP', this.options.operationTimeoutMs ?? 30_000, () => this.options.driver.verifyCleanup(this.lease!));
          this.cleanupVerificationStatus = clean ? 'VERIFIED' : 'FAILED';
          await this.record('VERIFY_CLEANUP', this.cleanupVerificationStatus, { ownership: 'CDLD_SYNTHETIC' });
        } catch {
          this.cleanupVerificationStatus = 'UNKNOWN';
          this.interrupted = true;
          try { await this.record('VERIFY_CLEANUP', 'UNKNOWN'); } catch { /* State remains UNKNOWN. */ }
        }
      } else {
        try { await this.record('VERIFY_CLEANUP', 'UNKNOWN'); } catch { /* State remains UNKNOWN. */ }
      }
    } else {
      this.teardownStatus = this.lease ? 'UNKNOWN' : 'NOT_STARTED';
      this.cleanupVerificationStatus = 'UNKNOWN';
      try {
        await this.record('TEARDOWN', this.teardownStatus);
        await this.record('VERIFY_CLEANUP', 'UNKNOWN');
      } catch { /* An unwritable journal cannot turn unknown cleanup into success. */ }
    }

    const requiredStatuses = [this.setupStatus, this.ownershipStatus, this.resetStatus, this.resetVerificationStatus,
      this.targetBindingStatus, this.runStatus, this.browserResourceClosureStatus, this.teardownStatus];
    const overallStatus = requiredStatuses.includes('FAILED') || this.cleanupVerificationStatus === 'FAILED' ? 'FAIL'
      : requiredStatuses.every((status) => status === 'VERIFIED') && this.cleanupVerificationStatus === 'VERIFIED' ? 'PASS' : 'UNKNOWN';
    this.finished = { schemaVersion: 1, runId: this.options.runId, fixtureId: this.options.request.fixtureId,
      driverId: this.options.driver.driverId, setupStatus: this.setupStatus, ownershipStatus: this.ownershipStatus,
      resetStatus: this.resetStatus, resetVerificationStatus: this.resetVerificationStatus,
      targetBindingStatus: this.targetBindingStatus, runStatus: this.runStatus, browserResourceClosureStatus: this.browserResourceClosureStatus,
      teardownStatus: this.teardownStatus, cleanupVerificationStatus: this.cleanupVerificationStatus,
      overallStatus: this.journalUnavailable && overallStatus === 'PASS' ? 'UNKNOWN' : overallStatus };
    try { await this.options.journal.close(); }
    catch { this.finished = { ...this.finished, cleanupVerificationStatus: this.finished.cleanupVerificationStatus === 'VERIFIED' ? 'UNKNOWN' : this.finished.cleanupVerificationStatus, overallStatus: 'UNKNOWN' }; }
    return this.finished;
  }
}

export function createDefaultFixtureLifecycleJournal(runId: string): FixtureLifecycleJournal {
  return new FileFixtureLifecycleJournal(runId);
}
