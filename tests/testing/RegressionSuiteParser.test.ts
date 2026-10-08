import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseRegressionSuite, regressionSuiteSha256 } from '../../src/testing/RegressionSuiteParser.js';

const fixture = JSON.parse(readFileSync('tests/fixtures/testing/regression-suite-v1.json', 'utf8')) as Record<string, unknown>;

test('V1 golden suite parses deterministically with fixed case and step order', () => {
  const first = parseRegressionSuite(fixture);
  const second = parseRegressionSuite(fixture);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.cases.map((item) => item.caseId), ['readiness-pass', 'assertion-fail', 'seeded-monkey-pass']);
  assert.deepEqual(first.cases[1].expected.steps.map((step) => step.state), ['PASS', 'FAIL', 'NOT_RUN']);
  assert.match(regressionSuiteSha256(first), /^[a-f0-9]{64}$/);
  assert.equal(regressionSuiteSha256(first), regressionSuiteSha256(second));
});

test('rejects unknown schema fields, unknown runner kinds, and non-empty nondeterminism masks', () => {
  assert.throws(() => parseRegressionSuite({ ...fixture, schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => parseRegressionSuite({ ...fixture, surprise: true }), /unsupported field/);
  assert.throws(() => parseRegressionSuite({ ...fixture, nondeterministicFields: ['*'] }), /exactly \[\]/);
  const cases = fixture.cases as Array<Record<string, unknown>>;
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [{ ...cases[0], kind: 'SCRIPT' }] }), /kind/);
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [{ ...cases[0], extra: true }] }), /unsupported field/);
});

test('rejects duplicate case and nested step identities without reordering submitted cases', () => {
  const cases = fixture.cases as Array<Record<string, unknown>>;
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [cases[0], { ...cases[0] }] }), /caseId values must be unique/);
  const secondSmoke = cases[1] as Record<string, unknown>;
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [cases[0], { ...secondSmoke, caseId: 'distinct-case-but-duplicate-scenario', scenario: { ...((secondSmoke.scenario as Record<string, unknown>)), scenarioId: 'readiness-pass' } }] }), /scenario\/profile identity must be unique/);
  const first = cases[0];
  const scenario = first.scenario as Record<string, unknown>;
  const steps = scenario.steps as unknown[];
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [{ ...first, scenario: { ...scenario, steps: [steps[0], steps[0]] }, expected: { status: 'PASS', steps: [{ stepId: 'ready', state: 'PASS' }, { stepId: 'ready', state: 'PASS' }] } }] }), /unique/);
  assert.deepEqual(parseRegressionSuite(fixture).cases.map((item) => item.caseId), cases.map((item) => item.caseId));
});

test('rejects malformed expected outcomes, wildcard nondeterminism, and monkey plan/seed tampering', () => {
  const cases = fixture.cases as Array<Record<string, unknown>>;
  const smoke = cases[0];
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [{ ...smoke, expected: { status: 'PASS', steps: [{ stepId: 'ready', state: 'FAIL', errorCode: 'ACTION_FAILED' }] } }] }), /PASS requires/);
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [{ ...smoke, expected: { status: 'FAIL', steps: [{ stepId: 'ready', state: 'FAIL' }] } }] }), /errorCode is required for FAIL/);
  const monkey = cases[2];
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [{ ...monkey, seed: -1 }] }), /unsigned 32-bit/);
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [{ ...monkey, plan: [] }] }), /unsupported field/);
  const expected = monkey.expected as Record<string, unknown>;
  const expectedSteps = expected.steps as Array<Record<string, unknown>>;
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [{ ...monkey, expected: { ...expected, steps: [{ ...expectedSteps[0], candidateId: 'different-candidate' }, ...expectedSteps.slice(1)] } }] }), /does not match generated plan/);
  assert.throws(() => parseRegressionSuite({ ...fixture, eligibleBackends: ['PLAYWRIGHT', 'PLAYWRIGHT'] }), /unique/);
  assert.throws(() => parseRegressionSuite({ ...fixture, eligibleBackends: ['UNKNOWN'] }), /unsupported/);
});

test('bounds case count, total work, duration, and requires backend eligibility from accepted capabilities', () => {
  const cases = fixture.cases as unknown[];
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: Array.from({ length: 11 }, (_, index) => ({ ...(cases[0] as object), caseId: `case-${index}`, scenario: { ...((cases[0] as Record<string, unknown>).scenario as object), scenarioId: `scenario-${index}` } })) }), /between 1 and 10/);
  const monkey = cases[2] as Record<string, unknown>;
  const profile = monkey.profile as Record<string, unknown>;
  const bounds = profile.bounds as Record<string, unknown>;
  assert.throws(() => parseRegressionSuite({ ...fixture, cases: [{ ...monkey, profile: { ...profile, bounds: { ...bounds, maxDurationMs: 60_000 } } }, { ...monkey, caseId: 'second', profile: { ...profile, profileId: 'second-profile', bounds: { ...bounds, maxDurationMs: 60_000 } } }, { ...monkey, caseId: 'third', profile: { ...profile, profileId: 'third-profile', bounds: { ...bounds, maxDurationMs: 60_000 } } }] }), /execution budget/);
  assert.throws(() => parseRegressionSuite({ ...fixture, eligibleBackends: ['PLAYWRIGHT'], cases: [{ ...(cases[0] as Record<string, unknown>), scenario: { ...((cases[0] as Record<string, unknown>).scenario as object), steps: [{ stepId: 'bad', kind: 'action', operation: 'screenshot' }] }, expected: { status: 'PASS', steps: [{ stepId: 'bad', state: 'PASS' }] } }] }), /unknown|qualified/i);
});
