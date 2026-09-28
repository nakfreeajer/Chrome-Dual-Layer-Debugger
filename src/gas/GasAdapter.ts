export interface GasAdapter {
  connect(endpoint: string): Promise<void>;
  discoverRuntime(): Promise<void>;
  disconnect(): Promise<void>;
}

// Version 0.1 intentionally defines only the boundary.
// The implementation should wrap/reuse the existing gas-remote-debug public API.
