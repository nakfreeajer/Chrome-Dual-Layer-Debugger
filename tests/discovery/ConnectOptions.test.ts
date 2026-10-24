import assert from 'node:assert/strict';
import test from 'node:test';
import { connectOverCDPOptions } from '../../src/browser/ConnectOptions.js';
import { validateTestCdpEndpoint } from '../../src/browser/ConnectOptions.js';

test('uses low-intrusion defaults and marks only loopback endpoints local', () => {
  assert.deepEqual(connectOverCDPOptions('http://localhost:9222'), { noDefaults: true, isLocal: true });
  assert.deepEqual(connectOverCDPOptions('http://127.0.0.1:9222'), { noDefaults: true, isLocal: true });
  assert.deepEqual(connectOverCDPOptions('http://[::1]:9222'), { noDefaults: true, isLocal: true });
  assert.deepEqual(connectOverCDPOptions('https://browser.example.test:9222'), { noDefaults: true, isLocal: false });
});

test('TEST CDP endpoint accepts only canonical loopback authorities and valid root endpoints', () => {
  for (const endpoint of ['http://127.0.0.1:9222', 'https://127.0.0.1/', 'http://[::1]:9444']) {
    assert.equal(validateTestCdpEndpoint(endpoint), endpoint);
  }
  for (const endpoint of [
    'http://localhost:9222', 'http://127.0.0.2:9222', 'http://192.0.2.1:9222',
    'http://user@127.0.0.1:9222', 'http://127.0.0.1:0', 'http://127.0.0.1:65536',
    'http://127.0.0.1:09222', 'http://127.0.0.1:/', 'http://127.0.0.1/path',
    'http://127.0.0.1/?x=1', 'file:///json/list', 'http://127.0.0.1\\@example.test:9222'
  ]) assert.throws(() => validateTestCdpEndpoint(endpoint), /TEST_CDP_ENDPOINT/);
  assert.equal(validateTestCdpEndpoint('ws://[::1]:9222/devtools/browser/synthetic-id', true), 'ws://[::1]:9222/devtools/browser/synthetic-id');
  assert.throws(() => validateTestCdpEndpoint('ws://[::1]:9222'), /TEST_CDP_ENDPOINT_INVALID/);
});
