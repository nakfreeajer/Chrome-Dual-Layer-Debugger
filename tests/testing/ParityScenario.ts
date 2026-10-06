import type { ActionScenario, ActionStep } from '../../src/testing/ActionContract.js';

/** One semantic scenario is shared by local adapter tests and live qualification. */
const scenarioSteps: ActionStep[] = [
    { stepId: 'ready', operation: 'ready', timeoutMs: 5000 },
    { stepId: 'exists-visible', operation: 'exists', selector: '#visible' },
    { stepId: 'exists-missing', operation: 'exists', selector: '#does-not-exist' },
    { stepId: 'visible-yes', operation: 'visible', selector: '#visible' },
    { stepId: 'visible-no', operation: 'visible', selector: '#hidden' },
    { stepId: 'read-label', operation: 'readText', selector: '#label' },
    { stepId: 'click', operation: 'click', selector: '#clickButton' },
    { stepId: 'click-state', operation: 'readText', selector: '#clickCount' },
    { stepId: 'fill', operation: 'fill', selector: '#textInput', value: 'alpha' },
    { stepId: 'type', operation: 'type', selector: '#textInput', value: '-beta' },
    { stepId: 'typed-value', operation: 'readValue', selector: '#textInput' },
    { stepId: 'clear', operation: 'clear', selector: '#textInput' },
    { stepId: 'cleared-value', operation: 'readValue', selector: '#textInput' },
    { stepId: 'press', operation: 'press', selector: '#keyboardInput', key: 'Enter' },
    { stepId: 'key-state', operation: 'readText', selector: '#keyboardStatus' },
    { stepId: 'scroll', operation: 'scroll', selector: '#scrollBox', deltaY: 20 },
    { stepId: 'scroll-state', operation: 'readState', selector: '#scrollBox' },
    { stepId: 'scroll-into-view', operation: 'scrollIntoView', selector: '#scrollTarget' },
    { stepId: 'scroll-into-view-state', operation: 'readState', selector: '#scrollBox' },
    { stepId: 'hover', operation: 'hover', selector: '#hoverTarget' },
    { stepId: 'hover-state', operation: 'readText', selector: '#hoverStatus' },
    { stepId: 'focus', operation: 'focus', selector: '#focusInput' },
    { stepId: 'focus-state', operation: 'readText', selector: '#focusStatus' },
    { stepId: 'check', operation: 'check', selector: '#checkbox' },
    { stepId: 'checked-state', operation: 'readState', selector: '#checkbox' },
    { stepId: 'uncheck', operation: 'uncheck', selector: '#checkbox' },
    { stepId: 'unchecked-state', operation: 'readState', selector: '#checkbox' },
    { stepId: 'select', operation: 'select', selector: '#selectInput', value: 'b' },
    { stepId: 'selected-value', operation: 'readValue', selector: '#selectInput' },
    { stepId: 'disabled-state', operation: 'readState', selector: '#disabledInput' },
    { stepId: 'wait-visible', operation: 'waitFor', selector: '#visible', timeoutMs: 5000 }
];

export const TEST_1A_PARITY_SCENARIO: ActionScenario = Object.freeze({
  scenarioId: 'TEST1A-LOCAL-OOPIF-PARITY',
  steps: Object.freeze(scenarioSteps)
});

export const TEST_1A_EXPECTED_VALUES: Readonly<Record<string, unknown>> = Object.freeze({
  ready: 'complete',
  'exists-visible': true,
  'exists-missing': false,
  'visible-yes': true,
  'visible-no': false,
  'read-label': 'Synthetic parity label',
  'click-state': '1',
  'typed-value': 'alpha-beta',
  'cleared-value': '',
  'key-state': 'Enter',
  'hover-state': 'hovered',
  'focus-state': 'focused',
  'checked-state': { disabled: false, checked: true, selected: false, visible: true, scrollTop: 0, tagName: 'input' },
  'unchecked-state': { disabled: false, checked: false, selected: false, visible: true, scrollTop: 0, tagName: 'input' },
  'selected-value': 'b'
});
