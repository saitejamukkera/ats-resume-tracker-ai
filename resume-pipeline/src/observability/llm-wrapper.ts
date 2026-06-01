// src/observability/llm-wrapper.ts
// Instrumented LLM wrapper — captures every LLM call for debugging.

import { generateObject, generateText } from "ai";
import type { LanguageModel } from "ai";
import type { ZodSchema } from "zod";
import type { SnapshotStore } from "./debug.js";

export interface LLMCallResult<T> {
  object: T;
  inputTokens: number;
  outputTokens: number;
}

export interface TextCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

// ── Rate Limit Error ────────────────────────────────────────────
// Thrown when Gemini returns 429 (quota exceeded) or 503 (overloaded).
// Carries the retry delay from the API response so callers can surface it.
export class RateLimitError extends Error {
  public readonly retryAfterSeconds: number;
  public readonly statusCode: number;

  constructor(message: string, retryAfterSeconds: number, statusCode: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.statusCode = statusCode;
  }
}

/**
 * Extract retry delay from a Gemini 429/503 error.
 * Looks for "Please retry in Xs" in the message and retryDelay in response body.
 */
function extractRateLimitInfo(
  error: unknown,
): { retrySeconds: number; statusCode: number } | null {
  const err = error as any;

  // Check if it's a RetryError wrapping API call errors
  const lastError = err?.lastError ?? err;
  const statusCode = lastError?.statusCode ?? err?.statusCode;
  if (statusCode !== 429 && statusCode !== 503) return null;

  // Try to parse retryDelay from the response body JSON
  let retrySeconds = 30; // default fallback
  try {
    const body = lastError?.responseBody ?? err?.responseBody ?? "";
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    const details = parsed?.error?.details;
    if (Array.isArray(details)) {
      for (const d of details) {
        if (d["@type"]?.includes("RetryInfo") && d.retryDelay) {
          const match = d.retryDelay.match(/(\d+)/);
          if (match) retrySeconds = parseInt(match[1], 10);
        }
      }
    }
  } catch {
    // Fallback: parse from message string "Please retry in 29.7s"
    const msg = String(lastError?.message ?? err?.message ?? "");
    const match = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
    if (match) retrySeconds = Math.ceil(parseFloat(match[1]));
  }

  return { retrySeconds, statusCode };
}

/**
 * Wrapping generateObject with token tracking + snapshot capture.
 * Every call returns both the validated object and token usage.
 */
export async function callLLM<T>(opts: {
  model: LanguageModel;
  schema: ZodSchema<T>;
  prompt: string;
  maxRetries?: number;
  maxTokens?: number;
  temperature?: number;
  stage: string;
  snapshotStore?: SnapshotStore;
}): Promise<LLMCallResult<T>> {
  const startTime = Date.now();

  try {
    const result = await generateObject({
      model: opts.model,
      schema: opts.schema,
      prompt: opts.prompt,
      maxRetries: opts.maxRetries ?? 2,
      maxTokens: opts.maxTokens,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    });

    const usage = result.usage as any;
    const inputTokens = usage?.promptTokens ?? usage?.inputTokens ?? 0;
    const outputTokens = usage?.completionTokens ?? usage?.outputTokens ?? 0;
    const durationMs = Date.now() - startTime;

    console.log(
      `[llm] ${opts.stage}: ${durationMs}ms | ` +
        `${inputTokens + outputTokens} tokens (${inputTokens}in/${outputTokens}out)`,
    );

    opts.snapshotStore?.capture({
      stage: opts.stage,
      model: (opts.model as any).modelId ?? "unknown",
      provider: (opts.model as any).provider ?? "unknown",
      promptLength: opts.prompt.length,
      hasSchema: true,
      durationMs,
      inputTokens,
      outputTokens,
      schemaValid: true,
    });

    return {
      object: result.object,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error as any;
    console.error(`[llm] ${opts.stage} FAILED after ${durationMs}ms`);
    console.error(`[llm] Error name: ${err?.name}, message: ${err?.message}`);
    console.error(
      `[llm] Status: ${err?.statusCode ?? err?.status ?? err?.lastError?.statusCode}`,
    );
    console.error(
      `[llm] Response body: ${err?.responseBody ?? err?.lastError?.responseBody ?? "none"}`,
    );
    try {
      console.error(`[llm] Full error keys:`, Object.getOwnPropertyNames(err));
    } catch {}

    opts.snapshotStore?.capture({
      stage: opts.stage,
      model: (opts.model as any).modelId ?? "unknown",
      provider: (opts.model as any).provider ?? "unknown",
      promptLength: opts.prompt.length,
      hasSchema: true,
      durationMs,
      inputTokens: 0,
      outputTokens: 0,
      schemaValid: false,
      error,
    });

    const rateInfo = extractRateLimitInfo(error);
    if (rateInfo) {
      throw new RateLimitError(
        `Rate limited (${rateInfo.statusCode}). Please try again in ${rateInfo.retrySeconds} seconds.`,
        rateInfo.retrySeconds,
        rateInfo.statusCode,
      );
    }
    throw error;
  }
}

/**
 * Wrapping generateText for free-form text output (cover letter).
 */
export async function callLLMText(opts: {
  model: LanguageModel;
  prompt: string;
  stage: string;
  snapshotStore?: SnapshotStore;
}): Promise<TextCallResult> {
  const startTime = Date.now();

  try {
    const result = await generateText({
      model: opts.model,
      prompt: opts.prompt,
    });

    const usage = result.usage as any;
    const inputTokens = usage?.promptTokens ?? usage?.inputTokens ?? 0;
    const outputTokens = usage?.completionTokens ?? usage?.outputTokens ?? 0;
    const durationMs = Date.now() - startTime;

    console.log(
      `[llm] ${opts.stage}: ${durationMs}ms | ` +
        `${inputTokens + outputTokens} tokens`,
    );

    opts.snapshotStore?.capture({
      stage: opts.stage,
      model: (opts.model as any).modelId ?? "unknown",
      provider: (opts.model as any).provider ?? "unknown",
      promptLength: opts.prompt.length,
      hasSchema: false,
      durationMs,
      inputTokens,
      outputTokens,
      schemaValid: true,
    });

    return {
      text: result.text,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err2 = error as any;
    console.error(`[llm] ${opts.stage} FAILED after ${durationMs}ms`);
    console.error(`[llm] Error name: ${err2?.name}, message: ${err2?.message}`);
    console.error(
      `[llm] Status: ${err2?.statusCode ?? err2?.status ?? err2?.lastError?.statusCode}`,
    );
    console.error(
      `[llm] Response body: ${err2?.responseBody ?? err2?.lastError?.responseBody ?? "none"}`,
    );

    opts.snapshotStore?.capture({
      stage: opts.stage,
      model: (opts.model as any).modelId ?? "unknown",
      provider: (opts.model as any).provider ?? "unknown",
      promptLength: opts.prompt.length,
      hasSchema: false,
      durationMs,
      inputTokens: 0,
      outputTokens: 0,
      schemaValid: false,
      error,
    });

    const rateInfo = extractRateLimitInfo(error);
    if (rateInfo) {
      throw new RateLimitError(
        `Rate limited (${rateInfo.statusCode}). Please try again in ${rateInfo.retrySeconds} seconds.`,
        rateInfo.retrySeconds,
        rateInfo.statusCode,
      );
    }
    throw error;
  }
}
