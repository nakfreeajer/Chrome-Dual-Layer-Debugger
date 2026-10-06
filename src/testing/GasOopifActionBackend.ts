import type { GasAdapter } from '../gas/GasAdapter.js';
import { isDeepStrictEqual } from 'node:util';
import { boundedTimeoutMs, isMutatingOperation, validateTestAuthorization, type ActionBackend, type ActionOutcome, type ActionStep, type TestTargetAuthorization } from './ActionContract.js';

interface CdpResult { result?: { value?: unknown }; exceptionDetails?: unknown; }

function asRecord(value: unknown): CdpResult {
  return typeof value === 'object' && value !== null ? value as CdpResult : {};
}

function jsArg(value: unknown): string { return JSON.stringify(value); }

/** Raw-CDP backend scoped to one dependency-owned target/session/default execution context. */
export class GasOopifActionBackend implements ActionBackend {
  readonly backend = 'GAS_OOPIF' as const;

  constructor(
    readonly targetId: string,
    private readonly sessionId: string,
    private readonly executionContextId: number,
    private readonly gas: Pick<GasAdapter, 'sendScopedCommand'>
  ) {
    if (!targetId.trim() || !sessionId.trim() || !Number.isSafeInteger(executionContextId) || executionContextId < 1) {
      throw new Error('GAS/OOPIF backend requires exact target, session and execution-context identities');
    }
  }

  private async evaluate<T>(body: string, authorization?: TestTargetAuthorization): Promise<T> {
    if (!authorization) throw new Error('AUTHORIZATION_REQUIRED');
    validateTestAuthorization(this.backend, this.targetId, authorization);
    const result = asRecord(await this.gas.sendScopedCommand({
      targetId: this.targetId,
      sessionId: this.sessionId,
      method: 'Runtime.evaluate',
      executionContextId: this.executionContextId,
      params: { contextId: this.executionContextId, expression: body, returnByValue: true, awaitPromise: true },
      timeoutMs: 1000,
      testAuthorization: { mode: 'TEST', targetId: authorization.targetId, fixtureId: authorization.fixtureId }
    }));
    if (result.exceptionDetails) throw new Error('ACTION_FAILED');
    return result.result?.value as T;
  }

  private async input(method: string, params: Record<string, unknown>, authorization: TestTargetAuthorization): Promise<void> {
    await this.gas.sendScopedCommand({
      targetId: this.targetId, sessionId: this.sessionId, method, params,
      timeoutMs: 1000,
      testAuthorization: { mode: 'TEST', targetId: authorization.targetId, fixtureId: authorization.fixtureId }
    });
  }

  async execute(step: ActionStep, authorization?: TestTargetAuthorization): Promise<ActionOutcome> {
    try {
      if (isMutatingOperation(step.operation)) {
        if (!authorization) throw new Error('AUTHORIZATION_REQUIRED');
        validateTestAuthorization(this.backend, this.targetId, authorization);
      }
      const selector = jsArg(step.selector ?? '');
      const value = jsArg(step.value ?? '');
      const operation = step.operation;
      let result: unknown;
      const evalAuth = authorization;
      const query = `(() => { const e = document.querySelector(${selector}); return e || null; })()`;
      switch (operation) {
        case 'click': {
          const point = await this.evaluate<{ x: number; y: number } | null>(`(() => { const e=${query}; if(!e) throw Error(); e.scrollIntoView({block:'center',inline:'center'}); const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`, evalAuth);
          if (!point) throw new Error('ACTION_FAILED');
          await this.input('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }, authorization!);
          await this.input('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }, authorization!);
          break;
        }
        case 'fill': case 'clear': {
          const text = operation === 'clear' ? '' : (step.value ?? '');
          result = await this.evaluate<boolean>(`(() => { const e=${query}; if(!e) throw Error(); e.focus(); const p=e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const d=Object.getOwnPropertyDescriptor(p,'value'); if(!d?.set) throw Error(); d.set.call(e,${jsArg(text)}); e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:null})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`, evalAuth);
          break;
        }
        case 'type': {
          await this.evaluate<boolean>(`(() => { const e=${query}; if(!e) throw Error(); e.focus(); return true; })()`, evalAuth);
          await this.input('Input.insertText', { text: step.value ?? '' }, authorization!);
          break;
        }
        case 'press': {
          const key = step.key ?? '';
          await this.evaluate<boolean>(`(() => { const e=${query}; if(!e) throw Error(); e.focus(); return true; })()`, evalAuth);
          await this.input('Input.dispatchKeyEvent', { type: 'keyDown', key }, authorization!);
          await this.input('Input.dispatchKeyEvent', { type: 'keyUp', key }, authorization!);
          break;
        }
        case 'scroll': {
          const amountX = step.deltaX ?? 0, amountY = step.deltaY ?? 0;
          result = await this.evaluate<boolean>(`(() => { const e=${query}; if(!e) throw Error(); e.scrollIntoView({block:'center',inline:'center'}); e.scrollBy(${amountX},${amountY}); return true; })()`, evalAuth);
          break;
        }
        case 'scrollIntoView': result = await this.evaluate<boolean>(`(() => { const e=${query}; if(!e) throw Error(); e.scrollIntoView({block:'center',inline:'center'}); return true; })()`, evalAuth); break;
        case 'hover': case 'focus': {
          const point = await this.evaluate<{ x: number; y: number } | null>(`(() => { const e=${query}; if(!e) throw Error(); ${operation === 'focus' ? 'e.focus();' : ''} const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`, evalAuth);
          if (!point) throw new Error('ACTION_FAILED');
          if (operation === 'hover') await this.input('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y }, authorization!);
          break;
        }
        case 'check': case 'uncheck': {
          const checked = operation === 'check';
          const state = await this.evaluate<{ checked: boolean; x: number; y: number } | null>(`(() => { const e=${query}; if(!e || !('checked' in e)) throw Error(); e.scrollIntoView({block:'center',inline:'center'}); const r=e.getBoundingClientRect(); return {checked:!!e.checked,x:r.left+r.width/2,y:r.top+r.height/2}; })()`, evalAuth);
          if (!state) throw new Error('ACTION_FAILED');
          if (state.checked !== checked) {
            await this.input('Input.dispatchMouseEvent', { type: 'mousePressed', x: state.x, y: state.y, button: 'left', clickCount: 1 }, authorization!);
            await this.input('Input.dispatchMouseEvent', { type: 'mouseReleased', x: state.x, y: state.y, button: 'left', clickCount: 1 }, authorization!);
          }
          break;
        }
        case 'select': result = await this.evaluate<string>(`(() => { const e=${query}; if(!(e instanceof HTMLSelectElement)) throw Error(); e.value=${value}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return e.value; })()`, evalAuth); break;
        case 'readText': result = await this.evaluate<string>(`(() => { const e=${query}; if(!e) throw Error(); return e.innerText ?? e.textContent ?? ''; })()`, evalAuth); break;
        case 'readValue': result = await this.evaluate<string>(`(() => { const e=${query}; if(!e) throw Error(); return 'value' in e ? String(e.value) : ''; })()`, evalAuth); break;
        case 'readState': result = await this.evaluate(`(() => { const e=${query}; if(!e) throw Error(); const r=e.getBoundingClientRect(),s=getComputedStyle(e); return {disabled:'disabled' in e ? !!e.disabled : false,checked:'checked' in e ? !!e.checked : false,selected:'selected' in e ? !!e.selected : false,visible:!!(r.width||r.height)&&s.visibility!=='hidden'&&s.display!=='none',scrollTop:e.scrollTop,tagName:e.tagName.toLowerCase()}; })()`, evalAuth); break;
        case 'exists': result = await this.evaluate<boolean>(`!!${query}`, evalAuth); break;
        case 'visible': result = await this.evaluate<boolean>(`(() => { const e=${query}; if(!e) return false; const r=e.getBoundingClientRect(),s=getComputedStyle(e); return !!(r.width||r.height)&&s.visibility!=='hidden'&&s.display!=='none'; })()`, evalAuth); break;
        case 'ready': {
          const deadline = Date.now() + boundedTimeoutMs(step.timeoutMs);
          do {
            result = await this.evaluate<string>('document.readyState', evalAuth);
            if (result === 'interactive' || result === 'complete') break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          } while (Date.now() < deadline);
          if (result !== 'interactive' && result !== 'complete') throw new Error('TIMEOUT');
          break;
        }
        case 'waitFor': {
          const deadline = Date.now() + boundedTimeoutMs(step.timeoutMs);
          do {
            result = await this.evaluate<boolean>(`(() => { const e=${query}; if(!e) return false; const r=e.getBoundingClientRect(),s=getComputedStyle(e); return !!(r.width||r.height)&&s.visibility!=='hidden'&&s.display!=='none'; })()`, evalAuth);
            if (result) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          } while (Date.now() < deadline);
          if (!result) throw new Error('TIMEOUT');
          break;
        }
      }
      return { stepId: step.stepId, operation, backend: this.backend, ok: true, ...(!isMutatingOperation(operation) && result !== undefined ? { value: result } : {}) };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const errorCode = message === 'AUTHORIZATION_REQUIRED' ? 'AUTHORIZATION_REQUIRED'
        : message === 'TARGET_MISMATCH' ? 'TARGET_MISMATCH'
          : message === 'TIMEOUT' ? 'TIMEOUT' : 'ACTION_FAILED';
      return { stepId: step.stepId, operation: step.operation, backend: this.backend, ok: false, errorCode };
    }
  }

  async assert(step: ActionStep, predicate: 'truthy' | 'equals', expected?: unknown, authorization?: TestTargetAuthorization): Promise<ActionOutcome> {
    const result = await this.execute(step, authorization);
    return { ...result, ok: result.ok && (predicate === 'truthy' ? Boolean(result.value) : isDeepStrictEqual(result.value, expected)) };
  }
}
