// hooks/useApiKeys.ts
// Manages user API keys: in-memory (session) + optional encrypted localStorage.
// Exposes: state, setProvider, setKey, setSaved, testKey, getApiKeys, persist, clearPersisted.

"use client";

import { useState, useCallback, useEffect } from "react";
import { encryptApiKeys, decryptApiKeys } from "@/lib/crypto";
import { api } from "@/lib/api";

export type LLMProvider = "google" | "openai" | "anthropic";

export interface ApiKeyState {
  provider: LLMProvider;
  key: string;
  saved: boolean;
  validated: boolean | null;
  validationMessage?: string;
  testing: boolean;
}

const STORAGE_KEY = "ats_encrypted_keys";
const STORAGE_IV = "ats_encrypted_keys_iv";

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  google: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

export { PROVIDER_LABELS };

export function useApiKeys() {
  const [state, setState] = useState<ApiKeyState>({
    provider: "google",
    key: "",
    saved: false,
    validated: null,
    validationMessage: undefined,
    testing: false,
  });

  useEffect(() => {
    const encrypted = localStorage.getItem(STORAGE_KEY);
    const ivWithSalt = localStorage.getItem(STORAGE_IV);
    if (encrypted && ivWithSalt) {
      decryptApiKeys(encrypted, ivWithSalt).then((keys) => {
        if (keys) {
          const [provider, key] = Object.entries(keys)[0] || ["google", ""];
          setState((s) => ({
            ...s,
            provider: provider as LLMProvider,
            key: key.trim(),
            saved: true,
          }));
        }
      });
    }
  }, []);

  const setProvider = useCallback((p: LLMProvider) => {
    setState((s) => ({ ...s, provider: p, validated: null, validationMessage: undefined, key: "", saved: false }));
  }, []);

  const setKey = useCallback((key: string) => {
    setState((s) => ({ ...s, key: key.trim(), validated: null, validationMessage: undefined }));
  }, []);

  const setSaved = useCallback((saved: boolean) => {
    setState((prev) => ({ ...prev, saved }));
  }, []);

  const clearPersisted = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_IV);
  }, []);

  const persist = useCallback(async () => {
    if (!state.key) return;
    const { encrypted, ivWithSalt } = await encryptApiKeys({
      [state.provider]: state.key,
    });
    localStorage.setItem(STORAGE_KEY, encrypted);
    localStorage.setItem(STORAGE_IV, ivWithSalt);
  }, [state.key, state.provider]);

  const testKey = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, testing: true, validated: null, validationMessage: undefined }));
    try {
      const data = await api.settings.validateKey(state.provider, state.key);
      const valid = data.valid === true;
      setState((s) => ({ ...s, validated: valid, validationMessage: data.message, testing: false }));
      return valid;
    } catch (err: any) {
      setState((s) => ({ ...s, validated: false, validationMessage: "Validation service unavailable.", testing: false }));
      return false;
    }
  }, [state.provider, state.key]);

  const getApiKeys = useCallback(():
    | { apiKeys: Record<string, string>; llmProvider: string }
    | null => {
    if (!state.key) return null;
    return {
      apiKeys: { [state.provider]: state.key },
      llmProvider: state.provider,
    };
  }, [state.provider, state.key]);

  return {
    state,
    setProvider,
    setKey,
    setSaved,
    persist,
    clearPersisted,
    testKey,
    getApiKeys,
  };
}
