"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Check, X, Loader2, Shield, ArrowUpRight, ChevronDown } from "lucide-react";
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
    setActiveProvider,
    setKey,
    persist,
    clearPersisted,
    testKey,
  } = useApiKeys();

  const [showKey, setShowKey] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleProviderChange = (p: LLMProvider) => {
    setProvider(p);
  };

  const handleTest = async () => {
    if (state.validated === true && !showConfirmPopup) {
      setShowConfirmPopup(true);
      return;
    }
    setShowConfirmPopup(false);
    await testKey();
  };

  const handleSaveLocally = async () => {
    if (state.saved) {
      clearPersisted();
    } else {
      await persist();
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    }
  };

  return (
    <motion.div
      variants={fadeInUp}
      className="settings-api-section border-t border-border py-6"
    >
      <div className="mb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            AI Provider &amp; API Key
          </h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Use your own provider key for generation. Saved keys are encrypted in this browser.
          </p>
        </div>
      </div>

      <div className="settings-api-grid space-y-5">
        {/* Active provider dropdown (only when multiple keys are saved) */}
        {state.savedProviderCount > 1 && (
          <div className="settings-active-provider surface">
            <label className="field-label">
              Use AI Provider for Generation
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="settings-provider-select"
                aria-expanded={dropdownOpen}
                aria-haspopup="menu"
              >
                <span>{PROVIDER_LABELS[state.activeProvider]}</span>
                <ChevronDown
                  size={16}
                  className={dropdownOpen ? "rotate-180" : ""}
                />
              </button>
              {dropdownOpen && (
                <div className="settings-provider-menu" role="menu">
                  {PROVIDERS.filter((p) => state.savedProviders.includes(p) || p === state.activeProvider).map((p) => {
                    const isActive = p === state.activeProvider;
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => {
                          setActiveProvider(p);
                          setDropdownOpen(false);
                        }}
                        className={isActive ? "active" : ""}
                        role="menuitemradio"
                        aria-checked={isActive}
                      >
                        <span>{PROVIDER_LABELS[p]}</span>
                        {isActive && <Check size={14} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Provider selector */}
        <div className="settings-api-provider-block flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="AI provider">
            {PROVIDERS.map((p) => {
              const hasSaved = state.savedProviders.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProviderChange(p)}
                  aria-pressed={state.provider === p}
                  className={`relative inline-flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm font-semibold transition-colors ${
                    state.provider === p
                      ? "border-primary-600 text-primary-600"
                      : "border-transparent text-text-muted hover:text-text-primary"
                  }`}
                >
                  <span className="settings-provider-radio" aria-hidden="true" />
                  {PROVIDER_SHORT_NAMES[p]}
                  {hasSaved && (
                    <span className="settings-provider-saved" aria-label="Saved">✓</span>
                  )}
                </button>
              );
            })}
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
        <div className="settings-api-key-block space-y-1.5">
          <label htmlFor="provider-api-key" className="field-label">
            API Key
          </label>
          <div className="relative">
            <input
              id="provider-api-key"
              name="provider-api-key"
              type={showKey ? "text" : "password"}
              className="field pr-20 font-mono text-sm"
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
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="icon-button absolute right-0 top-0"
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Action row: Test button + validation feedback */}
        <div className="settings-api-actions relative flex items-center gap-3">
          <button
            onClick={handleTest}
            disabled={!state.key.trim() || state.testing}
            className="button-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.testing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              "Test Key"
            )}
          </button>

          <button
            type="button"
            onClick={handleSaveLocally}
            disabled={!state.key.trim()}
            aria-label={state.saved ? "Remove saved API key" : "Save API key in this browser"}
            className="settings-api-save button-secondary disabled:opacity-30"
          >
            {state.saved ? "Remove Key" : "Save Locally"}
          </button>

          <AnimatePresence>
            {showConfirmPopup && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10, x: 0 }}
                animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10, x: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="settings-test-confirm surface"
              >
                <p>
                  <strong>Are you sure about this?</strong> You recently tested this key successfully. Testing again will consume a fraction of a token.
                </p>
                <div className="settings-test-confirm-actions">
                  <button 
                    onClick={() => {
                      setShowConfirmPopup(false);
                      testKey();
                    }}
                    className="button-primary"
                  >
                    Yes, test again
                  </button>
                  <button 
                    onClick={() => setShowConfirmPopup(false)}
                    className="button-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Validation indicator */}
          {state.validated !== null && !state.testing && (
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="settings-api-validation"
            >
              <div className={state.validated ? "valid" : "invalid"}>
                {state.validated ? (
                  <>
                    <Check size={14} />
                    <span>Key valid</span>
                  </>
                ) : (
                  <>
                    <X size={14} />
                    <span>Invalid key</span>
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
            className={`settings-validation-message ${state.validated ? "valid" : "invalid"}`}
          >
            {state.validationMessage}
          </motion.div>
        )}

        {/* Save locally toggle */}
        <div className="settings-api-local-row flex items-center justify-between gap-4 border-t border-border pt-3">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Shield size={14} />
            <span>
              Your API key is encrypted in this browser and sent only when you request document generation.
            </span>
            {savedFeedback && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-semibold text-success"
              >
                Saved
              </motion.span>
            )}
          </div>
        </div>

        <p className="settings-api-notice text-xs text-text-muted">
          When you generate documents, this key is sent with the request to the selected provider. TrackHire does not persist it on the server.
        </p>
      </div>
    </motion.div>
  );
}
