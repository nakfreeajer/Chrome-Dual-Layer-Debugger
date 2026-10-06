import type { ActionOperation, TestingBackendId } from './ActionContract.js';

export type CapabilityStatus = 'PASS' | 'GAP' | 'BACKEND_SPECIFIC' | 'UNQUALIFIED';
export interface CapabilityRow {
  operation: ActionOperation | 'doubleClick' | 'rightClick' | 'dragDrop' | 'fileInput' | 'screenshot';
  playwright: CapabilityStatus;
  gasOopif: CapabilityStatus;
  evidence: string;
}

const implementedOperations: ActionOperation[] = [
  'click', 'fill', 'type', 'clear', 'press', 'scroll', 'scrollIntoView', 'hover', 'focus',
  'check', 'uncheck', 'select', 'readText', 'readValue', 'readState', 'exists', 'visible', 'waitFor', 'ready'
];

/** PASS is reserved for deterministic dual-backend conformance evidence. */
export const CAPABILITY_MATRIX: readonly CapabilityRow[] = Object.freeze([
  ...implementedOperations.map((operation) => ({
    operation,
    playwright: 'PASS' as const,
    gasOopif: 'PASS' as const,
    evidence: 'TEST.1A live Brave 9444 OOPIF proof: same 31-step scenario passed through both backends with matching normalized outcomes and fixture state; see .agent-work/artifacts/TEST.1A-live-parity.json.'
  })),
  { operation: 'doubleClick', playwright: 'GAP', gasOopif: 'GAP', evidence: 'Not included in the common operation contract.' },
  { operation: 'rightClick', playwright: 'GAP', gasOopif: 'GAP', evidence: 'Not included in the common operation contract.' },
  { operation: 'dragDrop', playwright: 'GAP', gasOopif: 'GAP', evidence: 'Deterministic common semantics not yet qualified.' },
  { operation: 'fileInput', playwright: 'GAP', gasOopif: 'GAP', evidence: 'File-system interaction is outside the first conformance slice.' },
  { operation: 'screenshot', playwright: 'BACKEND_SPECIFIC', gasOopif: 'GAP', evidence: 'No common normalized screenshot contract.' }
]);

export function capabilityStatus(operation: ActionOperation, backend: TestingBackendId): CapabilityStatus {
  const row = CAPABILITY_MATRIX.find((candidate) => candidate.operation === operation);
  if (!row) return 'GAP';
  return backend === 'PLAYWRIGHT' ? row.playwright : row.gasOopif;
}
