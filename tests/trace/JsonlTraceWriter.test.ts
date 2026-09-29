import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileJsonlTraceWriter } from '../../src/trace/JsonlTraceWriter.js';
import { Timeline } from '../../src/trace/Timeline.js';
import { emitSessionEvent } from '../../src/trace/DiscoveryEvents.js';

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

test('appends two runs with repeated local event IDs and unique runId/eventId pairs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dual-layer-runs-'));
  const path = join(directory, 'timeline.jsonl');
  try {
    const runA = new Timeline({ runId: 'RUN-A' });
    const runB = new Timeline({ runId: 'RUN-B' });
    emitSessionEvent(runA, 'SESSION_STARTED');
    emitSessionEvent(runA, 'SESSION_ENDED');
    emitSessionEvent(runB, 'SESSION_STARTED');
    emitSessionEvent(runB, 'SESSION_ENDED');
    const writerA = new FileJsonlTraceWriter(path);
    for (const event of runA.snapshot()) await writerA.write(event);
    await writerA.close();
    const writerB = new FileJsonlTraceWriter(path);
    for (const event of runB.snapshot()) await writerB.write(event);
    await writerB.close();

    const lines = (await readFile(path, 'utf8')).trimEnd().split(/\r?\n/);
    const events = lines.map((line) => JSON.parse(line) as { runId: string; eventId: string; type: string });
    const pairs = events.map(({ runId, eventId }) => `${runId}\u0000${eventId}`);
    assert.equal(lines.length, 4);
    assert.deepEqual(events.map(({ eventId }) => eventId), ['EVENT-000001', 'EVENT-000002', 'EVENT-000001', 'EVENT-000002']);
    assert.deepEqual(new Set(events.map(({ runId }) => runId)), new Set(['RUN-A', 'RUN-B']));
    assert.equal(events.length - new Set(events.map(({ eventId }) => eventId)).size, 2);
    assert.equal(pairs.length - new Set(pairs).size, 0);
    for (const runId of ['RUN-A', 'RUN-B']) {
      assert.equal(events.filter((event) => event.runId === runId && event.type === 'SESSION_STARTED').length, 1);
      assert.equal(events.filter((event) => event.runId === runId && event.type === 'SESSION_ENDED').length, 1);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
