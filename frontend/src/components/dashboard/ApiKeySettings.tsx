"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Key, Eye, EyeOff, Check, X, Loader2, Shield, ArrowUpRight } from "lucide-react";
import {
  useApiKeys,
  PROVIDER_LABELS,
  type LLMProvider,
} from "../../hooks/useApiKeys";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const PROVIDERS: LLMProvider[] = ["google", "openai", "anthropic"];

const PROVIDER_KEY_URLS: Record<LLMProvider, string> = {
  google: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
};

const PROVIDER_SHORT_NAMES: Record<LLMProvider, string> = {
  google: "Google",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

export default function ApiKeySettings() {
  const {
    state,
    setProvider,
    setKey,
    setSaved,
    persist,
    clearPersisted,
    testKey,
    getApiKeys,
  } = useApiKeys();

  const [showKey, setShowKey] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  const handleProviderChange = async (p: LLMProvider) => {
    setProvider(p);
  };

  const handleTest = async () => {
    if (state.validated === true) {
      const confirm = window.confirm(
        "This key has already been successfully validated. Testing it again will consume a fraction of a token from your provider. Are you sure you want to test again?"
      );
      if (!confirm) return;
    }
    await testKey();
  };

  const handleSaveLocally = async () => {
    if (state.saved) {
      clearPersisted();
      setSaved(false);
    } else {
      await persist();
      setSaved(true);
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    }
  };

  return (
    <motion.div
      variants={fadeInUp}
      className="p-8 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5"
    >
      <div className="flex items-center gap-4 mb-8 pb-6 border-b border-gray-200/60 dark:border-gray-800/60">
        <div className="w-11 h-11 rounded-xl bg-linear-to-br from-amber-100 to-amber-50 dark:from-amber-900/20 dark:to-amber-800/20 flex items-center justify-center">
          <Key
            size={22}
            className="text-amber-600 dark:text-amber-400"
          />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
            AI Provider API Key
          </h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            Use your own API key for resume generation. Your key is never stored on our servers.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Provider selector pills */}
        <div className="flex items-center justify-between">
          <div className="flex p-1.5 bg-gray-100/80 dark:bg-zinc-800/80 rounded-full">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  state.provider === p
                    ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
          <a
            href={PROVIDER_KEY_URLS[state.provider]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          >
            Get your {PROVIDER_SHORT_NAMES[state.provider]} API key here
            <ArrowUpRight size={12} />
          </a>
        </div>

        {/* Key input with show/hide */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              className="w-full px-4 py-2.5 pr-20 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 font-mono"
              placeholder={
                state.provider === "google"
                  ? "AIza..."
                  : state.provider === "openai"
                    ? "sk-..."
                    : "sk-ant-..."
              }
              value={state.key}
              onChange={(e) => setKey(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Action row: Test button + validation feedback */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={!state.key.trim() || state.testing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-gray-200/60 dark:border-gray-700/60 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state.testing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              "Test Key"
            )}
          </button>

          {/* Validation indicator */}
          {state.validated !== null && !state.testing && (
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col gap-1"
            >
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold">
                {state.validated ? (
                  <>
                    <Check size={14} className="text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Key valid
                    </span>
                  </>
                ) : (
                  <>
                    <X size={14} className="text-red-500" />
                    <span className="text-red-600 dark:text-red-400">
                      Invalid key
                    </span>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </div>
        
        {/* Detailed Validation Message */}
        {state.validationMessage && !state.testing && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-[13px] p-3 rounded-lg border ${
              state.validated 
                ? 'bg-emerald-50/50 border-emerald-100/50 text-emerald-700 dark:bg-emerald-900/10 dark:border-emerald-800/30 dark:text-emerald-400' 
                : 'bg-red-50/50 border-red-100/50 text-red-700 dark:bg-red-900/10 dark:border-red-800/30 dark:text-red-400'
            }`}
          >
            {state.validationMessage}
          </motion.div>
        )}

        {/* Save locally toggle */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-200/60 dark:border-gray-800/60">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Shield size={14} />
            <span>
              {state.saved
                ? "Key saved and encrypted in your browser"
                : "Do you want to save this key? This key will be saved and encrypted on your browser only."}
            </span>
            {savedFeedback && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-emerald-600 dark:text-emerald-400 font-semibold"
              >
                Saved
              </motion.span>
            )}
          </div>
          <button
            onClick={handleSaveLocally}
            disabled={!state.key.trim()}
            className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors disabled:opacity-30 ${
              state.saved
                ? "bg-primary-600"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                state.saved ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Security notice */}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Your key is sent directly to {PROVIDER_SHORT_NAMES[state.provider]}, never stored on our servers
          or logged.
        </p>
      </div>
    </motion.div>
  );
}
