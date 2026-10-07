import { createHash } from 'node:crypto';
import type { Frame, Page } from 'playwright';

export const FAILURE_DIAGNOSTIC_DEADLINE_MS = 5000;
export const FAILURE_SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;

export function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  } catch { return false; }
}

export interface FailureDiagnosticResult {
  dom: Record<string, unknown>;
  runtime: Record<string, unknown>;
  screenshot: { status: 'NOT_REQUESTED' | 'CAPTURED' | 'TOO_LARGE' | 'ERROR' | 'TIMEOUT' | 'OMITTED_TARGET_ENVELOPE'; byteLength?: number; sha256?: string; bytes?: Buffer };
}

function originSummary(value: string, expected: string): Record<string, unknown> {
  try {
    const url = new URL(value), origin = url.origin;
    return { protocol: url.protocol, loopback: isLoopbackHttpUrl(origin), sha256: createHash('sha256').update(origin).digest('hex'), equalsAuthorized: origin === expected };
  } catch { return { protocol: 'invalid', loopback: false, equalsAuthorized: false }; }
}

function safePageMetadata(page: Page, scope: Page | Frame, authorizedPageOrigin: string, authorizedScopeOrigin: string): Record<string, unknown> {
  const safeRead = <T>(read: () => T, fallback: T): T => { try { return read(); } catch { return fallback; } };
  const pageClosed = safeRead(() => page.isClosed(), true);
  const scopeKind = scope === page ? 'PAGE' : 'FRAME';
  const frameAttached = scope === page || safeRead(() => page.frames().includes(scope as Frame), false);
  const pageOrigin = originSummary(safeRead(() => page.url(), ''), authorizedPageOrigin);
  return {
    status: 'OMITTED_TARGET_ENVELOPE', pageClosed, frameAttached, scopeKind,
    pageOrigin, ...(scope === page ? {} : { frameOrigin: originSummary(safeRead(() => (scope as Frame).url(), ''), authorizedScopeOrigin) }),
    envelopeSafe: false, targetContentEvaluation: 'NOT_RUN'
  };
}

export async function captureFailureDiagnostics(options: {
  page: Page;
  scope: Page | Frame;
  selector?: string;
  authorizedPageOrigin: string;
  authorizedScopeOrigin: string;
  syntheticDetails: boolean;
  assertTargetEnvelope: () => Promise<void>;
  /** @internal Test-only deadline override; callers cannot extend the production ceiling. */
  deadlineMs?: number;
}): Promise<FailureDiagnosticResult> {
  const deadlineMs = options.deadlineMs ?? FAILURE_DIAGNOSTIC_DEADLINE_MS;
  if (!Number.isInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > FAILURE_DIAGNOSTIC_DEADLINE_MS) {
    throw new RangeError(`Diagnostic deadline must be between 1 and ${FAILURE_DIAGNOSTIC_DEADLINE_MS} ms`);
  }
  let timedOut = false;
  const task = async (): Promise<FailureDiagnosticResult> => {
    const { page, scope, selector, authorizedPageOrigin, authorizedScopeOrigin, syntheticDetails } = options;
    let dom: Record<string, unknown> = { status: 'NOT_REQUESTED' };
    const omitted = (currentDom: Record<string, unknown>, currentRuntime?: Record<string, unknown>): FailureDiagnosticResult => ({
      dom: currentDom,
      runtime: currentRuntime ?? safePageMetadata(page, scope, authorizedPageOrigin, authorizedScopeOrigin),
      screenshot: { status: syntheticDetails ? 'OMITTED_TARGET_ENVELOPE' : 'NOT_REQUESTED' }
    });
    const envelopeIsSafe = async (): Promise<boolean> => {
      try { await options.assertTargetEnvelope(); return !timedOut; }
      catch { return false; }
    };
    if (selector) {
      if (!await envelopeIsSafe()) {
        if (timedOut) return { dom: { status: 'TIMEOUT' }, runtime: { status: 'TIMEOUT' }, screenshot: { status: syntheticDetails ? 'TIMEOUT' : 'NOT_REQUESTED' } };
        return omitted({ status: 'OMITTED_TARGET_ENVELOPE' });
      }
      try {
        const locator = scope.locator(`css=${selector}`).first();
        const facts = await locator.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const input = element as HTMLInputElement;
          const option = element as HTMLOptionElement;
          return {
            exists: true, tagName: element.tagName.toLowerCase(), visible: Boolean(rect.width || rect.height) && style.visibility !== 'hidden' && style.display !== 'none',
            disabled: 'disabled' in element ? Boolean(input.disabled) : false,
            checked: 'checked' in element ? Boolean(input.checked) : false,
            selected: 'selected' in element ? Boolean(option.selected) : false,
            textLength: (element.textContent ?? '').length,
            valueLength: typeof input.value === 'string' ? input.value.length : 0,
            boundingBox: { present: Boolean(rect.width || rect.height), width: Number.isFinite(rect.width) ? rect.width : 0, height: Number.isFinite(rect.height) ? rect.height : 0 }
          };
        });
        dom = { status: 'CAPTURED', ...facts, selectorSha256: createHash('sha256').update(selector).digest('hex'), ...(syntheticDetails && selector.length <= 4096 ? { selector } : {}) };
      } catch { dom = { status: 'ERROR' }; }
    }
    if (timedOut) return { dom: { status: 'TIMEOUT' }, runtime: { status: 'TIMEOUT' }, screenshot: { status: syntheticDetails ? 'TIMEOUT' : 'NOT_REQUESTED' } };
    if (!await envelopeIsSafe()) {
      if (timedOut) return { dom: { status: 'TIMEOUT' }, runtime: { status: 'TIMEOUT' }, screenshot: { status: syntheticDetails ? 'TIMEOUT' : 'NOT_REQUESTED' } };
      return omitted(dom);
    }
    let runtime: Record<string, unknown>;
    try {
      runtime = {
        status: 'CAPTURED', readyState: scope === page ? await page.evaluate(() => document.readyState) : await (scope as Frame).evaluate(() => document.readyState), pageClosed: page.isClosed(),
        frameAttached: scope === page || page.frames().includes(scope as Frame), scopeKind: scope === page ? 'PAGE' : 'FRAME',
        pageOrigin: originSummary(page.url(), authorizedPageOrigin),
        ...(scope === page ? {} : { frameOrigin: originSummary((scope as Frame).url(), authorizedScopeOrigin) })
      };
    } catch { runtime = { status: 'ERROR', pageClosed: page.isClosed(), scopeKind: scope === page ? 'PAGE' : 'FRAME' }; }
    if (timedOut) return { dom, runtime: { status: 'TIMEOUT' }, screenshot: { status: syntheticDetails ? 'TIMEOUT' : 'NOT_REQUESTED' } };
    let screenshot: FailureDiagnosticResult['screenshot'] = { status: 'NOT_REQUESTED' };
    if (syntheticDetails) {
      if (!await envelopeIsSafe()) {
        if (timedOut) return { dom: { status: 'TIMEOUT' }, runtime: { status: 'TIMEOUT' }, screenshot: { status: 'TIMEOUT' } };
        return omitted(dom, runtime);
      }
      try {
        const bytes = await page.screenshot({ type: 'png', timeout: 3000 });
        if (bytes.length > FAILURE_SCREENSHOT_MAX_BYTES) screenshot = { status: 'TOO_LARGE' };
        else screenshot = { status: 'CAPTURED', byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), bytes };
      } catch { screenshot = { status: 'ERROR' }; }
    }
    return { dom, runtime, screenshot };
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task(), new Promise<FailureDiagnosticResult>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve({ dom: { status: 'TIMEOUT' }, runtime: { status: 'TIMEOUT' }, screenshot: { status: options.syntheticDetails ? 'TIMEOUT' : 'NOT_REQUESTED' } });
      }, deadlineMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
