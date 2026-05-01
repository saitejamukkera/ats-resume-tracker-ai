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

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";

export async function validateKeyWithPing(
  provider: LLMProvider,
  key: string,
): Promise<{ valid: boolean; message?: string }> {
  const formatCheck = validateKeyFormat(provider, key);
  if (!formatCheck.valid) return formatCheck;

  try {
    let model;
    if (provider === "openai") {
      const openai = createOpenAI({ apiKey: key.trim() });
      model = openai("gpt-4o-mini");
    } else if (provider === "google") {
      const google = createGoogleGenerativeAI({ apiKey: key.trim() });
      model = google("gemini-2.5-flash");
    } else if (provider === "anthropic") {
      const anthropic = createAnthropic({ apiKey: key.trim() });
      model = anthropic("claude-3-5-haiku-latest");
    } else {
      return { valid: false, message: "Unsupported provider." };
    }

    // Ping the API with a tiny 1-token request
    await generateText({
      model,
      prompt: "hi",
      maxTokens: 1,
    });

    return { valid: true };
  } catch (error: any) {
    const errMsg = error?.message?.toLowerCase() || String(error).toLowerCase();
    
    // Check for quota/billing errors
    if (
      errMsg.includes("insufficient_quota") || 
      errMsg.includes("429") || 
      errMsg.includes("billing") ||
      errMsg.includes("quota") ||
      errMsg.includes("out of credits") ||
      errMsg.includes("balance")
    ) {
      return { 
        valid: false, 
        message: "Key is valid, but currently you have insufficient credits. Please add balance to start generating awesome resumes." 
      };
    }
    
    // Check for auth errors
    if (errMsg.includes("401") || errMsg.includes("unauthorized") || errMsg.includes("invalid_api_key")) {
      return { valid: false, message: "Invalid API key provided. Authentication failed." };
    }

    return { valid: false, message: `API verification failed: ${error?.message || "Unknown error"}` };
  }
}
