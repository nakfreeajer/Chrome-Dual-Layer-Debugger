import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fixtureRuntimeIdentitySha256, type FixtureTargetAttestation, type SyntheticFixtureDriver, type SyntheticFixtureLease,
  type SyntheticFixtureRequest, type FixtureRuntimeTargetIdentity } from './FixtureLifecycle.js';

const HOST = '127.0.0.1';
const BASELINE = Object.freeze({ schemaVersion: 1, marker: 'CDLD_SYNTHETIC_BASELINE_V1' });
const DRIVER_ID = 'local-synthetic-page-driver-v1';
export const LOCAL_SYNTHETIC_FIXTURE_ID = 'TEST1E-LOCAL-FIXTURE-LIFECYCLE-PASS';
const LEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function serveFixture(request: IncomingMessage, response: ServerResponse, readState: () => unknown): void {
  if (request.method !== 'GET') {
    response.writeHead(405, { allow: 'GET' });
    response.end();
    return;
  }
  const path = new URL(request.url ?? '/', `http://${HOST}`).pathname;
  if (path === '/fixture') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end('<!doctype html><html><head><meta charset="utf-8"><title>Synthetic Fixture</title></head><body><p id="fixture-status">Synthetic fixture ready</p></body></html>');
    return;
  }
  if (path === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end('CDLD_LOCAL_FIXTURE_OK');
    return;
  }
  if (path === '/state') {
    json(response, 200, readState());
    return;
  }
  response.writeHead(404, { 'cache-control': 'no-store' });
  response.end();
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onListening = () => { server.off('error', onError); resolve(); };
    const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
    server.once('listening', onListening);
    server.once('error', onError);
    server.listen(port, HOST);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function isLoopbackPortFree(port: number): Promise<boolean> {
  const probe = createServer();
  try {
    await listen(probe, port);
    await close(probe);
    return true;
  } catch (error) {
    if (probe.listening) {
      try { await close(probe); } catch { return false; }
    }
    if (typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code === 'EADDRINUSE') return false;
    return false;
  }
}

async function getText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error('LOCAL_FIXTURE_HEALTH_CHECK_FAILED');
  return response.text();
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error('LOCAL_FIXTURE_STATE_CHECK_FAILED');
  return response.json() as Promise<unknown>;
}

function sameLease(left: SyntheticFixtureLease | undefined, right: SyntheticFixtureLease): boolean {
  return !!left && left.schemaVersion === right.schemaVersion && left.kind === right.kind && left.ownership === right.ownership
    && left.fixtureId === right.fixtureId && left.driverId === right.driverId && left.leaseId === right.leaseId
    && left.target.pageUrl === right.target.pageUrl && left.target.scope.kind === right.target.scope.kind
    && left.ownedResourceIds.length === right.ownedResourceIds.length
    && left.ownedResourceIds.every((id, index) => id === right.ownedResourceIds[index]);
}

/** One-lease, loopback-only synthetic HTTP fixture. It never touches a resource it did not create. */
export class LocalSyntheticFixtureDriver implements SyntheticFixtureDriver {
  readonly driverId = DRIVER_ID;
  readonly pageUrl: string;
  private server?: Server;
  private lease?: SyntheticFixtureLease;
  private lastLease?: SyntheticFixtureLease;
  private readonly ownedData = new Map<string, typeof BASELINE>();

  constructor(readonly port: number) {
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('LOCAL_FIXTURE_PORT_INVALID');
    this.pageUrl = `http://${HOST}:${port}/fixture`;
  }

  async setup(request: SyntheticFixtureRequest): Promise<SyntheticFixtureLease> {
    if (this.lease || this.server?.listening) throw new Error('LOCAL_FIXTURE_ALREADY_ACTIVE');
    if (request.fixtureId !== LOCAL_SYNTHETIC_FIXTURE_ID || request.target.scope.kind !== 'PAGE' || request.target.pageUrl !== this.pageUrl) {
      throw new Error('LOCAL_FIXTURE_TARGET_MISMATCH');
    }
    const leaseId = randomUUID();
    const serverResourceId = `fixture-server-${leaseId}`;
    const dataResourceId = `fixture-data-${leaseId}`;
    const lease: SyntheticFixtureLease = {
      schemaVersion: 1, kind: 'CDLD_SYNTHETIC_FIXTURE_LEASE', ownership: 'CDLD_SYNTHETIC',
      fixtureId: request.fixtureId, driverId: this.driverId, leaseId, target: request.target,
      ownedResourceIds: [serverResourceId, dataResourceId]
    };
    const server = createServer((incoming, outgoing) => serveFixture(incoming, outgoing, () => this.ownedData.get(dataResourceId)));
    this.server = server;
    this.lease = lease;
    this.ownedData.set(dataResourceId, BASELINE);
    try {
      await listen(server, this.port);
      const address = server.address() as AddressInfo | null;
      if (!server.listening || !address || address.address !== HOST || address.port !== this.port
        || await getText(`http://${HOST}:${this.port}/health`) !== 'CDLD_LOCAL_FIXTURE_OK') {
        throw new Error('LOCAL_FIXTURE_OWNERSHIP_NOT_VERIFIED');
      }
      return lease;
    } catch {
      if (server.listening) {
        try { await close(server); } catch { /* Only this driver-created server is closed. */ }
      }
      this.ownedData.delete(dataResourceId);
      this.server = undefined;
      this.lease = undefined;
      throw new Error('LOCAL_FIXTURE_SETUP_FAILED');
    }
  }

  async verifyOwnership(lease: SyntheticFixtureLease): Promise<boolean> {
    if (!sameLease(this.lease, lease) || !this.server?.listening || !lease.ownedResourceIds.every((id) =>
      id.startsWith(`fixture-server-${lease.leaseId}`) || id.startsWith(`fixture-data-${lease.leaseId}`))) return false;
    const address = this.server.address() as AddressInfo | null;
    if (!address || address.address !== HOST || address.port !== this.port) return false;
    try { return await getText(`http://${HOST}:${this.port}/health`) === 'CDLD_LOCAL_FIXTURE_OK'; }
    catch { return false; }
  }

  async reset(lease: SyntheticFixtureLease): Promise<void> {
    if (!await this.verifyOwnership(lease)) throw new Error('LOCAL_FIXTURE_OWNERSHIP_NOT_VERIFIED');
    this.ownedData.set(lease.ownedResourceIds[1], BASELINE);
  }

  async verifyReset(lease: SyntheticFixtureLease): Promise<boolean> {
    if (!await this.verifyOwnership(lease)) return false;
    try {
      const state = await getJson(`http://${HOST}:${this.port}/state`);
      return JSON.stringify(state) === JSON.stringify(BASELINE);
    } catch { return false; }
  }

  async attestTargetBinding(lease: SyntheticFixtureLease, actual: FixtureRuntimeTargetIdentity, challenge: string): Promise<FixtureTargetAttestation | null> {
    if (!await this.verifyOwnership(lease) || actual.backend !== 'PLAYWRIGHT' || actual.scopeKind !== 'PAGE'
      || !actual.contextId || !actual.pageId || !/^[0-9a-f-]{36}$/i.test(challenge)) return null;
    return {
      schemaVersion: 1, kind: 'CDLD_FIXTURE_TARGET_ATTESTATION', driverId: lease.driverId, leaseId: lease.leaseId,
      challenge, attestationId: randomUUID(), runtimeIdentitySha256: fixtureRuntimeIdentitySha256(actual)
    };
  }

  async teardown(lease: SyntheticFixtureLease): Promise<void> {
    if (!await this.verifyOwnership(lease) || !this.server) throw new Error('LOCAL_FIXTURE_OWNERSHIP_NOT_VERIFIED');
    const server = this.server;
    await close(server);
    this.ownedData.delete(lease.ownedResourceIds[1]);
    this.lastLease = lease;
    this.server = undefined;
    this.lease = undefined;
  }

  async verifyCleanup(lease: SyntheticFixtureLease): Promise<boolean> {
    if (!sameLease(this.lastLease, lease) || this.server?.listening || this.lease
      || lease.ownedResourceIds.some((id) => this.ownedData.has(id))) return false;
    return isLoopbackPortFree(this.port);
  }
}
