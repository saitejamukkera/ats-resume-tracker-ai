// src/observability/debug.ts
// Layer 2: Debug Snapshots — captures every LLM call for replay and debugging.

import { v4 as uuid } from "uuid";

// ── Error Taxonomy ──────────────────────────────────────────────
export type ErrorType =
  | "rate_limit"
  | "schema_validation"
  | "timeout"
  | "provider_error"
  | "content_filter"
  | "unknown";

export function classifyError(error: unknown): ErrorType {
  const msg = String((error as any)?.message ?? error).toLowerCase();
  const statusCode =
    (error as any)?.statusCode ?? (error as any)?.lastError?.statusCode;

  if (
    statusCode === 429 ||
    statusCode === 503 ||
    msg.includes("rate limit") ||
    msg.includes("quota")
  ) {
    return "rate_limit";
  }
  if (
    msg.includes("schema") ||
    msg.includes("validation") ||
    msg.includes("zod") ||
    msg.includes("parse")
  ) {
    return "schema_validation";
  }
  if (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("deadline")
  ) {
    return "timeout";
  }
  if (
    msg.includes("content") &&
    (msg.includes("filter") || msg.includes("safety") || msg.includes("block"))
  ) {
    return "content_filter";
  }
  if (statusCode && statusCode >= 500) {
    return "provider_error";
  }
  return "unknown";
}

// ── LLM Snapshot ────────────────────────────────────────────────
export interface LLMSnapshot {
  callId: string;
  traceId: string;
  stage: string;
  timestamp: string;
  request: {
    model: string;
    provider: string;
    promptLength: number;
    hasSchema: boolean;
  };
  response: {
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    schemaValid: boolean;
  };
  performance: {
    retryCount: number;
    retryReasons: string[];
  };
  error?: {
    type: ErrorType;
    message: string;
    statusCode?: number;
  };
}

// ── Snapshot Store ──────────────────────────────────────────────
// In-memory store for one generation run. Keyed by traceId.
export class SnapshotStore {
  private traceId: string;
  private snapshots: LLMSnapshot[] = [];

  constructor(traceId: string) {
    this.traceId = traceId;
  }

  capture(opts: {
    stage: string;
    model: string;
    provider: string;
    promptLength: number;
    hasSchema: boolean;
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    schemaValid: boolean;
    retryCount?: number;
    retryReasons?: string[];
    error?: unknown;
  }): LLMSnapshot {
    const snapshot: LLMSnapshot = {
      callId: uuid(),
      traceId: this.traceId,
      stage: opts.stage,
      timestamp: new Date().toISOString(),
      request: {
        model: opts.model,
        provider: opts.provider,
        promptLength: opts.promptLength,
        hasSchema: opts.hasSchema,
      },
      response: {
        durationMs: opts.durationMs,
        inputTokens: opts.inputTokens,
        outputTokens: opts.outputTokens,
        schemaValid: opts.schemaValid,
      },
      performance: {
        retryCount: opts.retryCount ?? 0,
        retryReasons: opts.retryReasons ?? [],
      },
    };

    if (opts.error) {
      const err = opts.error as any;
      snapshot.error = {
        type: classifyError(opts.error),
        message: String(err?.message ?? opts.error),
        statusCode: err?.statusCode ?? err?.lastError?.statusCode,
      };
    }

    this.snapshots.push(snapshot);
    return snapshot;
  }

  getAll(): LLMSnapshot[] {
    return [...this.snapshots];
  }

  getByStage(stage: string): LLMSnapshot[] {
    return this.snapshots.filter((s) => s.stage === stage);
  }

  getTotalCalls(): number {
    return this.snapshots.length;
  }

  getFailedCalls(): LLMSnapshot[] {
    return this.snapshots.filter((s) => s.error != null);
  }

  getModelsUsed(): string[] {
    return [...new Set(this.snapshots.map((s) => s.request.model))];
  }

  getProvider(): string | undefined {
    return this.snapshots[0]?.request.provider;
  }
}
