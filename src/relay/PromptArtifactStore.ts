import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export const PROMPT_PROJECT = 'Chrome-Dual-Layer-Debugger';
export const PROMPT_REPOSITORY = 'nakfreeajer/Chrome-Dual-Layer-Debugger';

export interface PromptIdentity {
  project: typeof PROMPT_PROJECT;
  repository: typeof PROMPT_REPOSITORY;
  milestoneId: string;
  promptSha256: string;
  promptByteLength: number;
}

export interface PromptIdentityInput {
  milestoneId: string;
  promptSha256: string;
  promptByteLength: number;
}

export interface PromptManifest extends PromptIdentity {
  schemaVersion: 1;
  promptPath: string;
  createdAt: string;
  initialLifecycleStatus: 'STAGED';
  supersedes: PromptIdentity | null;
}

export type PromptLifecycleStatus = 'STAGED' | 'AUTHORIZED' | 'SUPERSEDED' | 'SUPERSESSION_COMMITTED' | 'REVOKED';

export interface LifecycleReference {
  path: string;
  sha256: string;
}

export interface PromptLifecycleRecord extends PromptIdentity {
  schemaVersion: 1;
  status: PromptLifecycleStatus;
  createdAt: string;
  previousLifecycle: LifecycleReference | null;
  approvalReference?: string;
  replacement?: PromptIdentity;
}

export interface PromptLocator {
  schemaVersion: 1;
  project: typeof PROMPT_PROJECT;
  repository: typeof PROMPT_REPOSITORY;
  milestoneId: string;
  promptSha256: string;
  promptByteLength: number;
  manifestPath: string;
  manifestSha256: string;
  authorizationLifecycle: LifecycleReference;
  currentLifecycleStatus: 'AUTHORIZED' | 'REVOKED';
  currentLifecycle: LifecycleReference;
}

export interface StagedPrompt {
  identity: PromptIdentity;
  manifest: PromptManifest;
  stagedLifecycle: LifecycleReference;
}

export interface VerifiedAuthorizedPrompt {
  identity: PromptIdentity;
  manifest: PromptManifest;
  authorization: PromptLifecycleRecord;
  promptBytes: Buffer;
}

export interface PromptArtifactStoreOptions {
  /** Absolute or relative path to the ignored `.agent-work` directory. */
  agentWorkRoot: string;
}

export interface StagePromptOptions {
  milestoneId: string;
  promptBytes: Buffer;
  supersedes?: PromptIdentity;
}

export interface SupersedePromptOptions {
  promptBytes: Buffer;
  approvalReference: string;
}

const HASH_RE = /^[a-f0-9]{64}$/;
const MILESTONE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const AUTH_REF_RE = /\S/;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} must be a JSON object`);
  return value;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function validateMilestoneId(milestoneId: string): void {
  if (!MILESTONE_RE.test(milestoneId) || milestoneId.includes('..') || milestoneId.includes(':')) {
    throw new Error('Invalid milestoneId');
  }
}

function validateIdentityInput(input: PromptIdentityInput): void {
  validateMilestoneId(input.milestoneId);
  if (!HASH_RE.test(input.promptSha256)) throw new Error('Invalid promptSha256');
  if (!Number.isSafeInteger(input.promptByteLength) || input.promptByteLength < 0) throw new Error('Invalid promptByteLength');
}

function identityKey(identity: PromptIdentityInput): string {
  return `${identity.milestoneId}\0${identity.promptSha256}\0${identity.promptByteLength}`;
}

function sameIdentity(a: PromptIdentityInput, b: PromptIdentityInput): boolean {
  return identityKey(a) === identityKey(b);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], name: string): void {
  const got = Object.keys(value).sort();
  const want = [...expected].sort();
  if (got.length !== want.length || got.some((key, i) => key !== want[i])) {
    throw new Error(`${name} has missing or unexpected fields`);
  }
}

function assertTime(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || !value.endsWith('Z')) {
    throw new Error(`${name} must be an ISO UTC timestamp`);
  }
}

function referenceEqual(a: LifecycleReference, b: LifecycleReference): boolean {
  return a.path === b.path && a.sha256 === b.sha256;
}

export class PromptArtifactStore {
  private readonly root: string;
  private readonly promptsRoot: string;
  private readonly locatorPath: string;

  public constructor(options: PromptArtifactStoreOptions) {
    if (!path.isAbsolute(options.agentWorkRoot)) throw new Error('agentWorkRoot must be an absolute path');
    this.root = path.resolve(options.agentWorkRoot);
    this.promptsRoot = path.join(this.root, 'prompts');
    this.locatorPath = path.join(this.root, 'current', 'executor-prompt.json');
  }

  /** Publish exact bytes and an immutable STAGED manifest. Staging never authorizes execution. */
  public async stagePrompt(options: StagePromptOptions): Promise<StagedPrompt> {
    validateMilestoneId(options.milestoneId);
    if (!Buffer.isBuffer(options.promptBytes)) throw new Error('promptBytes must be a Buffer');
    if (options.supersedes) {
      validateIdentityInput(options.supersedes);
      if (options.supersedes.project !== PROMPT_PROJECT || options.supersedes.repository !== PROMPT_REPOSITORY) {
        throw new Error('Superseded prompt project identity mismatch');
      }
    }

    const identity: PromptIdentity = {
      project: PROMPT_PROJECT,
      repository: PROMPT_REPOSITORY,
      milestoneId: options.milestoneId,
      promptSha256: sha256(options.promptBytes),
      promptByteLength: options.promptBytes.length,
    };
    const promptPath = this.promptRelative(identity);
    const manifestPath = this.manifestRelative(identity);
    const manifestAbsolute = this.safeResolve(manifestPath);
    await mkdir(path.dirname(manifestAbsolute), { recursive: true });

    const existingManifest = await this.readOptional(manifestAbsolute);
    let manifest: PromptManifest;
    if (existingManifest) {
      manifest = this.parseManifest(existingManifest, identity);
      if (!sameOptionalIdentity(manifest.supersedes, options.supersedes ?? null)) {
        throw new Error('Existing immutable manifest has different supersession evidence');
      }
    } else {
      manifest = {
        schemaVersion: 1,
        ...identity,
        promptPath,
        createdAt: new Date().toISOString(),
        initialLifecycleStatus: 'STAGED',
        supersedes: options.supersedes ?? null,
      };
    }

    await this.publishImmutable(this.safeResolve(promptPath), options.promptBytes);
    const manifestBytes = existingManifest ?? jsonBytes(manifest);
    await this.publishImmutable(manifestAbsolute, manifestBytes);
    manifest = this.parseManifest(await readFile(manifestAbsolute), identity);

    const stagedLifecycle = await this.ensureStagedLifecycle(identity);
    return { identity, manifest, stagedLifecycle };
  }

  /** Record explicit prior approval and make this staged prompt the current locator target. */
  public async authorizePrompt(identityInput: PromptIdentityInput, approvalReference: string): Promise<PromptLocator> {
    const approval = this.validateApprovalReference(approvalReference);
    const current = await this.readCurrentLocatorIfPresent();
    if (current) {
      const currentIdentity = this.locatorIdentity(current);
      if (current.currentLifecycleStatus === 'AUTHORIZED') {
        if (sameIdentity(currentIdentity, identityInput)) {
          await this.loadVerifiedAuthorizedPrompt();
          return current;
        }
        throw new Error('A different prompt is already currently authorized; use supersedeCurrent()');
      }
      await this.verifyRevokedCurrent(current);
      if (sameIdentity(currentIdentity, identityInput)) {
        throw new Error('A revoked prompt identity cannot be re-authorized');
      }
    }

    const staged = await this.verifyStaged(identityInput);
    await this.assertIdentityNotTerminal(staged.identity);
    const authorization = await this.publishLifecycle({
      schemaVersion: 1,
      ...staged.identity,
      status: 'AUTHORIZED',
      createdAt: new Date().toISOString(),
      previousLifecycle: staged.stagedLifecycle,
      approvalReference: approval,
    });
    const locator = await this.verifyPublishedCandidate(staged.identity, authorization);
    await this.atomicReplace(this.locatorPath, jsonBytes(locator));
    const reread = await this.readLocator();
    if (!sameLocator(reread, locator)) throw new Error('Locator readback verification failed');
    return locator;
  }

  /**
   * Recover and verify the exact currently authorized prompt. No directory ordering or
   * filesystem timestamps participate in selection.
   */
  public async loadVerifiedAuthorizedPrompt(): Promise<VerifiedAuthorizedPrompt> {
    const locatorBytes = await readFile(this.locatorPath);
    const locator = this.parseLocator(locatorBytes);
    if (locator.currentLifecycleStatus !== 'AUTHORIZED') throw new Error('Current prompt is not authorized');
    const identity = this.locatorIdentity(locator);

    const lifecycleFiles = await this.readLifecycleSet(identity.milestoneId);
    if (lifecycleFiles.some(({ record }) => sameIdentity(record, identity) && record.status === 'REVOKED')) {
      throw new Error('Prompt has durable revocation evidence');
    }
    if (lifecycleFiles.some(({ record }) => sameIdentity(record, identity) && record.status === 'SUPERSESSION_COMMITTED')) {
      throw new Error('Prompt has been superseded');
    }

    const authorization = await this.readLifecycleReference(locator.currentLifecycle, identity);
    if (authorization.status !== 'AUTHORIZED' || !referenceEqual(locator.currentLifecycle, locator.authorizationLifecycle)) {
      throw new Error('Locator does not reference a valid authorization record');
    }
    this.validateApprovalReference(authorization.approvalReference ?? '');
    if (!authorization.previousLifecycle) throw new Error('Authorization is missing staged lifecycle evidence');
    const staged = await this.readLifecycleReference(authorization.previousLifecycle, identity);
    if (staged.status !== 'STAGED' || staged.previousLifecycle !== null) throw new Error('Invalid staged lifecycle evidence');

    const manifestBytes = await readFile(this.safeResolve(locator.manifestPath));
    if (sha256(manifestBytes) !== locator.manifestSha256) throw new Error('Manifest SHA-256 mismatch');
    const manifest = this.parseManifest(manifestBytes, identity);
    if (manifest.promptPath !== this.promptRelative(identity)) throw new Error('Manifest prompt path mismatch');

    const promptBytes = await readFile(this.safeResolve(manifest.promptPath));
    if (promptBytes.length !== identity.promptByteLength) throw new Error('Prompt byte-length mismatch');
    if (sha256(promptBytes) !== identity.promptSha256) throw new Error('Prompt SHA-256 mismatch');
    if (!sameIdentity(identity, manifest)) throw new Error('Prompt identity mismatch');

    // Re-read the mutable locator to fail closed if it changed while verification ran.
    const finalLocator = this.parseLocator(await readFile(this.locatorPath));
    if (!sameLocator(finalLocator, locator)) throw new Error('Locator changed during prompt verification');
    return { identity, manifest, authorization, promptBytes };
  }

  /** Supersede the current authorization without overwriting its historical artifacts. */
  public async supersedeCurrent(options: SupersedePromptOptions): Promise<VerifiedAuthorizedPrompt> {
    const approval = this.validateApprovalReference(options.approvalReference);
    const prior = await this.loadVerifiedAuthorizedPrompt();
    const staged = await this.stagePrompt({
      milestoneId: prior.identity.milestoneId,
      promptBytes: options.promptBytes,
      supersedes: identityInput(prior.identity),
    });
    const newAuthorization = await this.publishLifecycle({
      schemaVersion: 1,
      ...staged.identity,
      status: 'AUTHORIZED',
      createdAt: new Date().toISOString(),
      previousLifecycle: staged.stagedLifecycle,
      approvalReference: approval,
    });
    const newLocator = await this.verifyPublishedCandidate(staged.identity, newAuthorization);
    const newLocatorBytes = jsonBytes(newLocator);

    const priorAuthorizationRef = await this.locatorReferenceFrom(prior);
    const supersededReference = await this.publishLifecycle({
      schemaVersion: 1,
      ...prior.identity,
      status: 'SUPERSEDED',
      createdAt: new Date().toISOString(),
      previousLifecycle: priorAuthorizationRef,
      replacement: identityInput(staged.identity),
    });
    await this.atomicReplace(this.locatorPath, newLocatorBytes);
    // This completion record makes supersession durable across later locator tampering.
    await this.publishLifecycle({
      schemaVersion: 1,
      ...prior.identity,
      status: 'SUPERSESSION_COMMITTED',
      createdAt: new Date().toISOString(),
      previousLifecycle: supersededReference,
      replacement: identityInput(staged.identity),
    });
    return this.loadVerifiedAuthorizedPrompt();
  }

  /** Revoke the current prompt. The immutable revocation record takes effect immediately. */
  public async revokeCurrent(approvalReference: string): Promise<LifecycleReference> {
    const approval = this.validateApprovalReference(approvalReference);
    const current = await this.loadVerifiedAuthorizedPrompt();
    const authorizationReference = await this.locatorReferenceFrom(current);
    const reference = await this.publishLifecycle({
      schemaVersion: 1,
      ...current.identity,
      status: 'REVOKED',
      createdAt: new Date().toISOString(),
      previousLifecycle: authorizationReference,
      approvalReference: approval,
    });
    const revokedLocator: PromptLocator = {
      ...this.makeLocator(current.identity, current.manifest, authorizationReference),
      currentLifecycleStatus: 'REVOKED',
      currentLifecycle: reference,
    };
    await this.atomicReplace(this.locatorPath, jsonBytes(revokedLocator));
    return reference;
  }

  private validateApprovalReference(value: string): string {
    if (typeof value !== 'string' || !AUTH_REF_RE.test(value) || value.trim().length === 0) {
      throw new Error('An explicit non-empty approvalReference is required');
    }
    return value;
  }

  private promptRelative(identity: PromptIdentityInput): string {
    validateIdentityInput(identity);
    return `prompts/${identity.milestoneId}/${identity.promptSha256}.md`;
  }

  private manifestRelative(identity: PromptIdentityInput): string {
    validateIdentityInput(identity);
    return `prompts/${identity.milestoneId}/${identity.promptSha256}.json`;
  }

  private lifecycleDirectory(milestoneId: string): string {
    validateMilestoneId(milestoneId);
    return this.safeResolve(`prompts/${milestoneId}/lifecycle`);
  }

  private safeResolve(relative: string): string {
    if (typeof relative !== 'string' || relative.length === 0 || relative.includes('\\') || relative.includes(':') || path.isAbsolute(relative)) {
      throw new Error('Unsafe artifact path');
    }
    const segments = relative.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) throw new Error('Unsafe artifact path');
    const resolved = path.resolve(this.root, ...segments);
    const rel = path.relative(this.root, resolved);
    if (rel === '' || rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) throw new Error('Artifact path escapes .agent-work');
    return resolved;
  }

  private async readOptional(filePath: string): Promise<Buffer | undefined> {
    try { return await readFile(filePath); }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return undefined;
      throw error;
    }
  }

  private async publishImmutable(finalPath: string, bytes: Buffer): Promise<void> {
    await mkdir(path.dirname(finalPath), { recursive: true });
    const temporary = path.join(path.dirname(finalPath), `.tmp-${randomUUID()}`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      try {
        // Same-directory hard-link publication is atomic and fails with EEXIST; it never replaces.
        await link(temporary, finalPath);
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'EEXIST') throw error;
        const existing = await readFile(finalPath);
        if (!existing.equals(bytes)) throw new Error(`Immutable artifact collision at ${finalPath}`);
      }
      await unlink(temporary);
      await this.syncDirectory(path.dirname(finalPath));
      const readback = await readFile(finalPath);
      if (!readback.equals(bytes)) throw new Error(`Immutable artifact readback mismatch at ${finalPath}`);
    } finally {
      if (handle) await handle.close().catch(() => undefined);
      await unlink(temporary).catch((error) => {
        if (!isNodeError(error) || error.code !== 'ENOENT') throw error;
      });
    }
  }

  private async atomicReplace(finalPath: string, bytes: Buffer): Promise<void> {
    await mkdir(path.dirname(finalPath), { recursive: true });
    const temporary = path.join(path.dirname(finalPath), `.tmp-${randomUUID()}`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      // Node maps same-volume rename to an atomic replace operation on supported local filesystems.
      await rename(temporary, finalPath);
      await this.syncDirectory(path.dirname(finalPath));
      const readback = await readFile(finalPath);
      if (!readback.equals(bytes)) throw new Error('Mutable locator readback mismatch');
    } finally {
      if (handle) await handle.close().catch(() => undefined);
      await unlink(temporary).catch((error) => {
        if (!isNodeError(error) || error.code !== 'ENOENT') throw error;
      });
    }
  }

  private async syncDirectory(directory: string): Promise<void> {
    try {
      const handle = await open(directory, 'r');
      try { await handle.sync(); } finally { await handle.close(); }
    } catch (error) {
      // Windows commonly does not permit opening directories for fsync; file data is synced.
      if (process.platform !== 'win32') throw error;
    }
  }

  private parseJson(bytes: Buffer, name: string): unknown {
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
    catch { throw new Error(`${name} contains malformed JSON`); }
  }

  private parseManifest(bytes: Buffer, identity: PromptIdentityInput): PromptManifest {
    const value = requireRecord(this.parseJson(bytes, 'Manifest'), 'Manifest');
    exactKeys(value, ['schemaVersion', 'project', 'repository', 'milestoneId', 'promptSha256', 'promptByteLength', 'promptPath', 'createdAt', 'initialLifecycleStatus', 'supersedes'], 'Manifest');
    if (value.schemaVersion !== 1 || value.project !== PROMPT_PROJECT || value.repository !== PROMPT_REPOSITORY) throw new Error('Manifest project/schema mismatch');
    const got = parseIdentityFields(value, 'Manifest');
    if (!sameIdentity(got, identity)) throw new Error('Manifest identity mismatch');
    if (value.promptPath !== this.promptRelative(identity)) throw new Error('Manifest path is invalid');
    assertTime(value.createdAt, 'Manifest.createdAt');
    if (value.initialLifecycleStatus !== 'STAGED') throw new Error('Manifest initial status is invalid');
    const supersedes = parseOptionalIdentity(value.supersedes, 'Manifest.supersedes');
    return value as unknown as PromptManifest;
  }

  private parseLocator(bytes: Buffer): PromptLocator {
    const value = requireRecord(this.parseJson(bytes, 'Locator'), 'Locator');
    exactKeys(value, ['schemaVersion', 'project', 'repository', 'milestoneId', 'promptSha256', 'promptByteLength', 'manifestPath', 'manifestSha256', 'authorizationLifecycle', 'currentLifecycleStatus', 'currentLifecycle'], 'Locator');
    if (value.schemaVersion !== 1 || value.project !== PROMPT_PROJECT || value.repository !== PROMPT_REPOSITORY) throw new Error('Locator project/schema mismatch');
    const identity = parseIdentityFields(value, 'Locator');
    if (value.manifestPath !== this.manifestRelative(identity)) throw new Error('Locator manifest path is invalid');
    if (typeof value.manifestSha256 !== 'string' || !HASH_RE.test(value.manifestSha256)) throw new Error('Locator manifest hash is invalid');
    const auth = parseLifecycleReference(value.authorizationLifecycle, 'Locator.authorizationLifecycle');
    const current = parseLifecycleReference(value.currentLifecycle, 'Locator.currentLifecycle');
    if (current.path !== auth.path || current.sha256 !== auth.sha256) {
      if (value.currentLifecycleStatus !== 'REVOKED') throw new Error('Locator lifecycle references conflict');
    }
    if (value.currentLifecycleStatus !== 'AUTHORIZED' && value.currentLifecycleStatus !== 'REVOKED') throw new Error('Locator lifecycle status is invalid');
    this.safeResolve(value.manifestPath);
    this.safeResolve(auth.path);
    this.safeResolve(current.path);
    return value as unknown as PromptLocator;
  }

  private async readLocator(): Promise<PromptLocator> {
    return this.parseLocator(await readFile(this.locatorPath));
  }

  private async readCurrentLocatorIfPresent(): Promise<PromptLocator | undefined> {
    try { return this.parseLocator(await readFile(this.locatorPath)); }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return undefined;
      throw error;
    }
  }

  private async verifyRevokedCurrent(locator: PromptLocator): Promise<void> {
    if (locator.currentLifecycleStatus !== 'REVOKED') throw new Error('Current prompt is not revoked');
    const identity = this.locatorIdentity(locator);
    if (referenceEqual(locator.currentLifecycle, locator.authorizationLifecycle)) {
      throw new Error('Revoked locator does not reference distinct revocation evidence');
    }
    const authorization = await this.readLifecycleReference(locator.authorizationLifecycle, identity);
    if (authorization.status !== 'AUTHORIZED' || !authorization.previousLifecycle || !authorization.approvalReference) {
      throw new Error('Revoked locator has invalid original authorization evidence');
    }
    this.validateApprovalReference(authorization.approvalReference);
    const staged = await this.readLifecycleReference(authorization.previousLifecycle, identity);
    if (staged.status !== 'STAGED' || staged.previousLifecycle !== null) throw new Error('Revoked locator has invalid staged evidence');

    const revoke = await this.readLifecycleReference(locator.currentLifecycle, identity);
    if (revoke.status !== 'REVOKED' || !revoke.previousLifecycle || !referenceEqual(revoke.previousLifecycle, locator.authorizationLifecycle)) {
      throw new Error('Revoked lifecycle evidence does not reference the current authorization');
    }
    this.validateApprovalReference(revoke.approvalReference ?? '');

    const lifecycleFiles = await this.readLifecycleSet(identity.milestoneId);
    if (!lifecycleFiles.some(({ reference, record }) => referenceEqual(reference, locator.currentLifecycle)
      && sameIdentity(record, identity) && record.status === 'REVOKED')) {
      throw new Error('Referenced revocation lifecycle evidence is missing');
    }
    if (lifecycleFiles.some(({ record }) => sameIdentity(record, identity) && record.status === 'SUPERSESSION_COMMITTED')) {
      throw new Error('Superseded prompt cannot be treated as a revocation transition');
    }

    const manifestBytes = await readFile(this.safeResolve(locator.manifestPath));
    if (sha256(manifestBytes) !== locator.manifestSha256) throw new Error('Revoked prompt manifest hash mismatch');
    const manifest = this.parseManifest(manifestBytes, identity);
    const promptBytes = await readFile(this.safeResolve(manifest.promptPath));
    if (promptBytes.length !== identity.promptByteLength || sha256(promptBytes) !== identity.promptSha256) {
      throw new Error('Revoked prompt artifact integrity check failed');
    }
    if (!sameLocator(await this.readLocator(), locator)) throw new Error('Revoked locator changed during verification');
  }

  private async assertIdentityNotTerminal(identity: PromptIdentityInput): Promise<void> {
    const events = await this.readLifecycleSet(identity.milestoneId);
    if (events.some(({ record }) => sameIdentity(record, identity)
      && (record.status === 'REVOKED' || record.status === 'SUPERSESSION_COMMITTED'))) {
      throw new Error('Prompt identity has durable terminal lifecycle evidence and cannot be re-authorized');
    }
  }

  private locatorIdentity(locator: PromptLocator): PromptIdentity {
    return {
      project: locator.project,
      repository: locator.repository,
      milestoneId: locator.milestoneId,
      promptSha256: locator.promptSha256,
      promptByteLength: locator.promptByteLength,
    };
  }

  private makeLocator(identity: PromptIdentity, manifest: PromptManifest, authorization: LifecycleReference): PromptLocator {
    const manifestBytes = jsonBytes(manifest);
    return {
      schemaVersion: 1,
      project: PROMPT_PROJECT,
      repository: PROMPT_REPOSITORY,
      milestoneId: identity.milestoneId,
      promptSha256: identity.promptSha256,
      promptByteLength: identity.promptByteLength,
      manifestPath: this.manifestRelative(identity),
      manifestSha256: sha256(manifestBytes),
      authorizationLifecycle: authorization,
      currentLifecycleStatus: 'AUTHORIZED',
      currentLifecycle: authorization,
    };
  }

  private async verifyStaged(input: PromptIdentityInput): Promise<StagedPrompt> {
    validateIdentityInput(input);
    const identity: PromptIdentity = { project: PROMPT_PROJECT, repository: PROMPT_REPOSITORY, ...input };
    const manifestBytes = await readFile(this.safeResolve(this.manifestRelative(identity)));
    const manifest = this.parseManifest(manifestBytes, identity);
    const promptBytes = await readFile(this.safeResolve(manifest.promptPath));
    if (promptBytes.length !== identity.promptByteLength || sha256(promptBytes) !== identity.promptSha256) throw new Error('Staged prompt integrity check failed');
    const stagedLifecycle = await this.ensureStagedLifecycle(identity);
    return { identity, manifest, stagedLifecycle };
  }

  private async verifyPublishedCandidate(
    identity: PromptIdentity,
    authorizationReference: LifecycleReference,
  ): Promise<PromptLocator> {
    const authorization = await this.readLifecycleReference(authorizationReference, identity);
    if (authorization.status !== 'AUTHORIZED' || !authorization.previousLifecycle || !authorization.approvalReference) {
      throw new Error('Candidate authorization evidence is incomplete');
    }
    this.validateApprovalReference(authorization.approvalReference);
    const staged = await this.readLifecycleReference(authorization.previousLifecycle, identity);
    if (staged.status !== 'STAGED' || staged.previousLifecycle !== null) throw new Error('Candidate staged evidence is invalid');

    const manifestPath = this.manifestRelative(identity);
    const manifestBytes = await readFile(this.safeResolve(manifestPath));
    const manifest = this.parseManifest(manifestBytes, identity);
    const promptBytes = await readFile(this.safeResolve(manifest.promptPath));
    if (promptBytes.length !== identity.promptByteLength || sha256(promptBytes) !== identity.promptSha256) {
      throw new Error('Candidate prompt integrity verification failed');
    }
    return this.makeLocator(identity, manifest, authorizationReference);
  }

  private async ensureStagedLifecycle(identity: PromptIdentity): Promise<LifecycleReference> {
    const events = await this.readLifecycleSet(identity.milestoneId);
    const matching = events.filter(({ record }) => sameIdentity(record, identity) && record.status === 'STAGED');
    if (matching.length > 1) throw new Error('Conflicting staged lifecycle records');
    if (matching.length === 1) {
      if (matching[0]!.record.previousLifecycle !== null) throw new Error('Staged lifecycle has unexpected predecessor');
      return matching[0]!.reference;
    }
    return this.publishLifecycle({
      schemaVersion: 1,
      ...identity,
      status: 'STAGED',
      createdAt: new Date().toISOString(),
      previousLifecycle: null,
    });
  }

  private async publishLifecycle(record: PromptLifecycleRecord): Promise<LifecycleReference> {
    validateIdentityInput(record);
    if (record.project !== PROMPT_PROJECT || record.repository !== PROMPT_REPOSITORY || record.schemaVersion !== 1) {
      throw new Error('Lifecycle project/schema mismatch');
    }
    if (!['STAGED', 'AUTHORIZED', 'SUPERSEDED', 'SUPERSESSION_COMMITTED', 'REVOKED'].includes(record.status)) throw new Error('Invalid lifecycle status');
    assertTime(record.createdAt, 'Lifecycle.createdAt');
    if (record.approvalReference !== undefined) this.validateApprovalReference(record.approvalReference);
    if (record.previousLifecycle) await this.readLifecycleReference(record.previousLifecycle, record);
    const bytes = jsonBytes(record);
    const digest = sha256(bytes);
    const relative = `prompts/${record.milestoneId}/lifecycle/${digest}.json`;
    const finalPath = this.safeResolve(relative);
    await this.publishImmutable(finalPath, bytes);
    return { path: relative, sha256: digest };
  }

  private async readLifecycleReference(reference: LifecycleReference, identity: PromptIdentityInput): Promise<PromptLifecycleRecord> {
    const parsed = parseLifecycleReference(reference, 'Lifecycle reference');
    const expectedPath = `prompts/${identity.milestoneId}/lifecycle/${parsed.sha256}.json`;
    if (parsed.path !== expectedPath) throw new Error('Lifecycle path identity mismatch');
    const bytes = await readFile(this.safeResolve(parsed.path));
    if (sha256(bytes) !== parsed.sha256) throw new Error('Lifecycle SHA-256 mismatch');
    const record = this.parseLifecycle(bytes);
    if (!sameIdentity(record, identity)) throw new Error('Lifecycle identity mismatch');
    return record;
  }

  private parseLifecycle(bytes: Buffer): PromptLifecycleRecord {
    const value = requireRecord(this.parseJson(bytes, 'Lifecycle'), 'Lifecycle');
    const allowed = ['schemaVersion', 'project', 'repository', 'milestoneId', 'promptSha256', 'promptByteLength', 'status', 'createdAt', 'previousLifecycle', 'approvalReference', 'replacement'];
    const required = allowed.filter((key) => key !== 'approvalReference' && key !== 'replacement');
    const keys = Object.keys(value);
    if (required.some((key) => !(key in value)) || keys.some((key) => !allowed.includes(key))) throw new Error('Lifecycle has missing or unexpected fields');
    if (value.schemaVersion !== 1 || value.project !== PROMPT_PROJECT || value.repository !== PROMPT_REPOSITORY) throw new Error('Lifecycle project/schema mismatch');
    parseIdentityFields(value, 'Lifecycle');
    if (!['STAGED', 'AUTHORIZED', 'SUPERSEDED', 'SUPERSESSION_COMMITTED', 'REVOKED'].includes(String(value.status))) throw new Error('Lifecycle status is invalid');
    assertTime(value.createdAt, 'Lifecycle.createdAt');
    const previous = value.previousLifecycle === null ? null : parseLifecycleReference(value.previousLifecycle, 'Lifecycle.previousLifecycle');
    if (value.approvalReference !== undefined) this.validateApprovalReference(requireString(value.approvalReference, 'Lifecycle.approvalReference'));
    if (value.replacement !== undefined) parseOptionalIdentity(value.replacement, 'Lifecycle.replacement');
    if (value.status === 'STAGED' && (previous !== null || value.approvalReference !== undefined || value.replacement !== undefined)) {
      throw new Error('STAGED lifecycle fields are invalid');
    }
    if (value.status === 'AUTHORIZED' && (previous === null || value.approvalReference === undefined || value.replacement !== undefined)) {
      throw new Error('AUTHORIZED lifecycle fields are invalid');
    }
    if (value.status === 'REVOKED' && (previous === null || value.approvalReference === undefined || value.replacement !== undefined)) {
      throw new Error('REVOKED lifecycle fields are invalid');
    }
    if ((value.status === 'SUPERSEDED' || value.status === 'SUPERSESSION_COMMITTED') && (previous === null || value.replacement === undefined || value.approvalReference !== undefined)) {
      throw new Error('SUPERSESSION lifecycle fields are invalid');
    }
    return value as unknown as PromptLifecycleRecord;
  }

  private async readLifecycleSet(milestoneId: string): Promise<Array<{ reference: LifecycleReference; record: PromptLifecycleRecord }>> {
    const directory = this.lifecycleDirectory(milestoneId);
    let names: string[];
    try { names = await readdir(directory); }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return [];
      throw error;
    }
    const output: Array<{ reference: LifecycleReference; record: PromptLifecycleRecord }> = [];
    for (const name of names) {
      // A process may stop after creating a synced temporary sibling but before publishing it.
      // Temporary names are never authority and are ignored; they are not cleaned by recovery.
      if (/^\.tmp-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(name)) continue;
      if (!/^[a-f0-9]{64}\.json$/.test(name)) throw new Error('Unexpected lifecycle entry');
      const reference = { path: `prompts/${milestoneId}/lifecycle/${name}`, sha256: name.slice(0, 64) };
      const bytes = await readFile(this.safeResolve(reference.path));
      if (sha256(bytes) !== reference.sha256) throw new Error('Lifecycle SHA-256 mismatch');
      const record = this.parseLifecycle(bytes);
      if (record.milestoneId !== milestoneId) throw new Error('Lifecycle milestone mismatch');
      output.push({ reference, record });
    }
    return output;
  }

  private async locatorReferenceFrom(prompt: VerifiedAuthorizedPrompt): Promise<LifecycleReference> {
    const locator = await this.readLocator();
    if (!sameIdentity(this.locatorIdentity(locator), prompt.identity)) throw new Error('Current locator changed');
    return locator.currentLifecycle;
  }
}

function parseIdentityFields(value: Record<string, unknown>, name: string): PromptIdentityInput {
  const milestoneId = requireString(value.milestoneId, `${name}.milestoneId`);
  validateMilestoneId(milestoneId);
  const promptSha256 = requireString(value.promptSha256, `${name}.promptSha256`);
  const promptByteLength = value.promptByteLength;
  if (!HASH_RE.test(promptSha256) || !Number.isSafeInteger(promptByteLength) || (promptByteLength as number) < 0) {
    throw new Error(`${name} prompt identity is malformed`);
  }
  return { milestoneId, promptSha256, promptByteLength: promptByteLength as number };
}

function parseOptionalIdentity(value: unknown, name: string): PromptIdentity | null {
  if (value === null) return null;
  const record = requireRecord(value, name);
  exactKeys(record, ['project', 'repository', 'milestoneId', 'promptSha256', 'promptByteLength'], name);
  if (record.project !== PROMPT_PROJECT || record.repository !== PROMPT_REPOSITORY) throw new Error(`${name} project identity mismatch`);
  const identity = parseIdentityFields(record, name);
  return { project: PROMPT_PROJECT, repository: PROMPT_REPOSITORY, ...identity };
}

function sameOptionalIdentity(a: PromptIdentity | null, b: PromptIdentity | null): boolean {
  return a === null || b === null ? a === b : sameIdentity(a, b);
}

function parseLifecycleReference(value: unknown, name: string): LifecycleReference {
  const record = requireRecord(value, name);
  exactKeys(record, ['path', 'sha256'], name);
  const filePath = requireString(record.path, `${name}.path`);
  const digest = requireString(record.sha256, `${name}.sha256`);
  if (!HASH_RE.test(digest) || filePath.includes('\\') || filePath.includes(':') || path.isAbsolute(filePath) || filePath.split('/').some((part) => part === '..' || part === '.' || part === '')) {
    throw new Error(`${name} is unsafe`);
  }
  return { path: filePath, sha256: digest };
}

function sameLocator(a: PromptLocator, b: PromptLocator): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function identityInput(identity: PromptIdentityInput): PromptIdentity {
  return {
    project: PROMPT_PROJECT,
    repository: PROMPT_REPOSITORY,
    milestoneId: identity.milestoneId,
    promptSha256: identity.promptSha256,
    promptByteLength: identity.promptByteLength,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
