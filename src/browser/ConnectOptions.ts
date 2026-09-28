import type { ConnectOverCDPOptions } from 'playwright';

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
