import type { TraceEvent } from './TraceEvent.js';
import { mkdir, open, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface JsonlTraceWriter {
  write(event: TraceEvent): Promise<void>;
  close(): Promise<void>;
}

export class FileJsonlTraceWriter implements JsonlTraceWriter {
  private handle?: FileHandle;
  private closed = false;

  constructor(private readonly path: string) {}

  async write(event: TraceEvent): Promise<void> {
    if (this.closed) throw new Error('JSONL trace writer is closed');
    if (!this.handle) {
      await mkdir(dirname(this.path), { recursive: true });
      this.handle = await open(this.path, 'a');
    }
    await this.handle.write(`${JSON.stringify(event)}\n`, undefined, 'utf8');
    await this.handle.sync();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const handle = this.handle;
    this.handle = undefined;
    if (handle) await handle.close();
  }
}
