export interface CDPAdapter {
  connect(endpoint: string): Promise<void>;
  startReadOnlyObservation(): Promise<void>;
  disconnect(): Promise<void>;
}
