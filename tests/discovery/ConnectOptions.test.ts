import assert from 'node:assert/strict';
import test from 'node:test';
import { connectOverCDPOptions } from '../../src/browser/ConnectOptions.js';

test('uses low-intrusion defaults and marks only loopback endpoints local', () => {
  assert.deepEqual(connectOverCDPOptions('http://localhost:9222'), { noDefaults: true, isLocal: true });
  assert.deepEqual(connectOverCDPOptions('http://127.0.0.1:9222'), { noDefaults: true, isLocal: true });
  assert.deepEqual(connectOverCDPOptions('http://[::1]:9222'), { noDefaults: true, isLocal: true });
  assert.deepEqual(connectOverCDPOptions('https://browser.example.test:9222'), { noDefaults: true, isLocal: false });
});
