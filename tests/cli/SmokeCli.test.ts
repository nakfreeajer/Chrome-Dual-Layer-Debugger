import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Timeline } from '../../src/trace/Timeline.js';
import type { ActionBackend, ActionOutcome, ActionStep, TestTargetAuthorization } from '../../src/testing/ActionContract.js';
import { runSmokeCli, parseSmokeCliOptions, parseCliOptions, type SmokeCliDependencies } from '../../src/cli/main.js';
import type { SmokeScenario } from '../../src/testing/SmokeScenario.js';
import type { FixtureLifecycleSummary, SyntheticFixtureDriver } from '../../src/testing/FixtureLifecycle.js';

const scenarioInput = {
  schemaVersion: 1, scenarioId: 'cli-synthetic', target: { pageUrl: 'http://127.0.0.1/app', scope: { kind: 'PAGE' } },
  steps: [{ stepId: 'check-label', kind: 'assert', operation: 'readText', selector: '#label', predicate: 'equals', expected: 'synthetic' }]
};

function makeBackend(ok: boolean, actions?: { count: number }): ActionBackend {
  return {
    backend: 'PLAYWRIGHT', targetId: 'cli-page',
    async execute(step: ActionStep): Promise<ActionOutcome> { if (actions) actions.count += 1; return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok, value: 'synthetic' }; },
    async assert(step: ActionStep): Promise<ActionOutcome> { if (actions) actions.count += 1; return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok, value: 'secret-value' }; }
  };
}

function deps(ok: boolean, record: { opened: number; closed: number; output: string[]; timeline?: Timeline }): SmokeCliDependencies {
  return {
    async readScenarioFile(path) { assert.equal(path, 'scenario.json'); return scenarioInput; },
    async openSession(options) {
      record.opened += 1;
      const scenario = options.scenario as SmokeScenario;
      assert.equal(scenario.scenarioId, 'cli-synthetic');
      return { backend: makeBackend(ok), authorization: { mode: 'TEST', backend: 'PLAYWRIGHT', targetId: 'cli-page', fixtureId: scenario.scenarioId, approvalReference: options.approvalReference } as TestTargetAuthorization, async close() { record.closed += 1; } };
    },
    async writeTimeline(_path, timeline) { record.timeline = timeline; },
    writeOutput(line) { record.output.push(line); },
    createTimeline() { return new Timeline({ runId: 'cli-run-test' }); }
  };
}

const cliArgs = ['--scenario', 'scenario.json', '--backend', 'PLAYWRIGHT', '--endpoint', 'http://127.0.0.1:9444', '--approval-reference', 'approval-private', '--timeline', 'timeline.jsonl'];

test('smoke CLI requires arguments and rejects unknown, duplicate, malformed and positional flags', () => {
  assert.deepEqual(parseSmokeCliOptions(cliArgs), { scenarioPath: 'scenario.json', backend: 'PLAYWRIGHT', endpoint: 'http://127.0.0.1:9444', approvalReference: 'approval-private', timelinePath: 'timeline.jsonl' });
  for (const args of [[], ['--scenario', 'x'], [...cliArgs, '--unknown', 'x'], [...cliArgs, '--backend', 'PLAYWRIGHT'], [...cliArgs, 'extra'], [...cliArgs, '--backend', 'AUTO']]) assert.throws(() => parseSmokeCliOptions(args));
  assert.throws(() => parseSmokeCliOptions([...cliArgs, '--synthetic-failure-details']), /requires --failure-artifact/);
  assert.throws(() => parseSmokeCliOptions([...cliArgs, '--failure-artifact', 'x', '--synthetic-failure-details', '--synthetic-failure-details']), /Duplicate/);
  assert.equal(parseSmokeCliOptions([...cliArgs, '--fixture-lifecycle']).fixtureLifecycle, true);
  assert.throws(() => parseSmokeCliOptions([...cliArgs, '--fixture-lifecycle', '--fixture-lifecycle']), /Duplicate/);
});

const noOpFixtureDriver: SyntheticFixtureDriver = { driverId: 'synthetic-fixture-driver', async setup() { return {}; }, async verifyOwnership() { return false; },
  async reset() {}, async verifyReset() { return false; }, async attestTargetBinding() { return null; }, async teardown() {}, async verifyCleanup() { return false; } };

test('fixture lifecycle opt-in fails closed before session open when no trusted driver is configured', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[] };
  await assert.rejects(runSmokeCli([...cliArgs, '--fixture-lifecycle'], deps(true, record)), /FIXTURE_LIFECYCLE_DRIVER_UNAVAILABLE/);
  assert.equal(record.opened, 0);
  assert.equal(record.output.length, 0);
});

test('fixture cleanup failure keeps test result separate and prevents CLI PASS', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined };
  const base = deps(true, record);
  const failedCleanup = { schemaVersion: 1, runId: 'cli-run-test', fixtureId: 'cli-synthetic', driverId: 'fixture-driver', setupStatus: 'VERIFIED', ownershipStatus: 'VERIFIED', resetStatus: 'VERIFIED', resetVerificationStatus: 'VERIFIED', targetBindingStatus: 'VERIFIED', browserResourceClosureStatus: 'VERIFIED', teardownStatus: 'FAILED', cleanupVerificationStatus: 'FAILED', overallStatus: 'FAIL' } as FixtureLifecycleSummary;
  const gates: string[] = [];
  const dependencies: SmokeCliDependencies = { ...base, fixtureDriver: noOpFixtureDriver,
    async openSession(options) { assert.equal(options.fixtureLifecycle?.runId, 'cli-run-test'); record.opened += 1;
      const scenario = options.scenario as SmokeScenario;
      return { backend: makeBackend(true), authorization: { mode: 'TEST', backend: 'PLAYWRIGHT', targetId: 'cli-page', fixtureId: scenario.scenarioId, approvalReference: options.approvalReference } as TestTargetAuthorization,
        async beginFixtureRun() { gates.push('begin'); }, async finishFixtureRun() { gates.push('finish'); }, async close() { record.closed += 1; return failedCleanup; } }; } };
  const code = await runSmokeCli([...cliArgs, '--fixture-lifecycle'], dependencies);
  assert.equal(code, 2);
  const output = JSON.parse(record.output[0]) as { status: string; testStatus: string; fixtureLifecycle: FixtureLifecycleSummary };
  assert.equal(output.status, 'FAIL');
  assert.equal(output.testStatus, 'PASS');
  assert.equal(output.fixtureLifecycle.overallStatus, 'FAIL');
  assert.deepEqual(gates, ['begin', 'finish']);
});

test('smoke lifecycle opt-in rejects a session missing run gates before scenario actions and reports UNKNOWN cleanup', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[] };
  const base = deps(true, record); const actions = { count: 0 };
  const dependencies: SmokeCliDependencies = { ...base, fixtureDriver: noOpFixtureDriver,
    async openSession(options) {
      record.opened += 1;
      const scenario = options.scenario as SmokeScenario;
      return { backend: makeBackend(true, actions), authorization: { mode: 'TEST', backend: 'PLAYWRIGHT', targetId: 'cli-page', fixtureId: scenario.scenarioId,
        approvalReference: options.approvalReference } as TestTargetAuthorization, async close() { record.closed += 1; } };
    } };
  await assert.rejects(runSmokeCli([...cliArgs, '--fixture-lifecycle'], dependencies), (error: Error & { fixtureLifecycle?: FixtureLifecycleSummary }) => {
    assert.equal(error.message, 'FIXTURE_LIFECYCLE_SESSION_METHODS_UNAVAILABLE');
    assert.equal(error.fixtureLifecycle?.overallStatus, 'UNKNOWN');
    assert.equal(error.fixtureLifecycle?.cleanupVerificationStatus, 'UNKNOWN');
    return true;
  });
  assert.equal(record.opened, 1); assert.equal(record.closed, 1); assert.equal(actions.count, 0); assert.equal(record.output.length, 0);
});

test('smoke lifecycle start or finish errors close the session and report UNKNOWN', async () => {
  for (const failedGate of ['begin', 'finish'] as const) {
    const record = { opened: 0, closed: 0, output: [] as string[] }; const actions = { count: 0 };
    const base = deps(true, record);
    const dependencies: SmokeCliDependencies = { ...base, fixtureDriver: noOpFixtureDriver,
      async openSession(options) {
        record.opened += 1; const scenario = options.scenario as SmokeScenario;
        return { backend: makeBackend(true, actions), authorization: { mode: 'TEST', backend: 'PLAYWRIGHT', targetId: 'cli-page', fixtureId: scenario.scenarioId,
          approvalReference: options.approvalReference } as TestTargetAuthorization,
          async beginFixtureRun() { if (failedGate === 'begin') throw new Error('begin failed'); },
          async finishFixtureRun() { if (failedGate === 'finish') throw new Error('finish failed'); }, async close() { record.closed += 1; } };
      } };
    await assert.rejects(runSmokeCli([...cliArgs, '--fixture-lifecycle'], dependencies), (error: Error & { fixtureLifecycle?: FixtureLifecycleSummary }) => {
      assert.equal(error.message, `${failedGate} failed`); assert.equal(error.fixtureLifecycle?.overallStatus, 'UNKNOWN');
      assert.equal(error.fixtureLifecycle?.cleanupVerificationStatus, 'UNKNOWN'); return true;
    });
    assert.equal(record.closed, 1); assert.equal(actions.count, failedGate === 'begin' ? 0 : 1); assert.equal(record.output.length, 0);
  }
});

test('smoke CLI PASS returns 0, closes the runner page and writes sanitized Timeline', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined };
  const code = await runSmokeCli(cliArgs, deps(true, record));
  assert.equal(code, 0);
  assert.equal(record.opened, 1);
  assert.equal(record.closed, 1);
  assert.ok(record.timeline);
  assert.equal(record.timeline?.snapshot().at(-1)?.type, 'SCENARIO_PASSED');
  assert.equal(JSON.stringify(record.timeline?.snapshot()).includes('approval-private'), false);
  const output = JSON.parse(record.output[0]) as { status: string; stepResults: unknown[] };
  assert.equal(output.status, 'PASS');
  assert.equal(JSON.stringify(output).includes('secret-value'), false);
});

test('smoke CLI FAIL returns 2, records ASSERTION_FAILED and still closes page', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined };
  const code = await runSmokeCli(cliArgs, deps(false, record));
  assert.equal(code, 2);
  assert.equal(record.closed, 1);
  assert.ok(record.timeline?.snapshot().some((event) => event.type === 'ASSERTION_FAILED'));
  assert.equal(record.timeline?.snapshot().at(-1)?.type, 'SCENARIO_FAILED');
  const output = JSON.parse(record.output[0]) as { status: string; failedStepId: string };
  assert.equal(output.status, 'FAIL');
  assert.equal(output.failedStepId, 'check-label');
});

test('the whole scenario is validated before opening a browser session', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined };
  const invalid = { ...scenarioInput, steps: [{ stepId: 'gap', kind: 'action', operation: 'screenshot' }] };
  const dependencies = { ...deps(true, record), async readScenarioFile() { return invalid; } };
  await assert.rejects(runSmokeCli(cliArgs, dependencies), /unknown|qualified/i);
  assert.equal(record.opened, 0);
});

test('failure artifact is written only on failure with exact Timeline reference and sanitized CLI output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cdld-smoke-failure-'));
  const original = process.cwd();
  try {
    process.chdir(root);
    const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined };
    const failingScenario = { ...scenarioInput, steps: [{ ...scenarioInput.steps[0], expected: 'PRIVATE_EXPECTED' }] };
    const base = deps(true, record);
    const dependencies = { ...base, async readScenarioFile() { return failingScenario; }, async openSession(options: Parameters<SmokeCliDependencies['openSession']>[0]) {
      const session = await base.openSession(options);
      const backend: ActionBackend = { ...session.backend, async execute(step: ActionStep): Promise<ActionOutcome> { return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: true, value: 'PRIVATE_ACTUAL' }; } };
      return { ...session, backend, async captureFailureDiagnostics() { throw new Error('diagnostic synthetic failure'); } };
    } };
    const code = await runSmokeCli([...cliArgs, '--failure-artifact', '.agent-work/artifacts/smoke-failure.json'], dependencies);
    assert.equal(code, 2);
    const artifact = JSON.parse(await readFile('.agent-work/artifacts/smoke-failure.json', 'utf8')) as Record<string, unknown>;
    assert.equal(artifact.kind, 'CDLD_TEST1D_FAILURE');
    assert.equal(artifact.schemaVersion, 1);
    assert.equal(artifact.correlationRelationship, 'UNKNOWN');
    assert.equal((artifact.timelineRefs as Array<{ runId: string; eventId: string }>).length, 1);
    assert.equal(JSON.stringify(artifact).includes('PRIVATE_ACTUAL'), false);
    assert.equal(JSON.stringify(artifact).includes('PRIVATE_EXPECTED'), false);
    assert.equal(((artifact.diagnostics as Record<string, unknown>).dom as Record<string, unknown>).status, 'ERROR');
    assert.equal(record.output[0].includes('PRIVATE_ACTUAL'), false);
    assert.equal(record.output[0].includes('PRIVATE_EXPECTED'), false);
    assert.equal(JSON.parse(record.output[0]).failureArtifactStatus, 'WRITTEN');
  } finally { process.chdir(original); await rm(root, { recursive: true, force: true }); }
});

test('synthetic detail mode stores bounded raw fixture evidence and screenshot sidecar but keeps stdout sanitized', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cdld-smoke-synthetic-details-'));
  const original = process.cwd();
  try {
    process.chdir(root);
    const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined };
    const failingScenario = { ...scenarioInput, steps: [{ ...scenarioInput.steps[0], expected: 'PRIVATE_EXPECTED' }] };
    const base = deps(true, record);
    const screenshotBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const dependencies = { ...base, async readScenarioFile() { return failingScenario; }, async openSession(options: Parameters<SmokeCliDependencies['openSession']>[0]) {
      const session = await base.openSession(options);
      const backend: ActionBackend = { ...session.backend, async execute(step: ActionStep): Promise<ActionOutcome> { return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok: true, value: 'PRIVATE_ACTUAL' }; } };
      return { ...session, backend, async captureFailureDiagnostics() {
        return { dom: { status: 'CAPTURED', selector: '#label', textLength: 13 }, runtime: { status: 'CAPTURED', scopeKind: 'PAGE' },
          screenshot: { status: 'CAPTURED' as const, byteLength: screenshotBytes.length, sha256: createHash('sha256').update(screenshotBytes).digest('hex'), bytes: screenshotBytes } };
      } };
    } };
    const code = await runSmokeCli([...cliArgs, '--failure-artifact', '.agent-work/artifacts/synthetic.json', '--synthetic-failure-details'], dependencies);
    assert.equal(code, 2);
    const artifact = JSON.parse(await readFile('.agent-work/artifacts/synthetic.json', 'utf8')) as Record<string, unknown>;
    const artifactText = JSON.stringify(artifact);
    assert.equal(artifact.selector, '#label');
    assert.equal(artifact.actualRaw, 'PRIVATE_ACTUAL');
    assert.equal(artifact.expectedRaw, 'PRIVATE_EXPECTED');
    assert.equal(record.output[0].includes('#label'), false);
    assert.equal(record.output[0].includes('PRIVATE_ACTUAL'), false);
    assert.equal(record.output[0].includes('PRIVATE_EXPECTED'), false);
    const { readdir } = await import('node:fs/promises');
    const files = await readdir('.agent-work/artifacts');
    const sidecars = files.filter((name) => name.endsWith('.png'));
    assert.equal(sidecars.length, 1);
    const sidecarBytes = await readFile(join('.agent-work/artifacts', sidecars[0]));
    assert.deepEqual(sidecarBytes, screenshotBytes);
    const screenshotMetadata = ((artifact.diagnostics as Record<string, unknown>).screenshot as Record<string, unknown>);
    assert.equal(screenshotMetadata.status, 'CAPTURED');
    assert.equal(screenshotMetadata.byteLength, sidecarBytes.length);
    assert.equal(screenshotMetadata.sha256, createHash('sha256').update(sidecarBytes).digest('hex'));
    assert.ok(sidecarBytes.length <= 2 * 1024 * 1024);
    assert.equal(artifactText.includes(screenshotBytes.toString('base64')), false, 'screenshot bytes must remain in the sidecar');
    assert.equal(record.output[0].includes('#label'), false);
    assert.equal(record.output[0].includes('PRIVATE_ACTUAL'), false);
    assert.equal(record.output[0].includes('PRIVATE_EXPECTED'), false);
  } finally { process.chdir(original); await rm(root, { recursive: true, force: true }); }
});

test('synthetic detail mode is rejected before session open for non-loopback targets', async () => {
  const record = { opened: 0, closed: 0, output: [] as string[], timeline: undefined as Timeline | undefined };
  const dependencies = { ...deps(true, record), async readScenarioFile() { return { ...scenarioInput, target: { pageUrl: 'https://example.test/app', scope: { kind: 'PAGE' } } }; } };
  await assert.rejects(runSmokeCli([...cliArgs, '--failure-artifact', '.agent-work/artifacts/synthetic.json', '--synthetic-failure-details'], dependencies), /loopback/);
  assert.equal(record.opened, 0);
});

test('discover command options preserve their existing behavior', () => {
  assert.deepEqual(parseCliOptions([]), { endpoint: 'http://127.0.0.1:9222', timelinePath: '.agent-work/artifacts/timeline.jsonl' });
});
