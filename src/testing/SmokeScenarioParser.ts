import { CAPABILITY_MATRIX } from './CapabilityMatrix.js';
import { isMutatingOperation, boundedTimeoutMs, type ActionOperation } from './ActionContract.js';
import type { SmokeScenario, SmokeStep } from './SmokeScenario.js';

const actionFields = new Set(['stepId', 'kind', 'operation', 'selector', 'value', 'key', 'deltaX', 'deltaY', 'timeoutMs']);
const assertionFields = new Set([...actionFields, 'predicate', 'expected']);
const topFields = new Set(['schemaVersion', 'scenarioId', 'target', 'steps']);
const targetFields = new Set(['pageUrl', 'scope']);
const pageScopeFields = new Set(['kind']);
const frameScopeFields = new Set(['kind', 'url']);
const operationSet = new Set<ActionOperation>([
  'click', 'fill', 'type', 'clear', 'press', 'scroll', 'scrollIntoView', 'hover', 'focus',
  'check', 'uncheck', 'select', 'readText', 'readValue', 'readState', 'exists', 'visible', 'waitFor', 'ready'
]);
const selectorless = new Set<ActionOperation>(['ready']);
const valueOperations = new Set<ActionOperation>(['fill', 'type', 'select']);
const keyOperations = new Set<ActionOperation>(['press']);
const deltaOperations = new Set<ActionOperation>(['scroll']);
const readOperations = new Set<ActionOperation>(['readText', 'readValue', 'readState', 'exists', 'visible', 'ready', 'waitFor']);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactFields(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
}

function nonEmptyString(value: unknown, label: string, max = 4096): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty bounded string`);
  }
  return value;
}

function validUrl(value: unknown, label: string): string {
  const text = nonEmptyString(value, label);
  let parsed: URL;
  try { parsed = new URL(text); } catch { throw new Error(`${label} must be an absolute URL`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`${label} must be an HTTP(S) URL without credentials`);
  return text;
}

function parseTarget(value: unknown): SmokeScenario['target'] {
  const target = record(value, 'target');
  exactFields(target, targetFields, 'target');
  const pageUrl = validUrl(target.pageUrl, 'target.pageUrl');
  const scope = record(target.scope, 'target.scope');
  if (scope.kind === 'PAGE') {
    exactFields(scope, pageScopeFields, 'target.scope');
    return { pageUrl, scope: { kind: 'PAGE' } };
  }
  if (scope.kind === 'FRAME') {
    exactFields(scope, frameScopeFields, 'target.scope');
    const url = validUrl(scope.url, 'target.scope.url');
    if (url === pageUrl) throw new Error('FRAME scope URL must identify a distinct exact frame URL');
    return { pageUrl, scope: { kind: 'FRAME', url } };
  }
  throw new Error('target.scope.kind must be PAGE or FRAME');
}

function parseStep(value: unknown, index: number): SmokeStep {
  const item = record(value, `steps[${index}]`);
  if (item.kind !== 'action' && item.kind !== 'assert') throw new Error(`steps[${index}].kind must be action or assert`);
  exactFields(item, item.kind === 'action' ? actionFields : assertionFields, `steps[${index}]`);
  const stepId = nonEmptyString(item.stepId, `steps[${index}].stepId`, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(stepId)) throw new Error(`steps[${index}].stepId has invalid characters`);
  if (typeof item.operation !== 'string' || !operationSet.has(item.operation as ActionOperation)) throw new Error(`steps[${index}].operation is unknown`);
  const operation = item.operation as ActionOperation;
  const capability = CAPABILITY_MATRIX.find((row) => row.operation === operation);
  if (!capability || capability.playwright !== 'PASS' || capability.gasOopif !== 'PASS') throw new Error(`steps[${index}].operation is not qualified on both backends`);
  if (item.kind === 'assert' && (!readOperations.has(operation) || isMutatingOperation(operation))) throw new Error(`steps[${index}] assertion operation must be a non-mutating read`);
  const selector = item.selector === undefined ? undefined : nonEmptyString(item.selector, `steps[${index}].selector`, 512);
  if (!selectorless.has(operation) && selector === undefined) throw new Error(`steps[${index}].selector is required`);
  if (selectorless.has(operation) && selector !== undefined) throw new Error(`steps[${index}].selector is not applicable`);
  const result: Record<string, unknown> = { stepId, kind: item.kind, operation };
  if (selector !== undefined) result.selector = selector;
  if (valueOperations.has(operation)) {
    if (typeof item.value !== 'string' || item.value.length > 4096 || item.value.includes('\0') || (operation === 'select' && !item.value.trim())) throw new Error(`steps[${index}].value must be a bounded string`);
    result.value = item.value;
  }
  else if (item.value !== undefined) throw new Error(`steps[${index}].value is not applicable`);
  if (keyOperations.has(operation)) result.key = nonEmptyString(item.key, `steps[${index}].key`, 64);
  else if (item.key !== undefined) throw new Error(`steps[${index}].key is not applicable`);
  if (deltaOperations.has(operation)) {
    for (const axis of ['deltaX', 'deltaY'] as const) {
      if (item[axis] !== undefined && (typeof item[axis] !== 'number' || !Number.isFinite(item[axis]) || Math.abs(item[axis] as number) > 10_000)) throw new Error(`steps[${index}].${axis} must be a bounded finite number`);
      if (item[axis] !== undefined) result[axis] = item[axis];
    }
    if (item.deltaX === undefined && item.deltaY === undefined) throw new Error(`steps[${index}] scroll requires a delta`);
  } else if (item.deltaX !== undefined || item.deltaY !== undefined) throw new Error(`steps[${index}] delta is not applicable`);
  if (item.timeoutMs !== undefined) result.timeoutMs = boundedTimeoutMs(item.timeoutMs as number);
  if (item.kind === 'assert') {
    if (item.predicate !== 'truthy' && item.predicate !== 'equals') throw new Error(`steps[${index}].predicate must be truthy or equals`);
    if (item.predicate === 'equals' && !Object.prototype.hasOwnProperty.call(item, 'expected')) throw new Error(`steps[${index}].expected is required for equals`);
    if (item.predicate === 'truthy' && Object.prototype.hasOwnProperty.call(item, 'expected')) throw new Error(`steps[${index}].expected is not used by truthy`);
    result.predicate = item.predicate;
    if (item.predicate === 'equals') result.expected = item.expected;
  }
  return result as unknown as SmokeStep;
}

export function parseSmokeScenario(input: unknown): SmokeScenario {
  const value = record(input, 'scenario');
  exactFields(value, topFields, 'scenario');
  if (value.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  const scenarioId = nonEmptyString(value.scenarioId, 'scenarioId', 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(scenarioId)) throw new Error('scenarioId has invalid characters');
  const target = parseTarget(value.target);
  if (!Array.isArray(value.steps) || value.steps.length === 0 || value.steps.length > 100) throw new Error('steps must contain between 1 and 100 entries');
  const steps = value.steps.map(parseStep);
  const ids = steps.map((step) => step.stepId);
  if (new Set(ids).size !== ids.length) throw new Error('stepId values must be unique');
  return { schemaVersion: 1, scenarioId, target, steps };
}
