import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileFixtureLifecycleJournal,
  FixtureLifecycleController,
  fixtureCleanupStatusFromEvidence,
  fixtureRuntimeIdentitySha256,
  readFixtureLifecycleJournal,
  type FixtureLifecycleEvidence,
  type FixtureLifecycleJournal,
  type FixtureTargetAttestation,
  type FixtureRuntimeTargetIdentity,
  type SyntheticFixtureDriver,
  type SyntheticFixtureLease
} from '../../src/testing/FixtureLifecycle.js';
import type { SmokeTarget } from '../../src/testing/SmokeScenario.js';
import { PlaywrightBrowserDiscovery, type RunnerOwnedPageReceipt, type RunnerOwnedPageVerification } from '../../src/browser/PlaywrightBrowserDiscovery.js';

const target: SmokeTarget = { pageUrl: 'http://127.0.0.1/synthetic', scope: { kind: 'PAGE' } };
const pageIdentity: FixtureRuntimeTargetIdentity = { backend: 'PLAYWRIGHT', scopeKind: 'PAGE', contextId: 'CONTEXT-0001', pageId: 'PAGE-0001' };
const pageBinding = { fixtureId: 'fixture-test', target, runtimeIdentity: pageIdentity };
let generatedRuntimeTargetSequence = 0;

/** Seed the discovery-owned registry as a deterministic test fixture, then use the real one-use verifier. */
function ownerVerification(leaseId: string, identity: FixtureRuntimeTargetIdentity): { verification?: RunnerOwnedPageVerification; page: object } {
  if (identity.backend !== 'PLAYWRIGHT' || identity.scopeKind !== 'PAGE') return { page: {} };
  const discovery = Object.create(PlaywrightBrowserDiscovery.prototype) as PlaywrightBrowserDiscovery;
  let closed = false;
  const page = { isClosed: () => closed, async close() { closed = true; } } as unknown as import('playwright').Page;
  const context = { pages: () => [page] } as unknown as import('playwright').BrowserContext;
  const receipt = Object.freeze({}) as RunnerOwnedPageReceipt;
  const state = discovery as unknown as {
    browser: import('playwright').Browser;
    ids: { forContext(value: object): string; forPage(value: object): string };
    runnerOwnedPages: Set<import('playwright').Page>;
    runnerOwnedPageReceipts: Map<RunnerOwnedPageReceipt, { leaseId: string; page: import('playwright').Page;
      context: import('playwright').BrowserContext; contextId: string; pageId: string }>;
    runnerOwnedFixtureLeases: Set<string>;
  };
  state.browser = { contexts: () => [context] } as unknown as import('playwright').Browser;
  state.ids = { forContext: () => identity.contextId, forPage: () => identity.pageId };
  state.runnerOwnedPages = new Set([page]);
  state.runnerOwnedPageReceipts = new Map([[receipt, { leaseId, page, context,
    contextId: identity.contextId, pageId: identity.pageId }]]);
  state.runnerOwnedFixtureLeases = new Set([leaseId]);
  return { verification: discovery.consumeRunnerOwnedPageReceipt(receipt, leaseId, page, identity as never) ?? undefined, page };
}

function identityEqual(left: FixtureRuntimeTargetIdentity, right: FixtureRuntimeTargetIdentity): boolean {
  return fixtureRuntimeIdentitySha256(left) === fixtureRuntimeIdentitySha256(right);
}

function createDriver(options: { leaseId?: string; runtimeIdentity?: FixtureRuntimeTargetIdentity; runtimeOwnedByLease?: boolean;
  target?: SmokeTarget; attestation?: (lease: SyntheticFixtureLease, actual: FixtureRuntimeTargetIdentity, challenge: string, valid: FixtureTargetAttestationFactory) => Promise<unknown> | unknown } = {}) {
  const calls: string[] = [];
  const leaseTarget = options.target ?? target;
  const lease: SyntheticFixtureLease = { schemaVersion: 1, kind: 'CDLD_SYNTHETIC_FIXTURE_LEASE', ownership: 'CDLD_SYNTHETIC',
    fixtureId: 'fixture-test', driverId: 'synthetic-driver', leaseId: options.leaseId ?? 'lease-test', target: leaseTarget, ownedResourceIds: ['owned-data-set', 'owned-resource'] };
  let hostRuntimeIdentity: FixtureRuntimeTargetIdentity | undefined;
  let runtimeCreatedAfterSetup = false;
  let runtimeLeaseId: string | undefined;
  const createRuntimeTarget = (identity?: FixtureRuntimeTargetIdentity, ownedByLease = options.runtimeOwnedByLease ?? true) => {
    assert.ok(calls.includes('setup'), 'runtime is created only after setup returns its data/resource lease');
    assert.equal(hostRuntimeIdentity, undefined, 'fake host creates one runtime target per fixture lease');
    hostRuntimeIdentity = identity ?? options.runtimeIdentity ?? pageIdentity;
    generatedRuntimeTargetSequence += 1;
    runtimeCreatedAfterSetup = true;
    runtimeLeaseId = ownedByLease ? lease.leaseId : 'pre-existing-foreign-lease';
    calls.push('runtime:create');
  };
  const registerPreExistingTarget = (identity: FixtureRuntimeTargetIdentity = pageIdentity) => {
    assert.equal(hostRuntimeIdentity, undefined);
    hostRuntimeIdentity = identity;
    runtimeCreatedAfterSetup = false;
    runtimeLeaseId = 'pre-existing-foreign-lease';
    calls.push('runtime:preexisting');
  };
  const issueAttestation: FixtureTargetAttestationFactory = (actualLease, actual, challenge) => ({ schemaVersion: 1,
    kind: 'CDLD_FIXTURE_TARGET_ATTESTATION', driverId: 'synthetic-driver', leaseId: actualLease.leaseId,
    challenge, attestationId: `attestation-${calls.filter((call) => call === 'attest').length}`, runtimeIdentitySha256: fixtureRuntimeIdentitySha256(actual) });
  const driver: SyntheticFixtureDriver = {
    driverId: 'synthetic-driver',
    async setup() { calls.push('setup'); return lease; },
    async verifyOwnership() { calls.push('verifyOwnership'); return true; },
    async reset() { calls.push('reset'); },
    async verifyReset() { calls.push('verifyReset'); return true; },
    async attestTargetBinding(actualLease, actual, challenge) {
      calls.push('attest');
      if (options.attestation) return await options.attestation(actualLease, actual, challenge, issueAttestation) as FixtureTargetAttestation | null;
      // This trusted fake-host registry is separate from both the setup response and caller's actual identity.
      // It only provisions runtime ownership after the runner has created the target, then compares exact identity.
      if (!runtimeCreatedAfterSetup || runtimeLeaseId !== actualLease.leaseId || actualLease.leaseId !== lease.leaseId
        || !hostRuntimeIdentity || !identityEqual(hostRuntimeIdentity, actual)) return null;
      return issueAttestation(actualLease, hostRuntimeIdentity, challenge);
    },
    async teardown() { calls.push('teardown'); },
    async verifyCleanup() { calls.push('verifyCleanup'); return true; }
  };
  return { driver, lease, calls, createRuntimeTarget, registerPreExistingTarget, get hostRuntimeIdentity() { return hostRuntimeIdentity; } };
}

function bindingFor(driver: ReturnType<typeof createDriver>, fixtureTarget: SmokeTarget = target,
  runtimeIdentity: FixtureRuntimeTargetIdentity = driver.hostRuntimeIdentity!) {
  assert.ok(driver.hostRuntimeIdentity, 'host runtime target must exist before binding');
  const owner = driver.calls.includes('runtime:create') && driver.hostRuntimeIdentity?.backend === 'PLAYWRIGHT'
    ? ownerVerification(driver.lease.leaseId, driver.hostRuntimeIdentity) : undefined;
  return { fixtureId: 'fixture-test', target: fixtureTarget, runtimeIdentity,
    ownerVerification: owner?.verification, page: owner?.page };
}

type FixtureTargetAttestationFactory = (lease: SyntheticFixtureLease, identity: FixtureRuntimeTargetIdentity, challenge: string) => FixtureTargetAttestation;

function memoryJournal() {
  const entries: FixtureLifecycleEvidence[] = [];
  let closed = 0;
  const journal: FixtureLifecycleJournal = { async record(entry) { entries.push(entry); }, async close() { closed += 1; } };
  return { journal, entries, get closed() { return closed; } };
}

function controller(driver: SyntheticFixtureDriver, journal = memoryJournal(), operationTimeoutMs = 100, fixtureTarget = target, fixtureId = 'fixture-test') {
  return { instance: new FixtureLifecycleController({ driver, request: { fixtureId, target: fixtureTarget }, runId: 'run-test', journal: journal.journal, operationTimeoutMs,
  }), journal };
}

test('two-stage fake-host lifecycle leases data before runtime creation, then attests exact target before RUN and independently verifies cleanup', async () => {
  const f = createDriver(); const j = memoryJournal(); const c = controller(f.driver, j);
  await c.instance.prepare();
  assert.deepEqual(f.calls, ['setup', 'verifyOwnership', 'reset', 'verifyReset']);
  assert.equal(f.hostRuntimeIdentity, undefined, 'setup lease contains no runtime identity and no page exists yet');
  f.createRuntimeTarget();
  await c.instance.bindTarget(bindingFor(f));
  await c.instance.startRun(); await c.instance.finishRun('PASS');
  const summary = await c.instance.finish('VERIFIED');
  assert.equal(summary.overallStatus, 'PASS');
  assert.deepEqual(f.calls, ['setup', 'verifyOwnership', 'reset', 'verifyReset', 'runtime:create', 'attest', 'verifyOwnership', 'teardown', 'verifyCleanup']);
  assert.equal(j.entries.find((entry) => entry.phase === 'TARGET_BINDING' && entry.status === 'VERIFIED')?.scopeKind, 'PAGE');
  assert.equal(fixtureCleanupStatusFromEvidence(j.entries), 'VERIFIED');
  assert.ok(j.entries.every((entry, index) => entry.sequence === index + 1));
  assert.equal(JSON.stringify(j.entries).includes('page-private-id'), false);
});

test('missing owner receipt blocks target attestation and RUN while still allowing owned data cleanup', async () => {
  const f = createDriver(); const c = controller(f.driver); await c.instance.prepare(); f.createRuntimeTarget();
  await assert.rejects(c.instance.bindTarget({ ...bindingFor(f), ownerVerification: undefined }), /FIXTURE_TARGET_OWNER_RECEIPT_NOT_VERIFIED/);
  await assert.rejects(c.instance.startRun(), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
  assert.equal(f.calls.includes('attest'), false);
  const summary = await c.instance.finish('VERIFIED');
  assert.equal(summary.targetBindingStatus, 'FAILED');
  assert.equal(summary.cleanupVerificationStatus, 'VERIFIED');
});

test('setup, target binding, and cleanup cannot be replayed within one lifecycle controller', async () => {
  const f = createDriver(); const c = controller(f.driver);
  await c.instance.prepare();
  await assert.rejects(c.instance.prepare(), /FIXTURE_LIFECYCLE_ALREADY_STARTED/);
  f.createRuntimeTarget();
  await c.instance.bindTarget(bindingFor(f));
  await assert.rejects(c.instance.bindTarget(pageBinding), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
  await c.instance.startRun(); await c.instance.finishRun('PASS');
  await c.instance.finish('VERIFIED'); await c.instance.finish('FAILED');
  assert.equal(f.calls.filter((call) => call === 'setup').length, 1);
  assert.equal(f.calls.filter((call) => call === 'teardown').length, 1);
});

test('setup failure never permits actions or cleanup without a verified lease', async () => {
  const f = createDriver({ attestation: undefined });
  f.driver.setup = async () => { f.calls.push('setup'); throw new Error('synthetic setup failure'); };
  const c = controller(f.driver); await assert.rejects(c.instance.prepare(), /synthetic setup failure/);
  const summary = await c.instance.finish('VERIFIED');
  assert.equal(summary.setupStatus, 'FAILED');
  assert.equal(summary.cleanupVerificationStatus, 'UNKNOWN');
  assert.equal(summary.overallStatus, 'FAIL');
  assert.deepEqual(f.calls, ['setup']);
});

test('setup lease has only synthetic data/resource ownership and rejects missing resources before runtime creation', async () => {
  const f = createDriver();
  f.driver.setup = async () => { f.calls.push('setup'); return { ...f.lease, ownedResourceIds: [] }; };
  const c = controller(f.driver); await assert.rejects(c.instance.prepare(), /FIXTURE_LEASE_INVALID/);
  const summary = await c.instance.finish('VERIFIED');
  assert.equal(summary.ownershipStatus, 'NOT_STARTED');
  assert.equal(summary.cleanupVerificationStatus, 'UNKNOWN');
  assert.deepEqual(f.calls, ['setup']);
});

test('ownership verification failure blocks reset and teardown of potentially foreign resources', async () => {
  const f = createDriver();
  f.driver.verifyOwnership = async () => { f.calls.push('verifyOwnership'); return false; };
  const c = controller(f.driver); await assert.rejects(c.instance.prepare(), /FIXTURE_OWNERSHIP_NOT_VERIFIED/);
  const summary = await c.instance.finish('VERIFIED');
  assert.equal(summary.ownershipStatus, 'FAILED');
  assert.equal(summary.cleanupVerificationStatus, 'UNKNOWN');
  assert.deepEqual(f.calls, ['setup', 'verifyOwnership']);
});

test('reset failure triggers best-effort teardown only for the verified lease and independently checks cleanup', async () => {
  const f = createDriver();
  f.driver.reset = async () => { f.calls.push('reset'); throw new Error('reset failed'); };
  f.driver.verifyCleanup = async () => { f.calls.push('verifyCleanup'); return false; };
  const c = controller(f.driver); await assert.rejects(c.instance.prepare(), /reset failed/);
  const summary = await c.instance.finish('VERIFIED');
  assert.equal(summary.resetStatus, 'FAILED');
  assert.equal(summary.teardownStatus, 'VERIFIED');
  assert.equal(summary.cleanupVerificationStatus, 'FAILED');
  assert.equal(summary.overallStatus, 'FAIL');
  assert.deepEqual(f.calls, ['setup', 'verifyOwnership', 'reset', 'verifyOwnership', 'teardown', 'verifyCleanup']);
});

test('reset timeout remains UNKNOWN and does not retry teardown while the operation may still run', async () => {
  const f = createDriver();
  f.driver.reset = async () => { f.calls.push('reset'); return new Promise<void>(() => {}); };
  const c = controller(f.driver, memoryJournal(), 5);
  await assert.rejects(c.instance.prepare(), /FIXTURE_OPERATION_TIMEOUT:RESET/);
  const summary = await c.instance.finish('VERIFIED');
  assert.equal(summary.resetStatus, 'UNKNOWN');
  assert.equal(summary.teardownStatus, 'UNKNOWN');
  assert.equal(summary.cleanupVerificationStatus, 'UNKNOWN');
  assert.equal(summary.overallStatus, 'UNKNOWN');
  assert.deepEqual(f.calls, ['setup', 'verifyOwnership', 'reset']);
});

test('wrong fixture or mismatched requested target fails closed and never reaches RUN actions', async () => {
  const f = createDriver(); const c = controller(f.driver); await c.instance.prepare(); f.createRuntimeTarget();
  await assert.rejects(c.instance.bindTarget({ ...pageBinding, fixtureId: 'other-fixture' }), /FIXTURE_TARGET_BINDING_MISMATCH/);
  await assert.rejects(c.instance.startRun(), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
  const summary = await c.instance.finish('VERIFIED');
  assert.equal(summary.targetBindingStatus, 'FAILED');
  assert.equal(summary.overallStatus, 'FAIL');
  assert.equal(f.calls.includes('attest'), false);
  assert.ok(f.calls.includes('teardown'));
});

test('a pre-existing foreign page with matching URL/scope and caller identity receives no target attestation', async () => {
  const f = createDriver(); f.registerPreExistingTarget(pageIdentity); const c = controller(f.driver); await c.instance.prepare();
  await assert.rejects(c.instance.bindTarget(bindingFor(f)), /FIXTURE_TARGET_OWNER_RECEIPT_NOT_VERIFIED/);
  await assert.rejects(c.instance.startRun(), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
  assert.equal((await c.instance.finish('VERIFIED')).targetBindingStatus, 'FAILED');
  assert.equal(f.calls.includes('attest'), false);
  assert.equal(f.calls.includes('teardown'), true, 'data lease teardown is still independent of the rejected browser target');
});

test('wrong Playwright page/context identity is rejected by host registry, not URL or target order', async () => {
  const mismatches: FixtureRuntimeTargetIdentity[] = [
    { ...pageIdentity, pageId: 'PAGE-FOREIGN' },
    { ...pageIdentity, contextId: 'CONTEXT-FOREIGN' }
  ];
  for (const candidate of mismatches) {
    const f = createDriver(); const c = controller(f.driver); await c.instance.prepare(); f.createRuntimeTarget(pageIdentity);
    await assert.rejects(c.instance.bindTarget({ ...bindingFor(f), runtimeIdentity: candidate }), /FIXTURE_TARGET_OWNER_RECEIPT_NOT_VERIFIED/);
    await assert.rejects(c.instance.startRun(), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
    assert.equal((await c.instance.finish('VERIFIED')).runStatus, 'NOT_STARTED');
  }
});

test('fixture lifecycle rejects FRAME and GAS_OOPIF scopes until independently supported', async () => {
  const frameTarget: SmokeTarget = { pageUrl: target.pageUrl, scope: { kind: 'FRAME', url: 'http://127.0.0.1/synthetic-frame' } };
  assert.throws(() => controller(createDriver({ target: frameTarget }).driver, memoryJournal(), 100, frameTarget), /FIXTURE_LIFECYCLE_SCOPE_UNSUPPORTED/);
  const f = createDriver(); const c = controller(f.driver); await c.instance.prepare();
  const gasIdentity: FixtureRuntimeTargetIdentity = { backend: 'GAS_OOPIF', scopeKind: 'PAGE', targetId: 'native-target-1', sessionId: 'native-session-1', executionContextId: 21, frameId: 'native-frame-1' };
  f.createRuntimeTarget(gasIdentity);
  await assert.rejects(c.instance.bindTarget({ ...bindingFor(f), runtimeIdentity: gasIdentity }), /FIXTURE_LIFECYCLE_SCOPE_UNSUPPORTED/);
  await assert.rejects(c.instance.startRun(), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
  assert.equal(f.calls.includes('attest'), false);
  assert.equal((await c.instance.finish('VERIFIED')).targetBindingStatus, 'FAILED');
});

test('missing or ambiguous runtime identity fails before driver attestation and leaves actions disabled', async () => {
  for (const runtimeIdentity of [undefined, { backend: 'PLAYWRIGHT', scopeKind: 'PAGE', contextId: '', pageId: 'PAGE-0001' },
    { ...pageIdentity, unexpected: 'ambiguous-extra-identity' }]) {
    const f = createDriver(); const c = controller(f.driver); await c.instance.prepare(); f.createRuntimeTarget();
    await assert.rejects(c.instance.bindTarget({ ...pageBinding, runtimeIdentity } as never), /FIXTURE_TARGET_BINDING_MISMATCH/);
    await assert.rejects(c.instance.startRun(), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
    assert.equal(f.calls.includes('attest'), false);
    assert.equal((await c.instance.finish('VERIFIED')).runStatus, 'NOT_STARTED');
  }
});

test('runtime scope kind must exactly match the leased PAGE or FRAME scope', async () => {
  const frameTarget: SmokeTarget = { pageUrl: target.pageUrl, scope: { kind: 'FRAME', url: 'http://127.0.0.1/synthetic-frame' } };
  assert.throws(() => controller(createDriver({ target: frameTarget }).driver, memoryJournal(), 100, frameTarget), /FIXTURE_LIFECYCLE_SCOPE_UNSUPPORTED/);
});

test('forged or incomplete driver attestation fails closed before RUN', async () => {
  const cases: Array<(valid: Record<string, unknown>, lease: SyntheticFixtureLease, identity: FixtureRuntimeTargetIdentity, challenge: string) => unknown> = [
    (valid) => ({ ...valid, driverId: 'other-driver' }),
    (valid) => ({ ...valid, leaseId: 'different-lease' }),
    (valid) => ({ ...valid, challenge: 'replayed-challenge' }),
    (valid) => ({ ...valid, attestationId: '' }),
    (valid) => ({ ...valid, runtimeIdentitySha256: '0'.repeat(64) }),
    (valid) => ({ ...valid, runtimeIdentitySha256: undefined }),
    (valid) => ({ ...valid, kind: 'UNTRUSTED' })
  ];
  for (const forge of cases) {
    const f = createDriver({ attestation: async (lease, identity, challenge, issue) => forge(issue(lease, identity, challenge) as unknown as Record<string, unknown>, lease, identity, challenge) });
    const c = controller(f.driver); await c.instance.prepare(); f.createRuntimeTarget();
    await assert.rejects(c.instance.bindTarget(bindingFor(f)), /FIXTURE_TARGET_ATTESTATION_NOT_VERIFIED/);
    await assert.rejects(c.instance.startRun(), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
    assert.equal((await c.instance.finish('VERIFIED')).runStatus, 'NOT_STARTED');
  }
});

test('attestation replay from a different lease is rejected even when runtime identity matches', async () => {
  const f = createDriver({ leaseId: 'lease-B', attestation: async (lease, identity, challenge, issue) => ({
    ...(issue(lease, identity, challenge) as object), leaseId: 'lease-A'
  }) });
  const c = controller(f.driver); await c.instance.prepare(); f.createRuntimeTarget();
  await assert.rejects(c.instance.bindTarget(bindingFor(f)), /FIXTURE_TARGET_ATTESTATION_NOT_VERIFIED/);
  await assert.rejects(c.instance.startRun(), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
  assert.equal((await c.instance.finish('VERIFIED')).targetBindingStatus, 'FAILED');
});

test('missing, throwing, or timed-out post-creation attestation never authorizes RUN', async () => {
  for (const mode of ['missing', 'throw'] as const) {
    const f = createDriver({ attestation: async () => { if (mode === 'throw') throw new Error('attestation unavailable'); return null; } });
    const c = controller(f.driver); await c.instance.prepare(); f.createRuntimeTarget();
    await assert.rejects(c.instance.bindTarget(bindingFor(f)));
    await assert.rejects(c.instance.startRun(), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
    assert.equal((await c.instance.finish('VERIFIED')).runStatus, 'NOT_STARTED');
  }
  const f = createDriver({ attestation: async () => new Promise(() => {}) });
  const c = controller(f.driver, memoryJournal(), 5); await c.instance.prepare(); f.createRuntimeTarget();
  await assert.rejects(c.instance.bindTarget(bindingFor(f)), /FIXTURE_OPERATION_TIMEOUT:TARGET_BINDING/);
  await assert.rejects(c.instance.startRun(), /FIXTURE_PRECONDITIONS_NOT_VERIFIED/);
  const summary = await c.instance.finish('VERIFIED');
  assert.equal(summary.targetBindingStatus, 'UNKNOWN');
  assert.notEqual(summary.overallStatus, 'PASS');
  assert.equal(f.calls.includes('teardown'), false, 'timed-out attestation cannot race lease teardown');
});

test('teardown error is preserved while independent cleanup verification still runs', async () => {
  const f = createDriver({}); f.driver.teardown = async () => { f.calls.push('teardown'); throw new Error('teardown failed'); };
  const c = controller(f.driver); await c.instance.prepare(); f.createRuntimeTarget(); await c.instance.bindTarget(bindingFor(f));
  const summary = await c.instance.finish('VERIFIED');
  assert.equal(summary.teardownStatus, 'FAILED');
  assert.equal(summary.cleanupVerificationStatus, 'VERIFIED');
  assert.equal(summary.overallStatus, 'FAIL');
  assert.deepEqual(f.calls.slice(-3), ['verifyOwnership', 'teardown', 'verifyCleanup']);
});

test('cleanup timeout is UNKNOWN and repeated finish does not retry cleanup', async () => {
  const f = createDriver(); f.driver.verifyCleanup = async () => { f.calls.push('verifyCleanup'); return new Promise<boolean>(() => {}); };
  const c = controller(f.driver, memoryJournal(), 5); await c.instance.prepare(); f.createRuntimeTarget(); await c.instance.bindTarget(bindingFor(f));
  const first = await c.instance.finish('VERIFIED'); const second = await c.instance.finish('FAILED');
  assert.deepEqual(second, first);
  assert.equal(first.cleanupVerificationStatus, 'UNKNOWN');
  assert.equal(f.calls.filter((call) => call === 'verifyCleanup').length, 1);
});

test('missing or interrupted cleanup evidence remains UNKNOWN', () => {
  assert.equal(fixtureCleanupStatusFromEvidence([]), 'UNKNOWN');
  assert.equal(fixtureCleanupStatusFromEvidence([{ schemaVersion: 1, runId: 'run-test', sequence: 1, fixtureId: 'fixture-test', driverId: 'synthetic-driver', phase: 'VERIFY_CLEANUP', status: 'IN_PROGRESS', recordedAt: new Date().toISOString() }]), 'UNKNOWN');
});

test('file journal is append-only, bounded, parseable, and omits URLs/resource identifiers/runtime identities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cdld-fixture-journal-')); const original = process.cwd();
  try {
    process.chdir(root);
    const f = createDriver(); const journal = new FileFixtureLifecycleJournal('run-journal');
    const c = new FixtureLifecycleController({ driver: f.driver, request: { fixtureId: 'fixture-test', target }, runId: 'run-journal', journal,
      });
    await c.prepare(); f.createRuntimeTarget(); await c.bindTarget(bindingFor(f)); await c.startRun(); await c.finishRun('PASS');
    const summary = await c.finish('VERIFIED'); assert.equal(summary.overallStatus, 'PASS');
    const entries = await readFixtureLifecycleJournal(journal.path);
    assert.equal(entries.length, 17);
    const text = await readFile(journal.path, 'utf8');
    for (const privateValue of ['127.0.0.1', '/synthetic', 'owned-data-set', 'native-target-1', 'PAGE-0001']) assert.equal(text.includes(privateValue), false);
    assert.equal(fixtureCleanupStatusFromEvidence(entries.slice(0, -1)), 'UNKNOWN');
  } finally { process.chdir(original); await rm(root, { recursive: true, force: true }); }
});
