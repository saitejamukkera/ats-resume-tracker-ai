// src/security/key-provider.ts
// ProviderKeyProvider — abstraction layer for API key resolution.
// Enables per-request BYOK passthrough with server-env fallback.
// Keys are never persisted; held in memory only for request duration.

export type LLMProvider = "google" | "openai" | "anthropic";

export interface ProviderKeyProvider {
  getKey(provider: LLMProvider): string | undefined;
  getPreferredProvider(): LLMProvider;
}

export class PerRequestKeyProvider implements ProviderKeyProvider {
  private keyMap: Partial<Record<LLMProvider, string>>;
  private preferred: LLMProvider;

  constructor(
    keys: Partial<Record<LLMProvider, string>>,
    preferred: LLMProvider,
  ) {
    this.keyMap = {};
    for (const [k, v] of Object.entries(keys)) {
      if (v) {
        this.keyMap[k as LLMProvider] = v;
      }
    }
    this.preferred = preferred;
  }

  getKey(provider: LLMProvider): string | undefined {
    return this.keyMap[provider];
  }

  getPreferredProvider(): LLMProvider {
    return this.preferred;
  }
}

export class ServerKeyProvider implements ProviderKeyProvider {
  private preferred: LLMProvider;

  private static ENV_MAP: Record<LLMProvider, string> = {
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
  };

  constructor(preferred: LLMProvider) {
    this.preferred = preferred;
  }

  getKey(provider: LLMProvider): string | undefined {
    const envVar = ServerKeyProvider.ENV_MAP[provider];
    return process.env[envVar];
  }

  getPreferredProvider(): LLMProvider {
    return this.preferred;
  }
}

export class CompositeKeyProvider implements ProviderKeyProvider {
  private userProvider: ProviderKeyProvider;
  private serverProvider: ProviderKeyProvider;

  constructor(user: ProviderKeyProvider, server: ProviderKeyProvider) {
    this.userProvider = user;
    this.serverProvider = server;
  }

  getKey(provider: LLMProvider): string | undefined {
    return this.userProvider.getKey(provider) ?? this.serverProvider.getKey(provider);
  }

  getPreferredProvider(): LLMProvider {
    return this.userProvider.getPreferredProvider();
  }
}

export function resolveProvider(
  requested: string | undefined,
  defaultProvider?: string,
): LLMProvider {
  const candidate = (requested || defaultProvider || process.env.LLM_PROVIDER || "google");
  const valid: LLMProvider[] = ["google", "openai", "anthropic"];
  return valid.includes(candidate as LLMProvider)
    ? (candidate as LLMProvider)
    : "google";
}
