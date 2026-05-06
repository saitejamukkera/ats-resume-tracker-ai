// hooks/useApiKeys.ts
// Manages user API keys: in-memory (session) + optional encrypted localStorage.
// Stores ALL provider keys at once. Auto-selects provider when only one key is
// saved; shows a dropdown when multiple keys are saved.
// Exposes: state, setProvider, setActiveProvider, setKey, setSaved, testKey,
//          getApiKeys, persist, clearPersisted.

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { encryptApiKeys, decryptApiKeys } from "@/lib/crypto";
import { api } from "@/lib/api";

export type LLMProvider = "google" | "openai" | "anthropic";

export interface ApiKeyState {
  provider: LLMProvider;           // which provider pill is selected for editing
  key: string;                      // the key currently in the input field
  saved: boolean;                   // whether the currently-edited provider's key is persisted
  validated: boolean | null;
  validationMessage?: string;
  testing: boolean;
  activeProvider: LLMProvider;      // which provider to USE for generation
  savedProviderCount: number;       // how many providers have saved keys
  savedProviders: LLMProvider[];    // which providers have saved keys (for pill badges)
}

const STORAGE_KEY = "ats_encrypted_keys";
const STORAGE_IV = "ats_encrypted_keys_iv";
const ACTIVE_PROVIDER_KEY = "ats_active_provider";

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  google: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

export { PROVIDER_LABELS };

function keysToList(allKeys: Record<string, string>): LLMProvider[] {
  return Object.keys(allKeys) as LLMProvider[];
}

export function useApiKeys() {
  const savedKeysRef = useRef<Record<string, string>>({});

  const [state, setState] = useState<ApiKeyState>({
    provider: "google",
    key: "",
    saved: false,
    validated: null,
    validationMessage: undefined,
    testing: false,
    activeProvider: "google",
    savedProviderCount: 0,
    savedProviders: [],
  });

  const reEncrypt = useCallback(async (allKeys: Record<string, string>) => {
    if (Object.keys(allKeys).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_IV);
      return;
    }
    const { encrypted, ivWithSalt } = await encryptApiKeys(allKeys);
    localStorage.setItem(STORAGE_KEY, encrypted);
    localStorage.setItem(STORAGE_IV, ivWithSalt);
  }, []);

  const resolveActive = useCallback((allKeys: Record<string, string>) => {
    const count = Object.keys(allKeys).length;
    if (count === 1) {
      const only = Object.keys(allKeys)[0] as LLMProvider;
      localStorage.setItem(ACTIVE_PROVIDER_KEY, only);
      return only;
    }
    if (count === 0) {
      return "google" as LLMProvider;
    }
    return (localStorage.getItem(ACTIVE_PROVIDER_KEY) || "google") as LLMProvider;
  }, []);

  useEffect(() => {
    const encrypted = localStorage.getItem(STORAGE_KEY);
    const ivWithSalt = localStorage.getItem(STORAGE_IV);

    if (encrypted && ivWithSalt) {
      decryptApiKeys(encrypted, ivWithSalt).then((keys) => {
        if (keys) {
          savedKeysRef.current = keys;
          const entries = Object.entries(keys);
          const providers = keysToList(keys);
          const active = resolveActive(keys);
          const [firstProv, firstKey] = entries[0] || ["google", ""];
          setState((s) => ({
            ...s,
            provider: firstProv as LLMProvider,
            key: (firstKey || "").trim(),
            saved: true,
            activeProvider: active,
            savedProviderCount: entries.length,
            savedProviders: providers,
          }));
        }
      });
    }
  }, [resolveActive]);

  const setActiveProvider = useCallback((p: LLMProvider) => {
    localStorage.setItem(ACTIVE_PROVIDER_KEY, p);
    setState((s) => ({ ...s, activeProvider: p }));
  }, []);

  const setProvider = useCallback((p: LLMProvider) => {
    const savedKey = savedKeysRef.current[p]?.trim() || "";
    setState((s) => ({
      ...s,
      provider: p,
      key: savedKey,
      validated: null,
      validationMessage: undefined,
      saved: !!savedKey,
    }));
  }, []);

  const setKey = useCallback((key: string) => {
    setState((s) => ({ ...s, key: key.trim(), validated: null, validationMessage: undefined }));
  }, []);

  const setSaved = useCallback((saved: boolean) => {
    setState((prev) => ({ ...prev, saved }));
  }, []);

  const clearPersisted = useCallback(() => {
    const next = { ...savedKeysRef.current };
    delete next[state.provider];
    savedKeysRef.current = next;
    const providers = keysToList(next);
    const count = providers.length;
    const active = resolveActive(next);
    reEncrypt(next);
    setState((s) => ({
      ...s,
      saved: false,
      activeProvider: active,
      savedProviderCount: count,
      savedProviders: providers,
    }));
  }, [state.provider, reEncrypt, resolveActive]);

  const persist = useCallback(async () => {
    if (!state.key) return;
    const next = { ...savedKeysRef.current, [state.provider]: state.key };
    savedKeysRef.current = next;
    const providers = keysToList(next);
    const count = providers.length;
    const active = resolveActive(next);
    await reEncrypt(next);
    setState((s) => ({
      ...s,
      saved: true,
      activeProvider: active,
      savedProviderCount: count,
      savedProviders: providers,
    }));
  }, [state.key, state.provider, reEncrypt, resolveActive]);

  const testKey = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, testing: true, validated: null, validationMessage: undefined }));
    try {
      const data = await api.settings.validateKey(state.provider, state.key);
      const valid = data.valid === true;
      setState((s) => ({ ...s, validated: valid, validationMessage: data.message, testing: false }));
      return valid;
    } catch {
      setState((s) => ({ ...s, validated: false, validationMessage: "Validation service unavailable.", testing: false }));
      return false;
    }
  }, [state.provider, state.key]);

  const getApiKeys = useCallback(():
    | { apiKeys: Record<string, string>; llmProvider: string }
    | null => {
    // Priority:
    // 1. Active provider matches current pill → use typed key
    // 2. Active provider has a saved key → use it
    // 3. No saved keys at all → use whatever is typed in the current pill
    // 4. Nothing available → null

    if (state.activeProvider === state.provider && state.key) {
      return {
        apiKeys: { [state.activeProvider]: state.key },
        llmProvider: state.activeProvider,
      };
    }

    const savedKey = savedKeysRef.current[state.activeProvider];
    if (savedKey) {
      return {
        apiKeys: { [state.activeProvider]: savedKey },
        llmProvider: state.activeProvider,
      };
    }

    if (state.savedProviderCount === 0 && state.key) {
      return {
        apiKeys: { [state.provider]: state.key },
        llmProvider: state.provider,
      };
    }

    return null;
  }, [state.activeProvider, state.provider, state.key, state.savedProviderCount]);

  return {
    state,
    setProvider,
    setActiveProvider,
    setKey,
    setSaved,
    persist,
    clearPersisted,
    testKey,
    getApiKeys,
  };
}
