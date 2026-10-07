import assert from 'node:assert/strict';
import test from 'node:test';
import { generateExploratoryPlan, validateExploratorySeed, exploratoryPlanSha256, EXPLORATORY_GENERATOR_VERSION } from '../../src/testing/ExploratoryGenerator.js';
import { parseExploratoryProfile } from '../../src/testing/ExploratoryProfileParser.js';

const profile = parseExploratoryProfile({ schemaVersion: 1, profileId: 'generator-test',
  target: { pageUrl: 'http://127.0.0.1/app', scope: { kind: 'PAGE' } }, bounds: { maxActions: 8, maxDurationMs: 1000 },
  candidates: [{ candidateId: 'a', operation: 'click', selector: '#a' }, { candidateId: 'b', operation: 'fill', selector: '#b', value: 'synthetic' }, { candidateId: 'c', operation: 'press', selector: '#c', key: 'Enter' }] });

test('seeded generator is deterministic, ordered, versioned and replayable as one exact plan', () => {
  const a = generateExploratoryPlan(profile, 123456);
  const b = generateExploratoryPlan(profile, 123456);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.generatorVersion, EXPLORATORY_GENERATOR_VERSION);
  assert.equal(a.generatorVersion, 'TEST1C_GEN_V1');
  assert.deepEqual(a.plan.map((action) => action.stepId), Array.from({ length: 8 }, (_, index) => `MONKEY-${String(index + 1).padStart(6, '0')}`));
  assert.deepEqual(a.plan.map((action) => action.candidateId), ['b', 'c', 'c', 'a', 'a', 'a', 'b', 'b']);
  assert.match(exploratoryPlanSha256(a), /^[a-f0-9]{64}$/);
  assert.notEqual(JSON.stringify(a.plan), JSON.stringify(generateExploratoryPlan(profile, 123457).plan));
});

test('seed accepts only the unsigned 32-bit domain', () => {
  assert.equal(validateExploratorySeed(0), 0);
  assert.equal(validateExploratorySeed(0xFFFF_FFFF), 0xFFFF_FFFF);
  for (const value of [-1, 0x1_0000_0000, 1.2, Number.NaN, '1']) assert.throws(() => validateExploratorySeed(value));
});
