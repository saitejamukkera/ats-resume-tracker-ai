// src/security/key-validator.ts
// API key format validation.
// Prevents obviously malformed keys from being passed to LLM providers.

import type { LLMProvider } from "./key-provider.js";

const PATTERNS: Record<LLMProvider, RegExp> = {
  openai: /^sk-(?:proj-)?[A-Za-z0-9_-]{20,}$/,
  google: /^AIza[A-Za-z0-9_-]{30,}$/,
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
};

export function validateKeyFormat(
  provider: LLMProvider,
  key: string,
): { valid: boolean; message?: string } {
  if (!key || key.trim().length === 0) {
    return { valid: false, message: "Key is empty." };
  }

  const pattern = PATTERNS[provider];
  if (!pattern.test(key.trim())) {
    return {
      valid: false,
      message: `Invalid ${provider.toUpperCase()} API key format. Expected prefix: ${
        provider === "openai"
          ? "sk-..."
          : provider === "google"
            ? "AIza..."
            : "sk-ant-..."
      }`,
    };
  }

  return { valid: true };
}
