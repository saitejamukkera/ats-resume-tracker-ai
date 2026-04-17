// src/config/models.ts
// Model registry — single source of truth for all LLM model routing.
// Switch providers with the LLM_PROVIDER env var. Zero code changes.

import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

const PROVIDER = (process.env.LLM_PROVIDER || "google") as
  | "google"
  | "openai"
  | "anthropic";

const PROVIDERS = {
  google: {
    fast: google("gemini-2.5-flash"),
    quality: google("gemini-2.5-flash"),
  },
  openai: {
    fast: openai("gpt-5.4-mini"),
    quality: openai("gpt-5.4"),
  },
  anthropic: {
    fast: anthropic("claude-haiku-4-5"),
    quality: anthropic("claude-sonnet-4-6"),
  },
};

const provider = PROVIDERS[PROVIDER];
if (!provider) {
  throw new Error(
    `Unknown LLM_PROVIDER: ${PROVIDER}. Available: ${Object.keys(PROVIDERS).join(", ")}`,
  );
}

/**
 * Per-stage model routing.
 * - Extraction/parsing: fast + cheap
 * - Creative generation: highest quality
 * - Repair/scoring: fast + cheap
 */
export const models: Record<string, LanguageModel> = {
  /** Simple extraction (JD parsing, field extraction) */
  extraction: provider.fast,

  /** Creative writing (bullet generation, summary, cover letter) */
  generation: provider.quality,

  /** Repair tasks (fixing specific bullets) */
  repair: provider.fast,
};

console.log(`[models] LLM Provider: ${PROVIDER}`);
