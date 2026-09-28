export interface PlaywrightAdapter {
  connect(endpoint: string): Promise<void>;
  disconnect(): Promise<void>;
}
