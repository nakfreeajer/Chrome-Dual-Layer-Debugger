import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCliOptions } from '../../src/cli/main.js';

test('V1 observation is opt-in and preserves existing defaults when absent', () => {
  assert.deepEqual(parseCliOptions([]), { endpoint: 'http://127.0.0.1:9222', timelinePath: '.agent-work/artifacts/timeline.jsonl' });
  assert.deepEqual(parseCliOptions(['--endpoint', 'http://localhost:9222', '--timeline', 'local.jsonl', '--observe-v1-ms', '1500']), {
    endpoint: 'http://localhost:9222', timelinePath: 'local.jsonl', observeV1Ms: 1500
  });
});

test('V1 observation duration rejects zero, negative, non-integer, unsafe and over-bound values', () => {
  for (const value of ['0', '-1', '1.5', '9007199254740992', '300001', '']) {
    assert.throws(() => parseCliOptions(['--observe-v1-ms', value]), /observe-v1-ms/);
  }
});

test('CLI rejects duplicate, missing, unknown and positional arguments instead of guessing', () => {
  assert.throws(() => parseCliOptions(['--observe-v1-ms', '1', '--observe-v1-ms', '2']), /Duplicate/);
  assert.throws(() => parseCliOptions(['--observe-v1-ms']), /requires a value/);
  assert.throws(() => parseCliOptions(['--unknown', 'x']), /Unknown/);
  assert.throws(() => parseCliOptions(['unexpected']), /Unknown/);
  assert.throws(() => parseCliOptions(['--endpoint', '']), /requires a value/);
});
