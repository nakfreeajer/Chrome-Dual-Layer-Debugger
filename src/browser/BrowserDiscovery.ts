export interface DiscoveredPage {
  pageId: string;
  url: string;
  targetId?: string;
  frameIds: string[];
}

export interface BrowserDiscovery {
  discover(): Promise<DiscoveredPage[]>;
}
