import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseRegressionSuiteCliOptions, resolveRegressionSuiteArtifactPath, runRegressionSuiteCli, type RegressionSuiteCliDependencies } from '../../src/cli/main.js';
import { Timeline } from '../../src/trace/Timeline.js';
import type { ActionBackend, ActionOutcome } from '../../src/testing/ActionContract.js';
import type { RegressionSuiteResultArtifact } from '../../src/testing/RegressionSuite.js';
import type { SyntheticFixtureDriver } from '../../src/testing/FixtureLifecycle.js';
import { parseRegressionSuite, regressionSuiteSha256 } from '../../src/testing/RegressionSuiteParser.js';

const suiteInput = JSON.parse(readFileSync('tests/fixtures/testing/regression-suite-v1.json', 'utf8')) as unknown;
const runArgs = ['run', '--suite', 'suite.json', '--backend', 'PLAYWRIGHT', '--endpoint', 'http://127.0.0.1:9444', '--approval-reference', 'synthetic-approval', '--result-artifact', '.agent-work/artifacts/test1f-result.json'];

test('strict suite CLI parser rejects missing, unknown, duplicate and unexpected arguments', () => {
  assert.throws(() => parseRegressionSuiteCliOptions(['run', '--suite', 'suite.json']), /required/);
  assert.throws(() => parseRegressionSuiteCliOptions([...runArgs, '--unknown', 'x']), /Unknown/);
  assert.throws(() => parseRegressionSuiteCliOptions([...runArgs, '--backend', 'GAS_OOPIF']), /Duplicate/);
  assert.throws(() => parseRegressionSuiteCliOptions(['compare', '--suite', 's', '--left-result', 'a']), /required/);
  assert.throws(() => parseRegressionSuiteCliOptions(['run', ...runArgs.slice(1), 'positional']), /Unknown/);
  assert.throws(() => resolveRegressionSuiteArtifactPath('.agent-work/artifacts/../../outside.json'), /inside/);
});

function dependencies(options: { mismatchFirst?: boolean; fixtureDriver?: SyntheticFixtureDriver } = {}) {
  const calls: string[] = [];
  const outputs: string[] = [];
  const artifacts: RegressionSuiteResultArtifact[] = [];
  let timelineIndex = 0;
  const deps: RegressionSuiteCliDependencies = {
    async readJsonFile(path) { assert.equal(path, 'suite.json'); return suiteInput; },
    async openSession(sessionOptions) {
      calls.push(sessionOptions.scenario.scenarioId);
      const scenarioId = sessionOptions.scenario.scenarioId;
      const backend: ActionBackend = {
        backend: sessionOptions.backend, targetId: `target-${scenarioId}`,
        async execute(step): Promise<ActionOutcome> {
          const wrongReady = options.mismatchFirst && scenarioId === 'readiness-pass';
          const value = step.operation === 'ready' ? (wrongReady ? 'loading' : 'complete') : step.operation === 'readText' ? 'wrong-synthetic-text' : undefined;
          return { stepId: step.stepId, operation: step.operation, backend: sessionOptions.backend, ok: true, ...(value === undefined ? {} : { value }) };
        },
        async assert() { throw new Error('Smoke runner uses the shared assertion helper'); }
      };
      return { backend, authorization: { mode: 'TEST', backend: sessionOptions.backend, targetId: backend.targetId, fixtureId: sessionOptions.fixtureId, approvalReference: sessionOptions.approvalReference },
        async assertTargetEnvelope() {}, async close() { return undefined; } } as unknown as Awaited<ReturnType<RegressionSuiteCliDependencies['openSession']>>;
    },
    fixtureDriver: options.fixtureDriver,
    createTimeline() { return new Timeline({ runId: `suite-cli-run-${++timelineIndex}` }); },
    async writeTimeline() {},
    async writeResultArtifact(_path, artifact) { artifacts.push(artifact); },
    async readResultArtifact(path) {
      if (path.endsWith('right.json') && artifacts[0]) return { ...artifacts[0], backend: 'GAS_OOPIF' };
      return artifacts[0];
    },
    writeOutput(value) { outputs.push(value); }
  };
  return { deps, calls, outputs, artifacts };
}

test('suite run reuses current smoke/monkey runners and writes one privacy-reduced result', async () => {
  const f = dependencies();
  const code = await runRegressionSuiteCli(runArgs, f.deps);
  assert.equal(code, 0);
  assert.deepEqual(f.calls, ['readiness-pass', 'assertion-fail', 'seeded-monkey-pass']);
  assert.equal(f.artifacts.length, 1);
  assert.equal(f.artifacts[0].suiteStatus, 'PASS');
  assert.deepEqual(f.artifacts[0].caseResults.map((item) => item.comparisonStatus), ['PASS', 'PASS', 'PASS']);
  const serialized = JSON.stringify(f.artifacts[0]) + f.outputs.join('\n');
  for (const secret of ['wrong-synthetic-text', 'expected-synthetic-text', '#synthetic-label', 'http://127.0.0.1', 'synthetic-approval']) assert.equal(serialized.includes(secret), false);
});

test('suite CLI fails fast on unexpected outcome and records later cases NOT_RUN', async () => {
  const f = dependencies({ mismatchFirst: true });
  const code = await runRegressionSuiteCli(runArgs, f.deps);
  assert.equal(code, 2);
  assert.deepEqual(f.calls, ['readiness-pass']);
  assert.deepEqual(f.artifacts[0].caseResults.map((item) => item.comparisonStatus), ['FAIL', 'NOT_RUN', 'NOT_RUN']);
});

test('fixture lifecycle is explicit and unsupported/default-untrusted requests fail before a session opens', async () => {
  const missingDriver = dependencies();
  await assert.rejects(runRegressionSuiteCli([...runArgs, '--fixture-lifecycle'], missingDriver.deps), /FIXTURE_LIFECYCLE_DRIVER_UNAVAILABLE/);
  assert.equal(missingDriver.calls.length, 0);
  const gas = dependencies({ fixtureDriver: {} as SyntheticFixtureDriver });
  const gasArgs = [...runArgs]; gasArgs[gasArgs.indexOf('PLAYWRIGHT')] = 'GAS_OOPIF';
  await assert.rejects(runRegressionSuiteCli([...gasArgs, '--fixture-lifecycle'], gas.deps), /FIXTURE_LIFECYCLE_SCOPE_UNSUPPORTED/);
  assert.equal(gas.calls.length, 0);
});

test('verified fixture cleanup remains distinct from a regression outcome failure', async () => {
  const f = dependencies({ mismatchFirst: true, fixtureDriver: {} as SyntheticFixtureDriver });
  const first = (suiteInput as { cases: unknown[] }).cases[0];
  f.deps.readJsonFile = async () => ({ ...(suiteInput as object), cases: [first] });
  f.deps.openSession = async (options) => {
    const backend: ActionBackend = {
      backend: options.backend, targetId: 'synthetic-target',
      async execute(step): Promise<ActionOutcome> { return { stepId: step.stepId, operation: step.operation, backend: options.backend, ok: true, value: 'loading' }; },
      async assert() { throw new Error('unused'); }
    };
    return { backend, authorization: { mode: 'TEST', backend: options.backend, targetId: backend.targetId, fixtureId: options.fixtureId, approvalReference: options.approvalReference },
      async assertTargetEnvelope() {}, async beginFixtureRun() {}, async finishFixtureRun() {},
      async close() { return { schemaVersion: 1, runId: 'fixture-run', fixtureId: options.fixtureId, driverId: 'trusted-test-driver', setupStatus: 'VERIFIED',
        ownershipStatus: 'VERIFIED', resetStatus: 'VERIFIED', resetVerificationStatus: 'VERIFIED', targetBindingStatus: 'VERIFIED', runStatus: 'FAILED',
        browserResourceClosureStatus: 'VERIFIED', teardownStatus: 'VERIFIED', cleanupVerificationStatus: 'VERIFIED', overallStatus: 'FAIL' }; }
    } as unknown as Awaited<ReturnType<RegressionSuiteCliDependencies['openSession']>>;
  };
  const code = await runRegressionSuiteCli([...runArgs, '--fixture-lifecycle'], f.deps);
  assert.equal(code, 2);
  assert.equal(f.artifacts[0].suiteStatus, 'FAIL');
  assert.equal(f.artifacts[0].caseResults[0].fixtureCleanupStatus, 'VERIFIED');
  assert.equal(f.artifacts[0].comparableFixtureState, 'VERIFIED');
});

test('suite compare returns NOT_COMPARABLE unless fixture state and cleanup were explicitly verified', async () => {
  const f = dependencies();
  await runRegressionSuiteCli(runArgs, f.deps);
  const compare = ['compare', '--suite', 'suite.json', '--left-result', '.agent-work/artifacts/left.json', '--right-result', '.agent-work/artifacts/right.json'];
  const code = await runRegressionSuiteCli(compare, f.deps);
  assert.equal(code, 2);
  assert.match(f.outputs.at(-1)!, /NOT_COMPARABLE/);
});

test('independent consumer process invokes the compiled offline compare CLI and fails closed safely', () => {
  const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
  const consumerScript = resolve(repositoryRoot, 'examples', 'consumer-cli', 'run.mjs');
  const cliEntry = resolve(repositoryRoot, 'dist', 'src', 'cli', 'main.js');
  assert.equal(isAbsolute(cliEntry), true);
  assert.equal(readFileSync(cliEntry).length > 0, true);

  const consumerRoot = mkdtempSync(join(tmpdir(), 'cdld-consumer-cli-'));
  assert.equal(relative(repositoryRoot, consumerRoot).startsWith('..'), true);
  const artifactDir = join(consumerRoot, '.agent-work', 'artifacts');
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(consumerRoot, 'suite.json'), JSON.stringify(suiteInput));

  const suite = parseRegressionSuite(suiteInput);
  const passingArtifact = (backend: 'PLAYWRIGHT' | 'GAS_OOPIF'): RegressionSuiteResultArtifact => ({
    kind: 'CDLD_TEST1F_SUITE_RESULT', schemaVersion: 1, suiteId: suite.suiteId,
    suiteSha256: regressionSuiteSha256(suite), backend, suiteStatus: 'PASS', comparableFixtureState: 'VERIFIED',
    caseResults: suite.cases.map((testCase) => {
      let actual;
      if (testCase.kind === 'SMOKE') {
        const expected = testCase.expected;
        actual = { status: expected.status,
          stopReason: expected.status === 'PASS' ? 'ALL_STEPS_COMPLETED' : expected.steps.find((step) => step.state === 'FAIL')!.errorCode!,
          generatedCount: expected.steps.length, executedCount: expected.steps.filter((step) => step.state !== 'NOT_RUN').length,
          steps: expected.steps.map((step, index) => ({ stepId: step.stepId, operation: testCase.scenario.steps[index].operation,
            state: step.state, ...(step.errorCode ? { errorCode: step.errorCode } : {}) })) };
      } else {
        const expected = testCase.expected;
        actual = { status: expected.status, stopReason: expected.stopReason, generatedCount: expected.generatedCount,
          executedCount: expected.executedCount, steps: expected.steps.map((step) => ({ stepId: step.stepId,
            operation: step.operation, state: step.state, candidateId: step.candidateId,
            ...(step.errorCode ? { errorCode: step.errorCode } : {}) })) };
      }
      return { caseId: testCase.caseId, runId: `synthetic-${backend}-${testCase.caseId}`, comparisonStatus: 'PASS' as const,
        actual, fixtureCleanupStatus: 'VERIFIED' as const };
    })
  });
  const failingClosedArtifact = (backend: 'PLAYWRIGHT' | 'GAS_OOPIF'): RegressionSuiteResultArtifact => ({
    kind: 'CDLD_TEST1F_SUITE_RESULT', schemaVersion: 1, suiteId: suite.suiteId,
    suiteSha256: regressionSuiteSha256(suite), backend, suiteStatus: 'FAIL', comparableFixtureState: 'NOT_PROVEN',
    caseResults: suite.cases.map((testCase, index) => index === 0
      ? { caseId: testCase.caseId, comparisonStatus: 'FAIL' as const, errorCode: 'ASSERTION_FAILED', fixtureCleanupStatus: 'UNKNOWN' as const }
      : { caseId: testCase.caseId, comparisonStatus: 'NOT_RUN' as const, fixtureCleanupStatus: 'UNKNOWN' as const })
  });

  const writeArtifact = (name: string, artifact: RegressionSuiteResultArtifact) =>
    writeFileSync(join(artifactDir, name), JSON.stringify(artifact));
  const runConsumer = (cliPath: string, leftName: string, rightName: string) => spawnSync(process.execPath, [consumerScript,
    cliPath, 'suite.json', `.agent-work/artifacts/${leftName}`, `.agent-work/artifacts/${rightName}`], {
    cwd: consumerRoot, encoding: 'utf8', shell: false, windowsHide: true, timeout: 20_000
  });

  try {
    writeArtifact('pass-left.json', passingArtifact('PLAYWRIGHT'));
    writeArtifact('pass-right.json', passingArtifact('GAS_OOPIF'));
    const pass = runConsumer(cliEntry, 'pass-left.json', 'pass-right.json');
    assert.equal(pass.error, undefined);
    assert.equal(pass.status, 0);
    assert.deepEqual(JSON.parse(pass.stdout), { status: 'PASS', exitCode: 0 });
    assert.equal(pass.stdout.includes('127.0.0.1'), false);
    assert.equal(pass.stdout.includes('suiteId'), false);

    writeArtifact('blocked-left.json', failingClosedArtifact('PLAYWRIGHT'));
    writeArtifact('blocked-right.json', failingClosedArtifact('GAS_OOPIF'));
    const blocked = runConsumer(cliEntry, 'blocked-left.json', 'blocked-right.json');
    assert.equal(blocked.error, undefined);
    assert.equal(blocked.status, 2);
    assert.deepEqual(JSON.parse(blocked.stdout), { status: 'FAIL', comparisonStatus: 'NOT_COMPARABLE', exitCode: 2 });
    assert.equal(blocked.stdout.includes('ASSERTION_FAILED'), false);
    assert.equal(blocked.stdout.includes(consumerRoot), false);

    writeFileSync(join(artifactDir, 'malformed.json'), '{');
    const unexpected = runConsumer(cliEntry, 'malformed.json', 'pass-right.json');
    assert.equal(unexpected.error, undefined);
    assert.equal(unexpected.status, 1);
    assert.equal(unexpected.stdout, '');
    assert.equal(unexpected.stderr.trim(), 'CDLD_CLI_RESULT_UNEXPECTED');

    const missingCli = runConsumer(join(consumerRoot, 'missing-cli.js'), 'pass-left.json', 'pass-right.json');
    assert.equal(missingCli.error, undefined);
    assert.equal(missingCli.status, 1);
    assert.equal(missingCli.stdout, '');
    assert.equal(missingCli.stderr.trim(), 'CDLD_CLI_PATH_INVALID');
  } finally {
    rmSync(consumerRoot, { recursive: true, force: true });
  }
  assert.equal(existsSync(consumerRoot), false);
});
