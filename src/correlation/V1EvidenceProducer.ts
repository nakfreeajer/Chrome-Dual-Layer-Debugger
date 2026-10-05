import type { V1CompletionMarkerEvidence, V1RequestEvidence, V1ResponseEvidence } from './V1CorrelationRecognizer.js';

const REQUEST_TOKEN = /^V01H-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXECUTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKER_NAME = 'CDLD_CORRELATION_V1';
const ANTI_XSSI_PREFIX = ")]}'\n\n";
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

export interface AppsScriptRequestObservation {
  runId: string;
  requestId: string;
  url: string;
  method: string;
  resourceType: string;
  contentType?: string;
  postData?: string;
}

export interface AppsScriptResponseObservation {
  runId: string;
  requestId: string;
  body: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedVersion(value: unknown, present: boolean): number | undefined {
  if (!present) return undefined;
  return typeof value === 'number' ? value : -1;
}

function boundedTokens(value: unknown, present: boolean): string[] {
  if (!present) return [];
  const candidates = Array.isArray(value) ? value : [value];
  return [...new Set(candidates.map((candidate) =>
    typeof candidate === 'string' && REQUEST_TOKEN.test(candidate) ? candidate : ''
  ))];
}

function parseRpcEnvelope(serializedRequest: string): { version?: number; tokens: string[] } | undefined {
  let tuple: unknown;
  try { tuple = JSON.parse(serializedRequest) as unknown; } catch { return undefined; }
  if (!Array.isArray(tuple) || typeof tuple[1] !== 'string') return undefined;
  let args: unknown;
  try { args = JSON.parse(tuple[1]) as unknown; } catch { return undefined; }
  if (!Array.isArray(args) || !isRecord(args[0])) return undefined;
  const envelope = args[0];
  const hasVersion = Object.hasOwn(envelope, 'contractVersion');
  const hasToken = Object.hasOwn(envelope, 'correlationToken');
  if (!hasVersion && !hasToken) return undefined;

  // These fields classify the declared envelope only. Their values are never retained.
  const declaredShapeValid = typeof envelope.functionName === 'string' && Array.isArray(envelope.args);
  const version = boundedVersion(envelope.contractVersion, hasVersion);
  const tokens = boundedTokens(envelope.correlationToken, hasToken);
  return {
    ...(declaredShapeValid ? (version === undefined ? {} : { version }) : { version: -1 }),
    tokens
  };
}

/** Extract only declared V1 identity candidates from the observed Apps Script form/RPC path. */
export function extractV1RequestEvidence(observation: AppsScriptRequestObservation): V1RequestEvidence | undefined {
  if (observation.method.toUpperCase() !== 'POST' || observation.resourceType !== 'XHR' || !observation.postData || !observation.contentType) return undefined;
  if (Buffer.byteLength(observation.postData, 'utf8') > MAX_REQUEST_BODY_BYTES) return undefined;
  try {
    const requestUrl = new URL(observation.url);
    if (requestUrl.protocol !== 'https:' || requestUrl.hostname !== 'script.google.com' || !requestUrl.pathname.startsWith('/macros/')) return undefined;
  } catch { return undefined; }
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(observation.contentType)) return undefined;

  let fields: string[];
  try { fields = new URLSearchParams(observation.postData).getAll('request'); } catch { return undefined; }
  if (!fields.length) return undefined;
  const decoded = fields.map(parseRpcEnvelope).filter((item): item is { version?: number; tokens: string[] } => item !== undefined);
  if (!decoded.length) return undefined;

  const versions = decoded.flatMap((item) => item.version === undefined ? [] : [item.version]);
  const tokens = [...new Set(decoded.flatMap((item) => item.tokens))];
  const exactlyOneFieldAndEnvelope = fields.length === 1 && decoded.length === 1;
  const versionsAgree = versions.length <= 1;
  return {
    runId: observation.runId,
    requestId: observation.requestId,
    ...(versions.length ? { contractVersion: exactlyOneFieldAndEnvelope && versionsAgree ? versions[0] : -1 } : {}),
    correlationTokens: tokens
  };
}

/** Decode only the observed anti-XSSI/RPC result path and immediately reduce it to identity evidence. */
export function extractV1ResponseEvidence(observation: AppsScriptResponseObservation): V1ResponseEvidence | undefined {
  if (!observation.body.startsWith(ANTI_XSSI_PREFIX)) return undefined;
  let rpc: unknown;
  try { rpc = JSON.parse(observation.body.slice(ANTI_XSSI_PREFIX.length)) as unknown; } catch { return undefined; }
  if (!Array.isArray(rpc)) return undefined;
  const execTuples = rpc.filter((item) => Array.isArray(item) && item[0] === 'op.exec');
  if (execTuples.length !== 1) return undefined;
  const execTuple = execTuples[0] as unknown[];
  if (execTuple.length !== 2 || !Array.isArray(execTuple[1]) || execTuple[1].length !== 2 || execTuple[1][0] !== 0 || typeof execTuple[1][1] !== 'string') return undefined;
  let result: unknown;
  try { result = JSON.parse(execTuple[1][1]) as unknown; } catch { return undefined; }
  if (!isRecord(result)) return undefined;

  const tokens: string[] = [];
  const addToken = (value: unknown): void => {
    if (typeof value === 'string' && REQUEST_TOKEN.test(value)) tokens.push(value);
    else if (value !== undefined) tokens.push('');
  };
  addToken(result.correlationToken);
  const serverExecution = isRecord(result.serverExecution) ? result.serverExecution : undefined;
  if (serverExecution) addToken(serverExecution.correlationToken);
  const serverId = serverExecution?.id;
  const serverExecutionIds = serverId === undefined
    ? []
    : [typeof serverId === 'string' && EXECUTION_ID.test(serverId) ? serverId : ''];

  return {
    runId: observation.runId,
    requestId: observation.requestId,
    correlationTokens: [...new Set(tokens)],
    ...(serverExecutionIds.length ? { serverExecutionIds } : {})
  };
}

/** Parse the single declared Playwright console marker. Unrelated console text is never returned. */
export function extractV1CompletionMarker(text: string, runId: string): V1CompletionMarkerEvidence | undefined {
  const prefix = `${MARKER_NAME} `;
  if (!text.startsWith(prefix)) return undefined;
  let marker: unknown;
  try { marker = JSON.parse(text.slice(prefix.length)) as unknown; } catch { marker = undefined; }
  const record = isRecord(marker) ? marker : {};
  const versionPresent = Object.hasOwn(record, 'contractVersion');
  const token = typeof record.correlationToken === 'string' && REQUEST_TOKEN.test(record.correlationToken)
    ? record.correlationToken
    : '';
  const serverExecutionId = typeof record.serverExecutionId === 'string' && EXECUTION_ID.test(record.serverExecutionId)
    ? record.serverExecutionId
    : '';
  const outcome = record.outcome === 'success' || record.outcome === 'failure'
    ? record.outcome
    : record.outcome === undefined ? undefined : '__UNKNOWN_OUTCOME__';
  return {
    runId,
    markerName: MARKER_NAME,
    ...(versionPresent ? { contractVersion: boundedVersion(record.contractVersion, true) } : {}),
    correlationToken: token,
    serverExecutionId,
    ...(outcome === undefined ? {} : { outcome })
  };
}
