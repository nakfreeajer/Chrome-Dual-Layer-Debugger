import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const STARTUP_TIMEOUT_MS = 10_000;
const TERMINATE_GRACE_MS = 2_000;
const TERMINATE_FORCE_MS = 2_000;
const LOOPBACK_HOST = '127.0.0.1';
const PROFILE_PREFIX = 'cdld-owned-browser-';
const ownedBrowserLeaseBrand: unique symbol = Symbol('CDLD-owned-browser-lease');

export type OwnedResourceStatus = 'VERIFIED' | 'FAILED' | 'UNKNOWN';

export interface OwnedBrowserCleanupResult {
  readonly processStatus: OwnedResourceStatus;
  readonly profileStatus: OwnedResourceStatus;
  readonly endpointStatus: OwnedResourceStatus;
  readonly overallStatus: OwnedResourceStatus;
}

export interface OwnedBrowserLease {
  readonly [ownedBrowserLeaseBrand]: true;
  /** The endpoint is available only while the owned child process is live. */
  getEndpoint(): string;
  /** Native PID from the exact ChildProcess handle created by this launch. */
  getProcessId(): number;
  /** One-use teardown. Repeated calls return the same cleanup result. */
  close(): Promise<OwnedBrowserCleanupResult>;
}

interface ChildHandle {
  readonly pid?: number;
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

interface PortFileEvidence {
  readonly port: number;
  readonly browserWebSocketPath: string;
}

interface VersionEvidence {
  readonly Browser?: unknown;
  readonly webSocketDebuggerUrl?: unknown;
}

interface OwnedBrowserPlatform {
  resolveExecutable(): Promise<string>;
  createProfile(): Promise<string>;
  spawn(executable: string, args: readonly string[]): ChildHandle;
  readPortFile(profilePath: string): Promise<string>;
  fetchVersion(endpoint: string): Promise<VersionEvidence>;
  removeProfile(profilePath: string): Promise<void>;
  verifyPortReleased(port: number): Promise<boolean>;
  wait(milliseconds: number): Promise<void>;
}

interface LeaseState {
  process: ChildHandle;
  processId: number;
  readonly profilePath: string;
  endpoint: string;
  port: number;
  readonly platform: OwnedBrowserPlatform;
  exit?: { code: number | null; signal: NodeJS.Signals | null };
  launchFailure?: Error;
  closePromise?: Promise<OwnedBrowserCleanupResult>;
}

const leaseState = new WeakMap<object, LeaseState>();

class OwnedBrowserLeaseImpl implements OwnedBrowserLease {
  readonly [ownedBrowserLeaseBrand] = true as const;

  constructor(state: LeaseState) {
    leaseState.set(this, state);
    Object.freeze(this);
  }

  getEndpoint(): string {
    const state = getActiveState(this);
    return state.endpoint;
  }

  getProcessId(): number {
    const state = getActiveState(this);
    return state.processId;
  }

  close(): Promise<OwnedBrowserCleanupResult> {
    const state = leaseState.get(this);
    if (!state) return Promise.resolve(failedCleanup());
    if (!state.closePromise) state.closePromise = closeOwnedState(state);
    return state.closePromise;
  }
}

function getActiveState(lease: object): LeaseState {
  const state = leaseState.get(lease);
  if (!state || state.closePromise || state.exit || state.launchFailure) throw new Error('OWNED_BROWSER_LEASE_INACTIVE');
  return state;
}

function failedCleanup(): OwnedBrowserCleanupResult {
  return { processStatus: 'UNKNOWN', profileStatus: 'UNKNOWN', endpointStatus: 'UNKNOWN', overallStatus: 'FAILED' };
}

function combinedStatus(statuses: readonly OwnedResourceStatus[]): OwnedResourceStatus {
  if (statuses.includes('FAILED')) return 'FAILED';
  return statuses.every((status) => status === 'VERIFIED') ? 'VERIFIED' : 'UNKNOWN';
}

async function verifyProfileRemoved(profilePath: string): Promise<OwnedResourceStatus> {
  try {
    await access(profilePath);
    return 'FAILED';
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return 'VERIFIED';
    return 'UNKNOWN';
  }
}

function isSafePort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function parsePortFile(value: string): PortFileEvidence {
  const lines = value.trimEnd().split(/\r?\n/);
  if (lines.length !== 2 || !/^\d{1,5}$/.test(lines[0]) || !isSafePort(Number(lines[0]))
    || !/^\/devtools\/browser\/[A-Za-z0-9_-]+$/.test(lines[1])) {
    throw new Error('OWNED_BROWSER_PORT_FILE_INVALID');
  }
  return { port: Number(lines[0]), browserWebSocketPath: lines[1] };
}

function validateProfilePath(profilePath: string): void {
  const resolved = resolve(profilePath);
  if (dirname(resolved) !== resolve(tmpdir()) || !resolved.split(/[\\/]/).at(-1)?.startsWith(PROFILE_PREFIX)) {
    throw new Error('OWNED_BROWSER_PROFILE_PATH_INVALID');
  }
}

function parseWebSocketUrl(value: unknown, port: number, expectedPath: string): void {
  if (typeof value !== 'string') throw new Error('OWNED_BROWSER_ENDPOINT_MISMATCH');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('OWNED_BROWSER_ENDPOINT_MISMATCH'); }
  if (url.protocol !== 'ws:' || url.hostname !== LOOPBACK_HOST || Number(url.port) !== port
    || url.pathname !== expectedPath || url.search || url.hash || url.username || url.password) {
    throw new Error('OWNED_BROWSER_ENDPOINT_MISMATCH');
  }
}

function validateVersionEvidence(value: VersionEvidence, portFile: PortFileEvidence): void {
  if (typeof value.Browser !== 'string' || !/^(?:Chrome|Chromium|HeadlessChrome|Brave)\//.test(value.Browser)) {
    throw new Error('OWNED_BROWSER_IDENTITY_AMBIGUOUS');
  }
  parseWebSocketUrl(value.webSocketDebuggerUrl, portFile.port, portFile.browserWebSocketPath);
}

function childIsRunning(process: ChildHandle, state?: LeaseState): boolean {
  return !!process.pid && process.exitCode === null && process.signalCode === null && !state?.exit && !state?.launchFailure;
}

function waitForChildExit(state: LeaseState, timeoutMs: number): Promise<boolean> {
  if (state.exit || state.process.exitCode !== null || state.process.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveWait) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveWait(exited);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    state.process.once('exit', () => finish(true));
    state.process.once('close', () => finish(true));
  });
}

async function closeOwnedState(state: LeaseState): Promise<OwnedBrowserCleanupResult> {
  let processStatus: OwnedResourceStatus = 'UNKNOWN';
  let profileStatus: OwnedResourceStatus = 'UNKNOWN';
  let endpointStatus: OwnedResourceStatus = 'UNKNOWN';
  try {
    if (state.exit || state.process.exitCode !== null || state.process.signalCode !== null) {
      processStatus = 'VERIFIED';
    } else {
      state.process.kill('SIGTERM');
      let exited = await waitForChildExit(state, TERMINATE_GRACE_MS);
      if (!exited) {
        state.process.kill('SIGKILL');
        exited = await waitForChildExit(state, TERMINATE_FORCE_MS);
      }
      processStatus = exited ? 'VERIFIED' : 'FAILED';
    }
  } catch { processStatus = 'FAILED'; }

  if (processStatus === 'VERIFIED') {
    try {
      validateProfilePath(state.profilePath);
      await state.platform.removeProfile(state.profilePath);
      profileStatus = await verifyProfileRemoved(state.profilePath);
    } catch { profileStatus = 'FAILED'; }
    try { endpointStatus = await state.platform.verifyPortReleased(state.port) ? 'VERIFIED' : 'FAILED'; }
    catch { endpointStatus = 'UNKNOWN'; }
  }

  return { processStatus, profileStatus, endpointStatus,
    overallStatus: combinedStatus([processStatus, profileStatus, endpointStatus]) };
}

async function cleanupFailedLaunch(platform: OwnedBrowserPlatform, profilePath: string, process?: ChildHandle): Promise<boolean> {
  let processExited = !process || process.exitCode !== null || process.signalCode !== null;
  if (process && !processExited) {
    try {
      process.kill('SIGTERM');
      processExited = process.exitCode !== null || process.signalCode !== null;
      if (!processExited) {
        await new Promise<void>((resolveWait) => {
          let settled = false;
          const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolveWait(); };
          const timer = setTimeout(finish, TERMINATE_GRACE_MS);
          process.once('exit', finish);
          process.once('close', finish);
        });
        processExited = process.exitCode !== null || process.signalCode !== null;
      }
      if (!processExited) {
        process.kill('SIGKILL');
        processExited = process.exitCode !== null || process.signalCode !== null;
        if (!processExited) {
          await new Promise<void>((resolveWait) => {
            let settled = false;
            const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolveWait(); };
            const timer = setTimeout(finish, TERMINATE_FORCE_MS);
            process.once('exit', finish);
            process.once('close', finish);
          });
          processExited = process.exitCode !== null || process.signalCode !== null;
        }
      }
    } catch { /* Failed launch cleanup is best effort and is not reported as a lease. */ }
  }
  if (!processExited) return false;
  try {
    validateProfilePath(profilePath);
    await platform.removeProfile(profilePath);
    return await verifyProfileRemoved(profilePath) === 'VERIFIED';
  } catch { return false; }
}

async function waitForReady(state: LeaseState, startupTimeoutMs: number): Promise<void> {
  const deadline = Date.now() + startupTimeoutMs;
  let lastError: unknown;
  while (Date.now() <= deadline) {
    if (!childIsRunning(state.process, state)) throw new Error('OWNED_BROWSER_PROCESS_EXITED_DURING_STARTUP');
    try {
      const portFile = parsePortFile(await state.platform.readPortFile(state.profilePath));
      const endpoint = `http://${LOOPBACK_HOST}:${portFile.port}`;
      const evidence = await state.platform.fetchVersion(endpoint);
      if (!childIsRunning(state.process, state)) throw new Error('OWNED_BROWSER_PROCESS_EXITED_DURING_STARTUP');
      validateVersionEvidence(evidence, portFile);
      state.endpoint = endpoint;
      state.port = portFile.port;
      return;
    } catch (error) {
      if (error instanceof Error && error.message === 'OWNED_BROWSER_PROCESS_EXITED_DURING_STARTUP') throw error;
      lastError = error;
      await state.platform.wait(50);
    }
  }
  throw new Error(lastError instanceof Error ? 'OWNED_BROWSER_ENDPOINT_UNVERIFIED' : 'OWNED_BROWSER_STARTUP_TIMEOUT');
}

/**
 * Acquires a new Chromium-family process using a Playwright-resolved local binary.
 * There is deliberately no executable-path, endpoint, PID or profile parameter.
 */
export async function launchOwnedBrowser(): Promise<OwnedBrowserLease> {
  return launchOwnedBrowserWithPlatform(defaultPlatform(), STARTUP_TIMEOUT_MS);
}

/** Internal test seam. It is not re-exported from the package index or connected to CLI input. */
export async function launchOwnedBrowserWithPlatformForTests(platform: OwnedBrowserPlatform, startupTimeoutMs = 500): Promise<OwnedBrowserLease> {
  return launchOwnedBrowserWithPlatform(platform, startupTimeoutMs);
}

async function launchOwnedBrowserWithPlatform(platform: OwnedBrowserPlatform, startupTimeoutMs: number): Promise<OwnedBrowserLease> {
  let executable = '';
  let profilePath = '';
  let process: ChildHandle | undefined;
  try {
    executable = await platform.resolveExecutable();
    if (!isAbsolute(executable)) throw new Error('OWNED_BROWSER_EXECUTABLE_UNAVAILABLE');
    await access(executable).catch(() => { throw new Error('OWNED_BROWSER_EXECUTABLE_UNAVAILABLE'); });
    profilePath = await platform.createProfile();
    validateProfilePath(profilePath);
    const state: LeaseState = { process: undefined as unknown as ChildHandle, processId: 0, profilePath, endpoint: '', port: 0, platform };
    process = platform.spawn(executable, [
      `--user-data-dir=${profilePath}`,
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      'about:blank'
    ]);
    state.process = process;
    process.once('error', (error) => { state.launchFailure = error; });
    process.once('exit', (code, signal) => { state.exit = { code, signal }; });
    process.once('close', (code, signal) => { state.exit ??= { code, signal }; });
    if (!Number.isSafeInteger(process.pid) || (process.pid ?? 0) <= 0) throw new Error('OWNED_BROWSER_PROCESS_ID_UNAVAILABLE');
    state.processId = process.pid!;
    await waitForReady(state, startupTimeoutMs);
    if (!childIsRunning(process, state) || !isSafePort(state.port) || !state.endpoint) throw new Error('OWNED_BROWSER_ENDPOINT_UNVERIFIED');
    return new OwnedBrowserLeaseImpl(state);
  } catch (error) {
    if (profilePath) {
      const cleanupVerified = await cleanupFailedLaunch(platform, profilePath, process);
      if (!cleanupVerified) throw new Error('OWNED_BROWSER_LAUNCH_FAILED_CLEANUP_UNKNOWN', { cause: error });
    }
    throw error instanceof Error ? error : new Error('OWNED_BROWSER_LAUNCH_FAILED');
  }
}

function defaultPlatform(): OwnedBrowserPlatform {
  return {
    async resolveExecutable() { return chromium.executablePath(); },
    async createProfile() { return mkdtemp(join(tmpdir(), PROFILE_PREFIX)); },
    spawn(executable, args) {
      return nodeSpawn(executable, [...args], { shell: false, windowsHide: true, stdio: 'ignore', detached: false });
    },
    async readPortFile(profilePath) { return readFile(join(profilePath, 'DevToolsActivePort'), 'utf8'); },
    async fetchVersion(endpoint) {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(500) });
      if (!response.ok) throw new Error('OWNED_BROWSER_VERSION_UNAVAILABLE');
      return await response.json() as VersionEvidence;
    },
    async removeProfile(profilePath) { await rm(profilePath, { recursive: true, force: false }); },
    async verifyPortReleased(port) {
      if (!isSafePort(port)) return false;
      const server = createServer();
      try {
        await new Promise<void>((resolveListen, reject) => {
          server.once('error', reject);
          server.listen(port, LOOPBACK_HOST, () => resolveListen());
        });
        await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
        return true;
      } catch {
        if (server.listening) await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
        return false;
      }
    },
    async wait(milliseconds) { await new Promise((resolveWait) => setTimeout(resolveWait, milliseconds)); }
  };
}

/** Limited introspection for trusted composition code; forged objects never pass the WeakMap check. */
export function isActiveOwnedBrowserLease(value: unknown): value is OwnedBrowserLease {
  if (!value || typeof value !== 'object') return false;
  const state = leaseState.get(value);
  return !!state && childIsRunning(state.process, state);
}
