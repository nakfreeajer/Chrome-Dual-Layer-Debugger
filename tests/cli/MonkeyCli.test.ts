import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Timeline } from '../../src/trace/Timeline.js';
import type { ActionBackend, ActionOutcome, ActionStep } from '../../src/testing/ActionContract.js';
import { parseMonkeyCliOptions, resolveMonkeyArtifactPath, runMonkeyCli, type MonkeyCliDependencies } from '../../src/cli/main.js';
import type { ExploratoryProfile } from '../../src/testing/ExploratoryProfile.js';
import type { FixtureLifecycleSummary, SyntheticFixtureDriver } from '../../src/testing/FixtureLifecycle.js';

const rawProfile = { schemaVersion: 1, profileId: 'monkey-cli-test', target: { pageUrl: 'http://127.0.0.1/app', scope: { kind: 'PAGE' } }, bounds: { maxActions: 2, maxDurationMs: 1000 },
  candidates: [{ candidateId: 'click', operation: 'click', selector: '#private' }] };

function dependencies(record: { opened: number; closed: number; output: string[]; timeline?: Timeline; replay?: unknown }, actions?: { count: number }): MonkeyCliDependencies {
  const backend: ActionBackend = { backend: 'PLAYWRIGHT', targetId: 'PAGE-1', async execute(step: ActionStep): Promise<ActionOutcome> { if (actions) actions.count += 1; return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: true }; }, async assert(step) { if (actions) actions.count += 1; return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: true }; } };
  return {
    async readProfileFile(path) { assert.equal(path, 'profile.json'); return rawProfile; },
    async openSession(options: { fixtureId: string; target: ExploratoryProfile['target'] }) { record.opened += 1; assert.equal(options.fixtureId, 'monkey-cli-test'); assert.equal(options.target.pageUrl, 'http://127.0.0.1/app');
      return { backend, authorization: { mode: 'TEST', backend: 'PLAYWRIGHT', targetId: 'PAGE-1', fixtureId: options.fixtureId, approvalReference: 'secret-approval' }, async assertTargetEnvelope() {}, async close() { record.closed += 1; } } as never; },
    async writeTimeline(_path, timeline) { record.timeline = timeline; }, async writeReplay(_path, artifact) { record.replay = artifact; },
    writeOutput(line) { record.output.push(line); }, createTimeline() { return new Timeline({ runId: 'monkey-cli-run' }); }, now() { return 0; }
  };
}

const args = ['--profile', 'profile.json', '--seed', '429', '--backend', 'PLAYWRIGHT', '--endpoint', 'http://127.0.0.1:9444', '--approval-reference', 'secret-approval'];

test('monkey CLI strictly parses required bounded options and rejects ambiguous arguments', () => {
  assert.deepEqual(parseMonkeyCliOptions(args), { profilePath: 'profile.json', seed: 429, backend: 'PLAYWRIGHT', endpoint: 'http://127.0.0.1:9444', approvalReference: 'secret-approval', timelinePath: '.agent-work/artifacts/monkey-timeline.jsonl', replayArtifactPath: '.agent-work/artifacts/monkey-replay.json' });
  for (const bad of [[], [...args, '--unknown', 'x'], [...args, '--seed', '429'], [...args, 'extra'], [...args.slice(0, 2), '--seed', '01', ...args.slice(3)], [...args.slice(0, 2), '--seed', '-1', ...args.slice(3)]]) assert.throws(() => parseMonkeyCliOptions(bad));
  assert.equal(parseMonkeyCliOptions([...args, '--failure-artifact', '.agent-work/artifacts/f.json', '--synthetic-failure-details']).syntheticFailureDetails, true);
  assert.throws(() => parseMonkeyCliOptions([...args, '--synthetic-failure-details']), /requires --failure-artifact/);
  assert.throws(() => parseMonkeyCliOptions([...args, '--failure-artifact', 'x', '--synthetic-failure-details', '--synthetic-failure-details']), /Duplicate/);
  assert.equal(parseMonkeyCliOptions([...args, '--fixture-lifecycle']).fixtureLifecycle, true);
  assert.throws(() => parseMonkeyCliOptions([...args, '--fixture-lifecycle', '--fixture-lifecycle']), /Duplicate/);
});

const noOpFixtureDriver: SyntheticFixtureDriver = { driverId: 'synthetic-fixture-driver', async setup() { return {}; }, async verifyOwnership() { return false; },
  async reset() {}, async verifyReset() { return false; }, async attestTargetBinding() { return null; }, async teardown() {}, async verifyCleanup() { return false; } };

test('monkey fixture lifecycle opt-in fails closed before session open without a trusted driver', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[] };
  await assert.rejects(runMonkeyCli([...args, '--fixture-lifecycle'], dependencies(record)), /FIXTURE_LIFECYCLE_DRIVER_UNAVAILABLE/);
  assert.equal(record.opened, 0);
  assert.equal(record.output.length, 0);
});

test('monkey cleanup failure preserves runner outcome but prevents overall PASS', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined, replay: undefined as unknown };
  const base = dependencies(record);
  const failedCleanup = { schemaVersion: 1, runId: 'monkey-cli-run', fixtureId: 'monkey-cli-test', driverId: 'fixture-driver', setupStatus: 'VERIFIED', ownershipStatus: 'VERIFIED', resetStatus: 'VERIFIED', resetVerificationStatus: 'VERIFIED', targetBindingStatus: 'VERIFIED', browserResourceClosureStatus: 'VERIFIED', teardownStatus: 'FAILED', cleanupVerificationStatus: 'FAILED', overallStatus: 'FAIL' } as FixtureLifecycleSummary;
  const gates: string[] = [];
  const deps: MonkeyCliDependencies = { ...base, fixtureDriver: noOpFixtureDriver,
    async openSession(options) { assert.equal(options.fixtureLifecycle?.runId, 'monkey-cli-run'); record.opened += 1;
      const session = await base.openSession(options);
      return { ...session, async beginFixtureRun() { gates.push('begin'); }, async finishFixtureRun() { gates.push('finish'); }, async close() { record.closed += 1; return failedCleanup; } }; } };
  const code = await runMonkeyCli([...args, '--fixture-lifecycle'], deps);
  assert.equal(code, 2);
  const output = JSON.parse(record.output[0]) as { status: string; testStatus: string; fixtureLifecycle: FixtureLifecycleSummary };
  assert.equal(output.status, 'FAIL');
  assert.equal(output.testStatus, 'PASS');
  assert.equal(output.fixtureLifecycle.overallStatus, 'FAIL');
  assert.deepEqual(gates, ['begin', 'finish']);
});

test('monkey lifecycle opt-in rejects a session missing run gates before actions and reports UNKNOWN cleanup', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[] }; const actions = { count: 0 };
  const base = dependencies(record, actions);
  const deps: MonkeyCliDependencies = { ...base, fixtureDriver: noOpFixtureDriver,
    async openSession(options) { const session = await base.openSession(options); return { ...session, async close() { record.closed += 1; } }; } };
  await assert.rejects(runMonkeyCli([...args, '--fixture-lifecycle'], deps), (error: Error & { fixtureLifecycle?: FixtureLifecycleSummary }) => {
    assert.equal(error.message, 'FIXTURE_LIFECYCLE_SESSION_METHODS_UNAVAILABLE');
    assert.equal(error.fixtureLifecycle?.overallStatus, 'UNKNOWN');
    assert.equal(error.fixtureLifecycle?.cleanupVerificationStatus, 'UNKNOWN');
    return true;
  });
  assert.equal(record.opened, 1); assert.equal(record.closed, 1); assert.equal(actions.count, 0); assert.equal(record.output.length, 0);
});

test('monkey lifecycle start or finish errors close the session and report UNKNOWN', async () => {
  for (const failedGate of ['begin', 'finish'] as const) {
    const record = { opened: 0, closed: 0, output: [] as string[] }; const actions = { count: 0 };
    const base = dependencies(record, actions);
    const deps: MonkeyCliDependencies = { ...base, fixtureDriver: noOpFixtureDriver,
      async openSession(options) {
        const session = await base.openSession(options);
        return { ...session, async beginFixtureRun() { if (failedGate === 'begin') throw new Error('begin failed'); },
          async finishFixtureRun() { if (failedGate === 'finish') throw new Error('finish failed'); }, async close() { record.closed += 1; } };
      } };
    await assert.rejects(runMonkeyCli([...args, '--fixture-lifecycle'], deps), (error: Error & { fixtureLifecycle?: FixtureLifecycleSummary }) => {
      assert.equal(error.message, `${failedGate} failed`); assert.equal(error.fixtureLifecycle?.overallStatus, 'UNKNOWN');
      assert.equal(error.fixtureLifecycle?.cleanupVerificationStatus, 'UNKNOWN'); return true;
    });
    assert.equal(record.closed, 1);
    if (failedGate === 'begin') assert.equal(actions.count, 0); else assert.ok(actions.count > 0);
    assert.equal(record.output.length, 0);
  }
});

test('monkey CLI validates profile before session creation and returns sanitized result', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined, replay: undefined as unknown };
  const code = await runMonkeyCli(args, dependencies(record));
  assert.equal(code, 0); assert.equal(record.opened, 1); assert.equal(record.closed, 1);
  assert.equal(record.timeline?.snapshot().at(-1)?.type, 'SESSION_ENDED');
  const replay = record.replay as { plan: unknown[]; kind: string; backend: string; terminalStatus: string; generatedCount: number; executedCount: number };
  assert.equal(replay.plan.length, 2); assert.equal(replay.kind, 'CDLD_TEST1C_REPLAY'); assert.equal(replay.backend, 'PLAYWRIGHT');
  assert.equal(replay.terminalStatus, 'PASS'); assert.equal(replay.generatedCount, 2); assert.equal(replay.executedCount, 2);
  assert.equal(record.output.length, 1);
  assert.equal(record.output[0].includes('secret-approval'), false);
  assert.equal(record.output[0].includes('#private'), false);
});

test('monkey artifact paths are constrained to ignored .agent-work/artifacts', () => {
  assert.throws(() => resolveMonkeyArtifactPath('outside.json'), /inside \.agent-work\/artifacts/);
  assert.throws(() => resolveMonkeyArtifactPath('.agent-work/artifacts/../../outside.json'), /inside \.agent-work\/artifacts/);
  assert.match(resolveMonkeyArtifactPath('.agent-work/artifacts/replay.json'), /\.agent-work[\\/]artifacts[\\/]replay\.json$/);
});

test('monkey CLI returns 0 and writes terminal BOUND_REACHED replay when the time budget expires', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined, replay: undefined as unknown };
  const values = [0, 0, 1001];
  const deps = { ...dependencies(record), now() { return values.shift() ?? 1001; } };
  const code = await runMonkeyCli(args, deps);
  assert.equal(code, 0);
  assert.equal((record.replay as { terminalStatus: string; stopReason: string }).terminalStatus, 'BOUND_REACHED');
  assert.equal((record.replay as { stopReason: string }).stopReason, 'DURATION_EXHAUSTED');
  assert.equal((JSON.parse(record.output[0]) as { status: string }).status, 'BOUND_REACHED');
});

test('monkey CLI propagates setup failure without emitting an apparent result', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined, replay: undefined as unknown };
  const deps = { ...dependencies(record), async openSession(): Promise<never> { record.opened += 1; throw new Error('synthetic setup failure'); } };
  await assert.rejects(runMonkeyCli(args, deps), /synthetic setup failure/);
  assert.equal(record.output.length, 0);
});

test('malformed seed/backend/endpoint/approval and missing profile fail before any session opens', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined, replay: undefined as unknown };
  const deps = dependencies(record);
  const invalidArgs = [
    [...args.slice(0, 2), '--seed', '4294967296', ...args.slice(3)],
    [...args.slice(0, 5), 'AUTO', ...args.slice(6)],
    [...args.slice(0, 7), 'file://127.0.0.1:9444', ...args.slice(8)],
    [...args.slice(0, 9), '   '],
    []
  ];
  for (const invalid of invalidArgs) await assert.rejects(runMonkeyCli(invalid, deps));
  assert.equal(record.opened, 0);
  assert.equal(record.output.length, 0);
});

test('a completed generated action failure returns exit 2 with sanitized failure output', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined, replay: undefined as unknown };
  const base = dependencies(record);
  const deps = { ...base, async openSession(options: Parameters<MonkeyCliDependencies['openSession']>[0]) {
    const session = await base.openSession(options);
    const backend: ActionBackend = { ...session.backend, async execute(step: ActionStep): Promise<ActionOutcome> { return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: false, errorCode: 'ACTION_FAILED' }; } };
    return { ...session, backend };
  } };
  assert.equal(await runMonkeyCli(args, deps), 2);
  assert.equal((JSON.parse(record.output[0]) as { status: string; stopReason: string }).status, 'FAIL');
  assert.equal(record.closed, 1);
});

test('invalid profile never opens the authorized TEST session', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined, replay: undefined as unknown };
  const deps = { ...dependencies(record), async readProfileFile() { return { ...rawProfile, bounds: { maxActions: 0, maxDurationMs: 1000 } }; } };
  await assert.rejects(runMonkeyCli(args, deps));
  assert.equal(record.opened, 0);
});

test('monkey terminal failure writes a privacy-reduced artifact with action refs and no assertions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cdld-monkey-failure-'));
  const original = process.cwd();
  try {
    process.chdir(root);
    const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined, replay: undefined as unknown };
    const base = dependencies(record);
    const deps = { ...base, async openSession(options: Parameters<MonkeyCliDependencies['openSession']>[0]) {
      const session = await base.openSession(options);
      const backend: ActionBackend = { ...session.backend, async execute(step: ActionStep): Promise<ActionOutcome> { return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: false, errorCode: 'ACTION_FAILED' }; } };
      return { ...session, backend };
    } };
    const code = await runMonkeyCli([...args, '--failure-artifact', '.agent-work/artifacts/monkey-failure.json'], deps);
    assert.equal(code, 2);
    const artifact = JSON.parse(await readFile('.agent-work/artifacts/monkey-failure.json', 'utf8')) as Record<string, unknown>;
    assert.equal(artifact.kind, 'CDLD_TEST1D_FAILURE');
    assert.equal(artifact.runnerKind, 'MONKEY');
    assert.equal(artifact.stopReason, 'ACTION_FAILED');
    assert.equal((artifact.timelineRefs as unknown[]).length >= 2, true);
    assert.equal((record.timeline?.snapshot() ?? []).some((event) => event.category === 'ASSERTION'), false);
    assert.equal(JSON.stringify(artifact).includes('#private'), false);
  } finally { process.chdir(original); await rm(root, { recursive: true, force: true }); }
});

test('monkey target-envelope failure artifact includes terminal safety evidence and no assertion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cdld-monkey-envelope-'));
  const original = process.cwd();
  try {
    process.chdir(root);
    const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined, replay: undefined as unknown };
    const base = dependencies(record);
    const deps = { ...base, async openSession(options: Parameters<MonkeyCliDependencies['openSession']>[0]) {
      const session = await base.openSession(options);
      return { ...session, async assertTargetEnvelope() { throw new Error('TARGET_ENVELOPE_VIOLATION'); } };
    } };
    const code = await runMonkeyCli([...args, '--failure-artifact', '.agent-work/artifacts/envelope.json'], deps);
    assert.equal(code, 2);
    const artifact = JSON.parse(await readFile('.agent-work/artifacts/envelope.json', 'utf8')) as Record<string, unknown>;
    assert.equal(artifact.stopReason, 'TARGET_ENVELOPE_VIOLATION');
    assert.equal((artifact.timelineRefs as unknown[]).some((ref) => {
      const item = ref as { eventId: string };
      return record.timeline?.snapshot().find((event) => event.eventId === item.eventId)?.type === 'EXPLORATORY_RUN_FAILED';
    }), true);
    assert.equal(record.timeline?.snapshot().some((event) => event.category === 'ASSERTION'), false);
  } finally { process.chdir(original); await rm(root, { recursive: true, force: true }); }
});
