import assert from 'node:assert/strict';
import test from 'node:test';
import { Timeline } from '../../src/trace/Timeline.js';
import type { ActionBackend, ActionOutcome, ActionStep, TestTargetAuthorization } from '../../src/testing/ActionContract.js';
import { runSmokeCli, parseSmokeCliOptions, parseCliOptions, type SmokeCliDependencies } from '../../src/cli/main.js';
import type { SmokeScenario } from '../../src/testing/SmokeScenario.js';

const scenarioInput = {
  schemaVersion: 1, scenarioId: 'cli-synthetic', target: { pageUrl: 'http://127.0.0.1/app', scope: { kind: 'PAGE' } },
  steps: [{ stepId: 'check-label', kind: 'assert', operation: 'readText', selector: '#label', predicate: 'equals', expected: 'synthetic' }]
};

function makeBackend(ok: boolean): ActionBackend {
  return {
    backend: 'PLAYWRIGHT', targetId: 'cli-page',
    async execute(step: ActionStep): Promise<ActionOutcome> { return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok, value: 'synthetic' }; },
    async assert(step: ActionStep): Promise<ActionOutcome> { return { stepId: step.stepId, operation: step.operation, backend: 'PLAYWRIGHT', ok, value: 'secret-value' }; }
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

test('discover command options preserve their existing behavior', () => {
  assert.deepEqual(parseCliOptions([]), { endpoint: 'http://127.0.0.1:9222', timelinePath: '.agent-work/artifacts/timeline.jsonl' });
});
