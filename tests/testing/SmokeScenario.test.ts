import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSmokeScenario } from '../../src/testing/SmokeScenarioParser.js';

const base = {
  schemaVersion: 1,
  scenarioId: 'synthetic-smoke',
  target: { pageUrl: 'http://127.0.0.1:4564/outer', scope: { kind: 'FRAME', url: 'http://localhost:4558/child' } },
  steps: [
    { stepId: 'read', kind: 'assert', operation: 'readText', selector: '#label', predicate: 'equals', expected: 'synthetic' },
    { stepId: 'fill', kind: 'action', operation: 'fill', selector: '#input', value: 'x' }
  ]
};

test('accepts schemaVersion 1 and freezes a backend-neutral PAGE or exact FRAME target', () => {
  assert.deepEqual(parseSmokeScenario(base).target, base.target);
  assert.deepEqual(parseSmokeScenario({ ...base, target: { pageUrl: 'https://example.test/app', scope: { kind: 'PAGE' } } }).target, { pageUrl: 'https://example.test/app', scope: { kind: 'PAGE' } });
});

test('rejects unsupported schema version and empty scenario identity', () => {
  assert.throws(() => parseSmokeScenario({ ...base, schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => parseSmokeScenario({ ...base, scenarioId: ' ' }), /scenarioId/);
});

test('rejects empty and duplicate step IDs', () => {
  assert.throws(() => parseSmokeScenario({ ...base, steps: [{ ...base.steps[0], stepId: '' }] }), /stepId/);
  assert.throws(() => parseSmokeScenario({ ...base, steps: [base.steps[0], { ...base.steps[1], stepId: 'read' }] }), /unique/);
});

test('parses action and assertion forms strictly', () => {
  const parsed = parseSmokeScenario(base);
  assert.equal(parsed.steps[0].kind, 'assert');
  assert.equal(parsed.steps[1].kind, 'action');
  assert.throws(() => parseSmokeScenario({ ...base, steps: [{ ...base.steps[1], extra: true }] }), /unsupported field/);
  assert.throws(() => parseSmokeScenario({ ...base, steps: [{ ...base.steps[0], predicate: 'approx' }] }), /predicate/);
  assert.throws(() => parseSmokeScenario({ ...base, steps: [{ ...base.steps[0], predicate: 'truthy', expected: true }] }), /not used/);
});

test('accepts the six bounded predicates with strict expected-field rules', () => {
  const { expected: _baseExpected, ...baseAssertion } = base.steps[0];
  const valid = [
    { predicate: 'truthy' }, { predicate: 'falsy' },
    { predicate: 'equals', expected: { a: 1 } }, { predicate: 'notEquals', expected: null },
    { predicate: 'contains', expected: 'bounded' }, { predicate: 'notContains', expected: '' }
  ];
  for (const assertion of valid) assert.equal(parseSmokeScenario({ ...base, steps: [{ ...baseAssertion, ...assertion }] }).steps[0].kind, 'assert');
  for (const assertion of [
    { predicate: 'truthy', expected: true }, { predicate: 'falsy', expected: false },
    { predicate: 'equals' }, { predicate: 'notEquals' }, { predicate: 'contains' }, { predicate: 'notContains', expected: 3 },
    { predicate: 'contains', expected: 'x'.repeat(4097) }, { predicate: 'regex', expected: 'x' }
  ]) assert.throws(() => parseSmokeScenario({ ...base, steps: [{ ...baseAssertion, ...assertion }] }));
});

test('rejects unknown or unqualified operations before any runner can mutate a page', () => {
  for (const operation of ['eval', 'doubleClick', 'rightClick', 'dragDrop', 'fileInput', 'screenshot']) {
    assert.throws(() => parseSmokeScenario({ ...base, steps: [{ stepId: 'bad', kind: 'action', operation, selector: '#x' }] }), /unknown|qualified/i);
  }
});

test('rejects assertions using any mutating operation', () => {
  assert.throws(() => parseSmokeScenario({ ...base, steps: [{ stepId: 'bad', kind: 'assert', operation: 'click', selector: '#button', predicate: 'truthy' }] }), /non-mutating/);
});

test('enforces bounded timeout and valid selector/value/key/delta shapes', () => {
  assert.throws(() => parseSmokeScenario({ ...base, steps: [{ ...base.steps[1], timeoutMs: 10_001 }] }), /TIMEOUT/);
  assert.throws(() => parseSmokeScenario({ ...base, steps: [{ ...base.steps[1], selector: '' }] }), /selector/);
  assert.throws(() => parseSmokeScenario({ ...base, steps: [{ stepId: 'press', kind: 'action', operation: 'press', selector: '#x' }] }), /key/);
  assert.throws(() => parseSmokeScenario({ ...base, steps: [{ stepId: 'scroll', kind: 'action', operation: 'scroll', selector: '#x', deltaY: 20_000 }] }), /deltaY/);
});

test('rejects malformed and ambiguous targets and non-HTTP URLs', () => {
  for (const target of [undefined, {}, { pageUrl: 'javascript:alert(1)', scope: { kind: 'PAGE' } }, { pageUrl: 'http://example.test', scope: { kind: 'FRAME' } }, { pageUrl: 'http://example.test', scope: { kind: 'PAGE', url: 'http://frame.test' } }]) {
    assert.throws(() => parseSmokeScenario({ ...base, target }));
  }
});

test('rejects arbitrary executable fields at scenario and step level', () => {
  assert.throws(() => parseSmokeScenario({ ...base, script: 'alert(1)' }), /unsupported field/);
  assert.throws(() => parseSmokeScenario({ ...base, steps: [{ ...base.steps[0], expression: 'document.body.remove()' }] }), /unsupported field/);
});

test('requires valid step arrays and caps scenario size', () => {
  assert.throws(() => parseSmokeScenario({ ...base, steps: [] }), /between 1 and 100/);
  assert.throws(() => parseSmokeScenario({ ...base, steps: 'bad' }), /between 1 and 100/);
  assert.throws(() => parseSmokeScenario({ ...base, steps: Array.from({ length: 101 }, (_, i) => ({ stepId: `s${i}`, kind: 'action', operation: 'ready' })) }), /between 1 and 100/);
});

test('checked-in pass and deterministic assertion-fail fixtures satisfy V1 schema', () => {
  const pass = JSON.parse(readFileSync('tests/fixtures/testing/smoke-pass.json', 'utf8')) as unknown;
  const fail = JSON.parse(readFileSync('tests/fixtures/testing/smoke-fail.json', 'utf8')) as unknown;
  assert.equal(parseSmokeScenario(pass).steps.length, 8);
  assert.equal(parseSmokeScenario(fail).steps[1].kind, 'assert');
});
