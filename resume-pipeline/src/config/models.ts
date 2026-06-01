// src/config/models.ts
// Model registry — single source of truth for all LLM model routing.
//
// TWO modes:
//   1. Static export `models` — uses env var (LLM_PROVIDER) for server-wide key.
//      Backward compatible. Used when no BYOK keys are provided.
//   2. Factory `createModels(keyProvider)` — uses per-request keys from KeyProvider.
//      For BYOK passthrough. Keys are never stored globally.

import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type {
  ProviderKeyProvider,
  LLMProvider,
} from "../security/key-provider.js";

// ── Static env-key models (backward compatible) ─────────────────

const PROVIDER = (process.env.LLM_PROVIDER || "google") as LLMProvider;

const PROVIDERS = {
  google: {
    fast: google("gemini-2.5-flash"),
    quality: google("gemini-2.5-flash"),
  },
  openai: {
    fast: openai("gpt-5.4-nano"),
    quality: openai("gpt-5.4-mini"),
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

export const models: Record<string, LanguageModel> = {
  extraction: provider.fast,
  generation: provider.quality,
  repair: provider.fast,
};

console.log(`[models] Server LLM Provider: ${PROVIDER}`);

// ── Per-request key factory (BYOK) ──────────────────────────────

const MODEL_NAMES: Record<LLMProvider, { fast: string; quality: string }> = {
  google: { fast: "gemini-2.5-flash", quality: "gemini-2.5-flash" },
  openai: { fast: "gpt-5.4-nano", quality: "gpt-5.4-mini" },
  anthropic: { fast: "claude-haiku-4-5", quality: "claude-sonnet-4-6" },
};

export function createModels(
  keyProvider: ProviderKeyProvider,
): Record<string, LanguageModel> {
  const provider: LLMProvider = keyProvider.getPreferredProvider();
  const key = keyProvider.getKey(provider);

  if (!key) {
    throw new Error(
      `No API key available for provider: ${provider}. Please add your key in Settings.`,
    );
  }

  const names = MODEL_NAMES[provider];

  let fastModel: LanguageModel;
  let qualityModel: LanguageModel;

  switch (provider) {
    case "google": {
      const g = createGoogleGenerativeAI({ apiKey: key });
      fastModel = g(names.fast);
      qualityModel = g("gemini-2.5-flash");
      break;
    }
    case "openai": {
      const o = createOpenAI({ apiKey: key });
      fastModel = o(names.fast);
      qualityModel = o(names.quality);
      break;
    }
    case "anthropic": {
      const a = createAnthropic({ apiKey: key });
      fastModel = a(names.fast);
      qualityModel = a(names.quality);
      break;
    }
  }

  return {
    extraction: fastModel,
    generation: qualityModel,
    repair: fastModel,
  };
}
