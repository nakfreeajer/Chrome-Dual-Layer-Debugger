import type { ConnectOverCDPOptions } from 'playwright';

/** Reject non-loopback or ambiguous TEST endpoints before any discovery/network operation. */
export function validateTestCdpEndpoint(endpoint: string, allowWebSocket = false): string {
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new Error('TEST_CDP_ENDPOINT_INVALID'); }
  const allowedProtocols = allowWebSocket ? ['http:', 'https:', 'ws:', 'wss:'] : ['http:', 'https:'];
  const websocketPathAllowed = allowWebSocket && (parsed.protocol === 'ws:' || parsed.protocol === 'wss:');
  if (!allowedProtocols.includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash
    || (parsed.pathname !== '/' && !websocketPathAllowed)) {
    throw new Error('TEST_CDP_ENDPOINT_INVALID');
  }
  // Match the raw authority too: URL parsing normalizes several unusual spellings.
  // Requiring canonical loopback IP literals avoids DNS-dependent `localhost` aliases.
  const authority = /^[A-Za-z][A-Za-z\d+.-]*:\/\/([^/?#]*)/.exec(endpoint)?.[1];
  const match = authority && /^(127\.0\.0\.1|\[::1\])(?::([1-9]\d{0,4}))?$/.exec(authority);
  if (!match) throw new Error('TEST_CDP_ENDPOINT_NOT_LOOPBACK');
  if (match[2] !== undefined) {
    const port = Number(match[2]);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || String(port) !== match[2]) {
      throw new Error('TEST_CDP_ENDPOINT_INVALID');
    }
  }
  return endpoint;
}

export function connectOverCDPOptions(endpoint: string): ConnectOverCDPOptions {
  let isLocal = false;
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    // An unparseable endpoint is never assumed to be local.
  }
  return { noDefaults: true, isLocal };
}
