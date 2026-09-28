export type DebugLayerMode = 'BROWSER_ONLY' | 'BROWSER_PLUS_GAS';

export function detectLayer(url: string): DebugLayerMode {
  return url.startsWith('https://script.google.com/macros/')
    ? 'BROWSER_PLUS_GAS'
    : 'BROWSER_ONLY';
}
