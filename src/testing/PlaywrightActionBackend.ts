import type { Frame, Page } from 'playwright';
import { isDeepStrictEqual } from 'node:util';
import { boundedTimeoutMs, isMutatingOperation, validateTestAuthorization, type ActionBackend, type ActionOutcome, type ActionStep, type TestTargetAuthorization } from './ActionContract.js';

function requiredSelector(step: ActionStep): string {
  if (!step.selector?.trim()) throw new Error('ACTION_FAILED');
  return step.selector;
}

export class PlaywrightActionBackend implements ActionBackend {
  readonly backend = 'PLAYWRIGHT' as const;

  constructor(readonly targetId: string, private readonly page: Page | Frame) {
    if (!targetId.trim()) throw new Error('targetId must be non-empty');
  }

  async execute(step: ActionStep, authorization?: TestTargetAuthorization): Promise<ActionOutcome> {
    try {
      if (isMutatingOperation(step.operation)) validateTestAuthorization(this.backend, this.targetId, authorization);
      const timeout = boundedTimeoutMs(step.timeoutMs);
      const locator = step.selector ? this.page.locator(`css=${step.selector}`) : undefined;
      const needLocator = () => { if (!locator) throw new Error('ACTION_FAILED'); return locator; };
      let value: unknown;
      switch (step.operation) {
        case 'click': await needLocator().click({ timeout }); break;
        case 'fill': await needLocator().fill(step.value ?? '', { timeout }); break;
        case 'type': await needLocator().type(step.value ?? '', { timeout }); break;
        case 'clear': await needLocator().fill('', { timeout }); break;
        case 'press': await needLocator().press(step.key ?? '', { timeout }); break;
        case 'scroll': await needLocator().scrollIntoViewIfNeeded({ timeout }); await needLocator().evaluate((element, delta: { x: number; y: number }) => element.scrollBy(delta.x, delta.y), { x: step.deltaX ?? 0, y: step.deltaY ?? 0 }); break;
        case 'scrollIntoView': await needLocator().scrollIntoViewIfNeeded({ timeout }); break;
        case 'hover': await needLocator().hover({ timeout }); break;
        case 'focus': await needLocator().focus({ timeout }); break;
        case 'check': await needLocator().check({ timeout }); break;
        case 'uncheck': await needLocator().uncheck({ timeout }); break;
        case 'select': await needLocator().selectOption(step.value ?? '', { timeout }); value = step.value ?? ''; break;
        case 'readText': value = await needLocator().innerText({ timeout }); break;
        case 'readValue': value = await needLocator().inputValue({ timeout }); break;
        case 'readState': value = await needLocator().evaluate((element) => {
          const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
          return {
            disabled: 'disabled' in element ? Boolean((element as HTMLInputElement).disabled) : false,
            checked: 'checked' in element ? Boolean((element as HTMLInputElement).checked) : false,
            selected: 'selected' in element ? Boolean((element as HTMLOptionElement).selected) : false,
            visible: Boolean(rect.width || rect.height) && style.visibility !== 'hidden' && style.display !== 'none',
            scrollTop: element.scrollTop,
            tagName: element.tagName.toLowerCase()
          };
        }); break;
        case 'exists': value = (await needLocator().count()) > 0; break;
        case 'visible': value = await needLocator().isVisible({ timeout }); break;
        case 'waitFor': await needLocator().waitFor({ state: 'visible', timeout }); value = true; break;
        case 'ready': await this.page.waitForLoadState('domcontentloaded', { timeout }); value = await this.page.evaluate(() => document.readyState); break;
      }
      return { stepId: step.stepId, operation: step.operation, backend: this.backend, ok: true, ...(!isMutatingOperation(step.operation) && value !== undefined ? { value } : {}) };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const errorCode = message === 'AUTHORIZATION_REQUIRED' ? 'AUTHORIZATION_REQUIRED'
        : message === 'TARGET_MISMATCH' ? 'TARGET_MISMATCH'
          : message === 'TIMEOUT' || /Timeout/i.test(message) ? 'TIMEOUT' : 'ACTION_FAILED';
      return { stepId: step.stepId, operation: step.operation, backend: this.backend, ok: false, errorCode };
    }
  }

  async assert(step: ActionStep, predicate: 'truthy' | 'equals', expected?: unknown, authorization?: TestTargetAuthorization): Promise<ActionOutcome> {
    const result = await this.execute(step, authorization);
    const ok = result.ok && (predicate === 'truthy' ? Boolean(result.value) : isDeepStrictEqual(result.value, expected));
    return { ...result, ok };
  }
}
