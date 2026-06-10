// src/observability/trace-store.ts
// ITraceStore interface + InMemoryTraceStore (circular buffer).
// Traces feed the admin analytics dashboard.
//
// Persistence: when TRACE_STORE_FILE is set, traces are appended to a
// JSONL file on disk. On startup, the file is read and last N entries
// restored. JSONL is append-only: O(1) per write, corruption-resistant.

import * as readline from "node:readline";
import { createReadStream } from "node:fs";
import { appendFile } from "node:fs/promises";
import type { GenerationTrace } from "../schemas/pipeline.js";

export interface ITraceStore {
  persist(trace: GenerationTrace): void;
  getAll(): GenerationTrace[];
  getRecent(count: number): GenerationTrace[];
  getByStatus(status: "success" | "partial" | "failed"): GenerationTrace[];
  getSince(since: Date): GenerationTrace[];
}

export class InMemoryTraceStore implements ITraceStore {
  private traces: GenerationTrace[] = [];
  private readonly maxSize: number;
  private readonly filePath: string | undefined;
  private lastDumpedIndex = 0;
  private dumpTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(maxSize: number = 1000, filePath?: string) {
    this.maxSize = maxSize;
    this.filePath = filePath;
    if (filePath) {
      this.restoreFromDisk();
    }
  }

  persist(trace: GenerationTrace): void {
    Object.freeze(trace);
    this.traces.push(trace);
    if (this.traces.length > this.maxSize) {
      this.traces.shift();
    }

    if (this.filePath) {
      this.scheduleDump();
    }

    if (this.traces.length % 100 === 0) {
      console.log(
        `[trace-store] Stored ${this.traces.length}/${this.maxSize} traces`,
      );
    }
  }

  getAll(): GenerationTrace[] {
    return [...this.traces];
  }

  getRecent(count: number): GenerationTrace[] {
    return this.traces.slice(-count);
  }

  getByStatus(status: "success" | "partial" | "failed"): GenerationTrace[] {
    return this.traces.filter((t) => t.status === status);
  }

  getSince(since: Date): GenerationTrace[] {
    return this.traces.filter((t) => new Date(t.timestamp) >= since);
  }

  size(): number {
    return this.traces.length;
  }

  private scheduleDump(): void {
    const unwritten = this.traces.length - this.lastDumpedIndex;
    if (unwritten >= 10) {
      this.dump();
      return;
    }

    if (this.dumpTimer) return;
    this.dumpTimer = setTimeout(() => {
      this.dumpTimer = null;
      this.dump();
    }, 5000);
  }

  private async dump(): Promise<void> {
    const unwritten = this.traces.length - this.lastDumpedIndex;
    if (unwritten === 0) return;

    try {
      const lines =
        this.traces
          .slice(this.lastDumpedIndex)
          .map((t) => JSON.stringify(t))
          .join("\n") + "\n";

      await appendFile(this.filePath!, lines, "utf-8");
      this.lastDumpedIndex = this.traces.length;
    } catch (err) {
      console.warn("[trace-store] Dump failed:", (err as Error).message);
    }
  }

  private async restoreFromDisk(): Promise<void> {
    try {
      const loaded: GenerationTrace[] = [];
      const stream = createReadStream(this.filePath!, { encoding: "utf-8" });
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          loaded.push(JSON.parse(line) as GenerationTrace);
        } catch {
          // Skip corrupted lines (crash mid-write)
        }
      }

      this.traces = loaded.slice(-this.maxSize).map((t) => Object.freeze(t));
      this.lastDumpedIndex = this.traces.length;

      if (this.traces.length > 0) {
        console.log(
          `[trace-store] Restored ${this.traces.length} traces from ${this.filePath}`,
        );
      }
    } catch (err: any) {
      if (err?.code === "ENOENT") return; // first run, no file yet
      console.warn("[trace-store] Restore failed:", err.message ?? err);
    }
  }
}

export const traceStore = new InMemoryTraceStore(
  1000,
  process.env.TRACE_STORE_FILE,
);
