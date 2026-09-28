import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileJsonlTraceWriter } from '../../src/trace/JsonlTraceWriter.js';
import { Timeline } from '../../src/trace/Timeline.js';

test('writes independently parseable JSONL and appends on subsequent writer instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dual-layer-jsonl-'));
  const path = join(directory, 'nested', 'timeline.jsonl');
  try {
    const timeline = new Timeline();
    const first = timeline.create({ source: 'CORE', category: 'SESSION', type: 'START', data: { n: 1 } });
    const second = timeline.create({ source: 'CORE', category: 'SESSION', type: 'END', data: { n: 2 } });
    const writer1 = new FileJsonlTraceWriter(path);
    await writer1.write(first);
    await writer1.close();
    const writer2 = new FileJsonlTraceWriter(path);
    await writer2.write(second);
    await writer2.close();
    const contents = await readFile(path, 'utf8');
    const lines = contents.trimEnd().split(/\r?\n/);
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.map((line) => JSON.parse(line).eventId), ['EVENT-000001', 'EVENT-000002']);
    assert.ok(lines.every((line) => JSON.parse(line).sequence > 0));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
