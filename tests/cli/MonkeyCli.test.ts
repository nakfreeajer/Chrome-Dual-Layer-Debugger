import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActionBackend, ActionOutcome, ActionStep } from '../../src/testing/ActionContract.js';
import { parseMonkeyCliOptions, resolveMonkeyArtifactPath, runMonkeyCli, type MonkeyCliDependencies } from '../../src/cli/main.js';
import type { SyntheticFixtureDriver } from '../../src/testing/FixtureLifecycle.js';

const rawProfile = { schemaVersion: 1, profileId: 'monkey-cli-test', target: { pageUrl: 'http://127.0.0.1/app', scope: { kind: 'PAGE' } },
  bounds: { maxActions: 2, maxDurationMs: 1000 }, candidates: [{ candidateId: 'click', operation: 'click', selector: '#private' }] };
const args = ['--profile', 'profile.json', '--seed', '429', '--backend', 'PLAYWRIGHT', '--endpoint', 'http://127.0.0.1:9444', '--approval-reference', 'audit-only'];

function dependencies(record: { opened: number; output: string[] }, profile: unknown = rawProfile): MonkeyCliDependencies {
  const backend: ActionBackend = { backend: 'PLAYWRIGHT', targetId: 'PAGE-1',
    async execute(step: ActionStep): Promise<ActionOutcome> { return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: true }; },
    async assert(step) { return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: true }; } };
  return {
    async readProfileFile(path) { assert.equal(path, 'profile.json'); return profile; },
    async openSession() { record.opened += 1; return { backend, authorization: { mode: 'TEST', backend: 'PLAYWRIGHT', targetId: 'PAGE-1', fixtureId: 'monkey-cli-test', approvalReference: 'audit-only' }, async assertTargetEnvelope() {}, async close() {} } as never; },
    async writeTimeline() {}, async writeReplay() {}, writeOutput(line) { record.output.push(line); }, createTimeline() { throw new Error('must not create timeline before mutation authorization'); }, now() { return 0; }
  };
}

const noOpFixtureDriver: SyntheticFixtureDriver = { driverId: 'synthetic-fixture-driver', async setup() { return {}; }, async verifyOwnership() { return false; },
  async reset() {}, async verifyReset() { return false; }, async attestTargetBinding() { return null; }, async teardown() {}, async verifyCleanup() { return false; } };

test('monkey CLI validates arguments and rejects non-loopback TEST endpoints', () => {
  assert.deepEqual(parseMonkeyCliOptions(args), { profilePath: 'profile.json', seed: 429, backend: 'PLAYWRIGHT', endpoint: 'http://127.0.0.1:9444',
    approvalReference: 'audit-only', timelinePath: '.agent-work/artifacts/monkey-timeline.jsonl', replayArtifactPath: '.agent-work/artifacts/monkey-replay.json' });
  for (const endpoint of ['http://192.0.2.10:9222', 'http://localhost:9222', 'http://127.0.0.1:65536']) {
    const bad = [...args]; bad[bad.indexOf('http://127.0.0.1:9444')] = endpoint;
    assert.throws(() => parseMonkeyCliOptions(bad), /TEST_CDP_ENDPOINT/);
  }
  assert.throws(() => parseMonkeyCliOptions([...args, '--unknown', 'x']), /Unknown/);
  assert.throws(() => parseMonkeyCliOptions([...args, '--seed', '429']), /Duplicate/);
});

test('all generated monkey mutations fail before session, timeline or artifact creation without trusted authorization', async () => {
  const record = { opened: 0, output: [] as string[] };
  const deps = dependencies(record);
  await assert.rejects(runMonkeyCli(args, deps), /TRUSTED_TEST_MUTATION_AUTHORIZATION_UNAVAILABLE/);
  assert.equal(record.opened, 0);
  assert.deepEqual(record.output, []);
});

test('fixture-lifecycle request without an injected driver fails before session open', async () => {
  const record = { opened: 0, output: [] as string[] };
  await assert.rejects(runMonkeyCli([...args, '--fixture-lifecycle'], dependencies(record)), /FIXTURE_LIFECYCLE_DRIVER_UNAVAILABLE/);
  assert.equal(record.opened, 0);
  assert.deepEqual(record.output, []);
});

test('an injected fixture driver proves neither trusted Human authorization nor permission to mutate', async () => {
  const record = { opened: 0, output: [] as string[] };
  const deps = { ...dependencies(record), fixtureDriver: noOpFixtureDriver };
  await assert.rejects(runMonkeyCli([...args, '--fixture-lifecycle'], deps), /TRUSTED_TEST_MUTATION_AUTHORIZATION_UNAVAILABLE/);
  assert.equal(record.opened, 0);
  assert.deepEqual(record.output, []);
});

test('malformed profiles fail before any session opens', async () => {
  const record = { opened: 0, output: [] as string[] };
  await assert.rejects(runMonkeyCli(args, dependencies(record, { ...rawProfile, bounds: { maxActions: 0, maxDurationMs: 1000 } })), /invalid|must/i);
  assert.equal(record.opened, 0);
});

test('monkey artifact paths remain constrained to ignored .agent-work/artifacts', () => {
  assert.throws(() => resolveMonkeyArtifactPath('outside.json'), /inside \.agent-work\/artifacts/);
  assert.throws(() => resolveMonkeyArtifactPath('.agent-work/artifacts/../../outside.json'), /inside \.agent-work\/artifacts/);
  assert.match(resolveMonkeyArtifactPath('.agent-work/artifacts/replay.json'), /\.agent-work[\\/]artifacts[\\/]replay\.json$/);
});
