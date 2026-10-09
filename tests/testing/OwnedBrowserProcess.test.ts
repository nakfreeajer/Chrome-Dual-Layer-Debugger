import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { isActiveOwnedBrowserLease, launchOwnedBrowser, launchOwnedBrowserWithPlatformForTests } from '../../src/testing/OwnedBrowserProcess.js';

const PORT = 43179;
const SOCKET_PATH = '/devtools/browser/test-owned-browser';

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly signals: Array<NodeJS.Signals | number | undefined> = [];

  constructor(readonly pid: number | undefined = 45678) { super(); }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.signals.push(signal);
    this.signalCode = typeof signal === 'string' ? signal : 'SIGTERM';
    this.exitCode = 0;
    this.emit('exit', this.exitCode, this.signalCode);
    this.emit('close', this.exitCode, this.signalCode);
    return true;
  }

  exitUnexpectedly(): void {
    this.exitCode = 7;
    this.signalCode = null;
    this.emit('exit', this.exitCode, null);
    this.emit('close', this.exitCode, null);
  }
}

async function profileDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cdld-owned-browser-test-'));
}

function setup(overrides: Record<string, unknown> = {}) {
  const child = new FakeChild();
  const calls: { executable?: string; args?: readonly string[]; removedProfiles: string[]; killed: number } = {
    removedProfiles: [], killed: 0
  };
  child.kill = (signal?: NodeJS.Signals | number) => {
    calls.killed += 1;
    child.signals.push(signal);
    child.signalCode = typeof signal === 'string' ? signal : 'SIGTERM';
    child.exitCode = 0;
    child.emit('exit', child.exitCode, child.signalCode);
    child.emit('close', child.exitCode, child.signalCode);
    return true;
  };
  const state: { profilePath?: string; portFile: string; version: { Browser?: unknown; webSocketDebuggerUrl?: unknown }; portFree: boolean; child: FakeChild } = {
    portFile: `${PORT}\n${SOCKET_PATH}\n`,
    version: { Browser: 'Chrome/130.0.0.0', webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}${SOCKET_PATH}` },
    portFree: true,
    child
  };
  const platform = {
    async resolveExecutable() { return process.execPath; },
    async createProfile() { state.profilePath = await profileDirectory(); return state.profilePath; },
    spawn(executable: string, args: readonly string[]) { calls.executable = executable; calls.args = [...args]; return child; },
    async readPortFile() { return state.portFile; },
    async fetchVersion() { return state.version; },
    async removeProfile(path: string) { calls.removedProfiles.push(path); await rm(path, { recursive: true, force: true }); },
    async accessProfile(path: string) { await access(path); },
    async verifyPortReleased() { return state.portFree; },
    async wait() {}
  };
  Object.assign(platform, overrides);
  return { platform, child, calls, state };
}

test('launch creates an owned loopback lease from the spawned child and closes only that child', async () => {
  const f = setup();
  const lease = await launchOwnedBrowserWithPlatformForTests(f.platform);
  assert.equal(isActiveOwnedBrowserLease(lease), true);
  assert.equal(lease.getProcessId(), 45678);
  assert.equal(lease.getEndpoint(), `http://127.0.0.1:${PORT}`);
  assert.equal(f.calls.executable, process.execPath);
  assert.equal(f.calls.args?.includes('--remote-debugging-port=0'), true);
  assert.equal(f.calls.args?.includes('--remote-debugging-address=127.0.0.1'), true);
  assert.equal(f.calls.args?.some((arg) => arg.startsWith('--user-data-dir=')), true);
  assert.equal(f.calls.args?.includes('about:blank'), true);
  const firstClose = lease.close();
  const secondClose = lease.close();
  assert.equal(firstClose, secondClose);
  assert.deepEqual(await firstClose, { processStatus: 'VERIFIED', profileStatus: 'VERIFIED', endpointStatus: 'VERIFIED', overallStatus: 'VERIFIED' });
  assert.equal(f.calls.killed, 1);
  assert.equal(f.calls.removedProfiles.length, 1);
  assert.equal(f.calls.removedProfiles[0], f.state.profilePath);
  assert.equal(isActiveOwnedBrowserLease(lease), false);
  assert.throws(() => lease.getEndpoint(), /OWNED_BROWSER_LEASE_INACTIVE/);
  assert.throws(() => lease.getProcessId(), /OWNED_BROWSER_LEASE_INACTIVE/);
});

test('spawn failure removes only the just-created profile and does not signal a process', async () => {
  const f = setup({ spawn() { throw new Error('spawn failed'); } });
  await assert.rejects(launchOwnedBrowserWithPlatformForTests(f.platform), /spawn failed/);
  assert.equal(f.calls.killed, 0);
  assert.deepEqual(f.calls.removedProfiles, [f.state.profilePath]);
});

test('premature child exit during endpoint discovery fails closed without signalling another process', async () => {
  const f = setup({ async readPortFile() { f.child.exitUnexpectedly(); return f.state.portFile; } });
  await assert.rejects(launchOwnedBrowserWithPlatformForTests(f.platform), /OWNED_BROWSER_PROCESS_EXITED_DURING_STARTUP/);
  assert.equal(f.calls.killed, 0);
  assert.deepEqual(f.calls.removedProfiles, [f.state.profilePath]);
});

test('endpoint mismatch and a port claimed by another listener never create a lease', async (t) => {
  await t.test('websocket identity does not match the launch port file', async () => {
    const f = setup();
    // Mutate only the synthetic response; the process handle remains the owned child.
    f.state.version = { Browser: 'Chrome/130', webSocketDebuggerUrl: 'ws://127.0.0.1:43180/devtools/browser/other' };
    await assert.rejects(launchOwnedBrowserWithPlatformForTests(f.platform, 20), /OWNED_BROWSER_ENDPOINT_UNVERIFIED/);
    assert.equal(f.calls.killed, 1);
    assert.equal(f.calls.removedProfiles.length, 1);
  });
  await t.test('unrecognized browser product is ambiguous', async () => {
    const f = setup();
    f.state.version = { Browser: 'Unknown/1', webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}${SOCKET_PATH}` };
    await assert.rejects(launchOwnedBrowserWithPlatformForTests(f.platform, 20), /OWNED_BROWSER_ENDPOINT_UNVERIFIED/);
    assert.equal(f.calls.killed, 1);
  });
  await t.test('invalid dynamic port is rejected', async () => {
    const f = setup();
    f.state.portFile = `0\n${SOCKET_PATH}\n`;
    await assert.rejects(launchOwnedBrowserWithPlatformForTests(f.platform, 20), /OWNED_BROWSER_ENDPOINT_UNVERIFIED/);
    assert.equal(f.calls.killed, 1);
  });
});

test('missing PID fails closed and cleanup targets only the exact spawned handle', async () => {
  const f = setup();
  Object.defineProperty(f.child, 'pid', { value: undefined });
  await assert.rejects(launchOwnedBrowserWithPlatformForTests(f.platform), /OWNED_BROWSER_PROCESS_ID_UNAVAILABLE/);
  assert.equal(f.calls.killed, 1);
  assert.deepEqual(f.calls.removedProfiles, [f.state.profilePath]);
});

test('cleanup reports endpoint or profile failures and invalidates the lease', async (t) => {
  await t.test('occupied endpoint produces FAILED', async () => {
    const f = setup();
    const lease = await launchOwnedBrowserWithPlatformForTests(f.platform);
    f.state.portFree = false;
    const result = await lease.close();
    assert.equal(result.endpointStatus, 'FAILED');
    assert.equal(result.overallStatus, 'FAILED');
    assert.equal(isActiveOwnedBrowserLease(lease), false);
  });
  await t.test('profile cleanup error produces FAILED', async () => {
    const f = setup({ async removeProfile() { throw new Error('cleanup denied'); } });
    const lease = await launchOwnedBrowserWithPlatformForTests(f.platform);
    const result = await lease.close();
    assert.equal(result.processStatus, 'VERIFIED');
    assert.equal(result.profileStatus, 'FAILED');
    assert.equal(result.overallStatus, 'FAILED');
  });
  await t.test('profile removal records bounded Node error fields without paths or messages', async () => {
    let privatePath = '';
    const f = setup({ async removeProfile(path: string) {
      privatePath = path;
      throw Object.assign(new Error(`private cleanup detail ${path}`), { code: 'EBUSY', errno: -16, syscall: 'rmdir', path });
    } });
    const lease = await launchOwnedBrowserWithPlatformForTests(f.platform);
    const result = await lease.close();
    assert.equal(result.profileStatus, 'FAILED');
    assert.equal(result.overallStatus, 'FAILED');
    assert.deepEqual(result.profileDiagnostic, {
      stage: 'profile_remove', cause: 'filesystem_error', code: 'EBUSY', errno: -16, syscall: 'rmdir'
    });
    assert.equal(JSON.stringify(result).includes(privatePath), false);
    assert.equal(JSON.stringify(result).includes('private cleanup detail'), false);
  });
  await t.test('non-Node profile removal error is recorded only as unknown', async () => {
    const f = setup({ async removeProfile(path: string) { throw { message: `secret ${path}`, code: 'PRIVATE_VALUE', path }; } });
    const lease = await launchOwnedBrowserWithPlatformForTests(f.platform);
    const result = await lease.close();
    assert.equal(result.profileStatus, 'FAILED');
    assert.equal(result.overallStatus, 'FAILED');
    assert.deepEqual(result.profileDiagnostic, { stage: 'profile_remove', cause: 'unknown' });
    assert.equal(JSON.stringify(result).includes('secret'), false);
    assert.equal(JSON.stringify(result).includes('PRIVATE_VALUE'), false);
  });
  await t.test('successful removal that leaves the profile present is distinguished', async () => {
    const f = setup({ async removeProfile() {} });
    const lease = await launchOwnedBrowserWithPlatformForTests(f.platform);
    const result = await lease.close();
    assert.equal(result.profileStatus, 'FAILED');
    assert.equal(result.overallStatus, 'FAILED');
    assert.deepEqual(result.profileDiagnostic, { stage: 'profile_verify', cause: 'profile_still_present' });
  });
  await t.test('inaccessible post-removal verification remains UNKNOWN and never passes', async () => {
    const f = setup({ async accessProfile(path: string) {
      throw Object.assign(new Error(`private verification detail ${path}`), { code: 'EACCES', errno: -13, syscall: 'access', path });
    } });
    const lease = await launchOwnedBrowserWithPlatformForTests(f.platform);
    const result = await lease.close();
    assert.equal(result.profileStatus, 'UNKNOWN');
    assert.equal(result.overallStatus, 'UNKNOWN');
    const profilePath = f.state.profilePath;
    assert.ok(profilePath);
    assert.deepEqual(result.profileDiagnostic, {
      stage: 'profile_verify', cause: 'inaccessible', code: 'EACCES', errno: -13, syscall: 'access'
    });
    assert.equal(JSON.stringify(result).includes(profilePath), false);
    assert.equal(JSON.stringify(result).includes('private verification detail'), false);
  });
  await t.test('endpoint verification exception remains UNKNOWN', async () => {
    const f = setup({ async verifyPortReleased() { throw new Error('probe unavailable'); } });
    const lease = await launchOwnedBrowserWithPlatformForTests(f.platform);
    const result = await lease.close();
    assert.equal(result.endpointStatus, 'UNKNOWN');
    assert.equal(result.overallStatus, 'UNKNOWN');
  });
});

test('forged structural objects do not pass the in-process lease capability check', () => {
  const forged = { getEndpoint: () => `http://127.0.0.1:${PORT}`, getProcessId: () => 45678, async close() { return undefined; } };
  assert.equal(isActiveOwnedBrowserLease(forged), false);
  assert.equal(isActiveOwnedBrowserLease({ endpoint: `http://127.0.0.1:${PORT}`, pid: 45678 }), false);
});

test('public launch surface accepts no caller endpoint, executable, PID, or profile authority', () => {
  assert.equal(launchOwnedBrowser.length, 0);
  const forged = { getEndpoint: () => 'http://127.0.0.1:9444', getProcessId: () => 1234, async close() { return undefined; } };
  assert.equal(isActiveOwnedBrowserLease(forged), false);
});

test('unexpected exit invalidates the lease and teardown verifies its owned resources', async () => {
  const f = setup();
  const lease = await launchOwnedBrowserWithPlatformForTests(f.platform);
  f.child.exitUnexpectedly();
  assert.equal(isActiveOwnedBrowserLease(lease), false);
  assert.throws(() => lease.getEndpoint(), /OWNED_BROWSER_LEASE_INACTIVE/);
  const result = await lease.close();
  assert.deepEqual(result, { processStatus: 'VERIFIED', profileStatus: 'VERIFIED', endpointStatus: 'VERIFIED', overallStatus: 'VERIFIED' });
  assert.equal(f.calls.killed, 0);
  assert.equal(f.calls.removedProfiles.length, 1);
});
