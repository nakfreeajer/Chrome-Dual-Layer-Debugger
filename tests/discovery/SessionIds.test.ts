import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionIds } from '../../src/core/SessionIds.js';

test('allocates stable, deterministic IDs independently by kind', () => {
  const ids = new SessionIds();
  assert.equal(ids.next('CONTEXT'), 'CONTEXT-0001');
  assert.equal(ids.next('PAGE'), 'PAGE-0001');
  assert.equal(ids.next('FRAME'), 'FRAME-0001');
  assert.equal(ids.next('FRAME'), 'FRAME-0002');
  assert.equal(ids.next('PAGE'), 'PAGE-0002');
});

test('retains context and page IDs for the same object and advances for new objects', () => {
  const ids = new SessionIds();
  const context = {};
  const page = {};
  assert.equal(ids.forContext(context), 'CONTEXT-0001');
  assert.equal(ids.forContext(context), 'CONTEXT-0001');
  assert.equal(ids.forContext({}), 'CONTEXT-0002');
  assert.equal(ids.forPage(page), 'PAGE-0001');
  assert.equal(ids.forPage(page), 'PAGE-0001');
  assert.equal(ids.forPage({}), 'PAGE-0002');
});
