import test from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { Timeline } from '../../src/trace/Timeline.js';
import { assertWithTimeline, executeWithTimeline, validateTestAuthorization, type ActionStep } from '../../src/testing/ActionContract.js';
import { CAPABILITY_MATRIX } from '../../src/testing/CapabilityMatrix.js';
import { GasOopifActionBackend } from '../../src/testing/GasOopifActionBackend.js';
import { PlaywrightActionBackend } from '../../src/testing/PlaywrightActionBackend.js';

const authorization = { mode: 'TEST' as const, backend: 'GAS_OOPIF' as const, targetId: 'target-fixture', fixtureId: 'fixture-parity-v1', approvalReference: 'test-approval' };

function makePage(): Page {
  const events: string[] = [];
  const locator = () => ({
    async click() { events.push('click'); }, async fill(value: string) { events.push(`fill:${value}`); },
    async type(value: string) { events.push(`type:${value}`); }, async press(key: string) { events.push(`press:${key}`); },
    async scrollIntoViewIfNeeded() { events.push('scrollIntoView'); }, async hover() { events.push('hover'); },
    async focus() { events.push('focus'); }, async check() { events.push('check'); }, async uncheck() { events.push('uncheck'); },
    async selectOption(value: string) { events.push(`select:${value}`); return [value]; },
    async innerText() { return 'fixture text'; }, async inputValue() { return 'fixture value'; },
    async evaluate() { return { disabled: false, checked: true, selected: false, tagName: 'input' }; },
    async count() { return 1; }, async isVisible() { return true; }, async waitFor() { return undefined; }
  });
  return {
    locator,
    mouse: { async wheel(x: number, y: number) { events.push(`wheel:${x}:${y}`); } },
    async waitForLoadState() { return undefined; }, async evaluate() { return 'complete'; },
    __events: events
  } as unknown as Page;
}

function makeGas() {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const gas = {
    async sendScopedCommand(request: { method: string; params?: Record<string, unknown> }) {
      calls.push({ method: request.method, params: request.params ?? {} });
      if (request.method !== 'Runtime.evaluate') return {};
      const expression = String(request.params?.expression ?? '');
      let value: unknown = true;
      if (expression === 'document.readyState') value = 'complete';
      else if (expression.includes('innerText')) value = 'fixture text';
      else if (expression.includes("'value' in e")) value = 'fixture value';
      else if (expression.includes("return !!(r.width")) value = true;
      else if (expression.includes('getComputedStyle')) value = { disabled: false, checked: true, selected: false, visible: true, tagName: 'input' };
      else if (expression.includes('e.value=')) value = 'synthetic';
      return { result: { value } };
    }
  };
  return { gas, calls };
}

test('authorization is target- and backend-bound; mutations fail closed without it', async () => {
  assert.throws(() => validateTestAuthorization('PLAYWRIGHT', 'target-fixture', authorization), /TARGET_MISMATCH/);
  const page = makePage();
  const backend = new PlaywrightActionBackend('target-fixture', page);
  const denied = await backend.execute({ stepId: 's1', operation: 'click', selector: '#button' });
  assert.equal(denied.ok, false);
  assert.equal(denied.errorCode, 'AUTHORIZATION_REQUIRED');
  assert.deepEqual((page as unknown as { __events: string[] }).__events, []);
});

test('same declared read/action scenario has matching normalized outcomes through both adapter contracts', async () => {
  const page = makePage();
  const { gas, calls } = makeGas();
  const playwright = new PlaywrightActionBackend('target-fixture', page);
  const raw = new GasOopifActionBackend('target-fixture', 'session-fixture', 31, gas);
  const gasAuthorization = authorization;
  const playwrightAuthorization = { ...authorization, backend: 'PLAYWRIGHT' as const };
  const scenario: ActionStep[] = [
    { stepId: 'ready', operation: 'ready', timeoutMs: 1000 },
    { stepId: 'exists', operation: 'exists', selector: '#input' },
    { stepId: 'text', operation: 'readText', selector: '#label' },
    { stepId: 'value', operation: 'readValue', selector: '#input' },
    { stepId: 'visible', operation: 'visible', selector: '#input' },
    { stepId: 'fill', operation: 'fill', selector: '#input', value: 'synthetic' },
    { stepId: 'check', operation: 'check', selector: '#check' },
    { stepId: 'select', operation: 'select', selector: '#select', value: 'synthetic' }
  ];
  for (const step of scenario) {
    const [pw, cdp] = await Promise.all([
      playwright.execute(step, playwrightAuthorization),
      raw.execute(step, gasAuthorization)
    ]);
    assert.equal(pw.ok, true, `${step.operation} Playwright`);
    assert.equal(cdp.ok, true, `${step.operation} GAS/OOPIF`);
    assert.equal(pw.stepId, cdp.stepId);
    assert.equal(pw.operation, cdp.operation);
    if (['ready', 'exists', 'readText', 'readValue', 'visible', 'select'].includes(step.operation)) assert.deepEqual(pw.value, cdp.value);
  }
  assert.ok(calls.some((call) => call.method === 'Runtime.evaluate'));
  assert.ok((page as unknown as { __events: string[] }).__events.includes('fill:synthetic'));
});

test('Timeline action/assertion helpers emit privacy-reduced lifecycle evidence', async () => {
  const timeline = new Timeline({ runId: 'test-run' });
  const { gas } = makeGas();
  const backend = new GasOopifActionBackend('target-fixture', 'session-fixture', 31, gas);
  const step = { stepId: 'step-1', operation: 'readText' as const, selector: '#private-selector' };
  await executeWithTimeline(backend, step, timeline, authorization);
  await assertWithTimeline(backend, { ...step, stepId: 'assert-1' }, 'equals', 'fixture text', timeline, authorization);
  const events = timeline.snapshot();
  assert.deepEqual(events.map((event) => event.type), ['ACTION_STARTED', 'ACTION_COMPLETED', 'ASSERTION_PASSED']);
  assert.ok(events.every((event) => !JSON.stringify(event.data).includes('#private-selector')));
});

test('equals assertions compare freshly-read structural state rather than object identity', async () => {
  const page = makePage();
  const backend = new PlaywrightActionBackend('target-fixture', page);
  const expected = { disabled: false, checked: true, selected: false, tagName: 'input' };
  const actual = { ...expected };
  assert.notEqual(actual, expected);
  const result = await backend.assert({ stepId: 'state-equality', operation: 'readState', selector: '#checkbox' }, 'equals', expected);
  assert.equal(result.ok, true);
});

test('all six assertions use identical shared semantics on Playwright and GAS/OOPIF', async () => {
  const playwright = new PlaywrightActionBackend('target-fixture', makePage());
  const { gas } = makeGas();
  const raw = new GasOopifActionBackend('target-fixture', 'session-fixture', 31, gas);
  const cases = [
    ['truthy', 'fixture text', undefined, true], ['falsy', '', undefined, true],
    ['equals', { checked: true }, { checked: true }, true], ['notEquals', { checked: true }, { checked: false }, true],
    ['contains', 'fixture text', 'ture', true], ['notContains', 'fixture text', 'missing', true]
  ] as const;
  for (const [predicate, actual, expected, pass] of cases) {
    const step: ActionStep = { stepId: `assert-${predicate}`, operation: typeof actual === 'object' ? 'readState' : 'readText', selector: '#label' };
    const originalExecutePw = playwright.execute.bind(playwright);
    const originalExecuteGas = raw.execute.bind(raw);
    (playwright as unknown as { execute: typeof playwright.execute }).execute = async (s, auth) => ({ stepId: s.stepId, operation: s.operation, backend: 'PLAYWRIGHT', ok: true, value: actual });
    (raw as unknown as { execute: typeof raw.execute }).execute = async (s, auth) => ({ stepId: s.stepId, operation: s.operation, backend: 'GAS_OOPIF', ok: true, value: actual });
    const [pw, cdp] = await Promise.all([
      playwright.assert(step, predicate, expected, { ...authorization, backend: 'PLAYWRIGHT' }),
      raw.assert(step, predicate, expected, authorization)
    ]);
    assert.equal(pw.ok, pass); assert.equal(cdp.ok, pass); assert.equal(pw.errorCode, cdp.errorCode);
    (playwright as unknown as { execute: typeof playwright.execute }).execute = originalExecutePw;
    (raw as unknown as { execute: typeof raw.execute }).execute = originalExecuteGas;
  }
});

test('capability matrix marks only live-qualified operations PASS and keeps unsupported gaps explicit', () => {
  const rows = CAPABILITY_MATRIX.filter((row) => !['doubleClick', 'rightClick', 'dragDrop', 'fileInput', 'screenshot'].includes(row.operation));
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.playwright === 'PASS' && row.gasOopif === 'PASS' && row.evidence.includes('TEST.1A live Brave 9444 OOPIF proof')));
  for (const operation of ['doubleClick', 'rightClick', 'dragDrop', 'fileInput']) {
    const row = CAPABILITY_MATRIX.find((candidate) => candidate.operation === operation);
    assert.equal(row?.playwright, 'GAP');
    assert.equal(row?.gasOopif, 'GAP');
  }
  const screenshot = CAPABILITY_MATRIX.find((candidate) => candidate.operation === 'screenshot');
  assert.equal(screenshot?.playwright, 'BACKEND_SPECIFIC');
  assert.equal(screenshot?.gasOopif, 'GAP');
});
