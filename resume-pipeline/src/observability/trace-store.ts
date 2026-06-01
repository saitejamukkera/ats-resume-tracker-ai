// src/observability/trace-store.ts
// ITraceStore interface + InMemoryTraceStore (circular buffer).
// Traces feed the admin analytics dashboard.

import type { GenerationTrace } from "../schemas/pipeline.js";

export interface ITraceStore {
  persist(trace: GenerationTrace): void;
  getAll(): GenerationTrace[];
  getRecent(count: number): GenerationTrace[];
  getByStatus(status: "success" | "partial" | "failed"): GenerationTrace[];
  getSince(since: Date): GenerationTrace[];
}

/**
 * In-memory trace store with circular buffer (max 1000 traces).
 * WARNING: All data is lost on process restart. Intended for local
 * development and stateful container environments only.
 * For production persistence, implement ITraceStore with Postgres/SQLite.
 */
export class InMemoryTraceStore implements ITraceStore {
  private traces: GenerationTrace[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  persist(trace: GenerationTrace): void {
    Object.freeze(trace);
    this.traces.push(trace);
    if (this.traces.length > this.maxSize) {
      this.traces.shift();
    }

    if (this.traces.length % 100 === 0) {
      console.log(`[trace-store] Stored ${this.traces.length}/${this.maxSize} traces`);
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
}

export const traceStore = new InMemoryTraceStore(1000);
