import assert from 'node:assert/strict';
import test from 'node:test';
import { detectLayer } from '../../src/core/LayerDetector.js';

test('classifies Apps Script macro URLs as BROWSER_PLUS_GAS', () => {
  assert.equal(
    detectLayer('https://script.google.com/macros/s/example/exec'),
    'BROWSER_PLUS_GAS'
  );
});

test('classifies other URLs as BROWSER_ONLY', () => {
  assert.equal(detectLayer('https://example.com/'), 'BROWSER_ONLY');
});
