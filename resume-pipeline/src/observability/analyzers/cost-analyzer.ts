// src/observability/analyzers/cost-analyzer.ts
// Latency and token cost trends across generations.

import type { GenerationTrace } from "../../schemas/pipeline.js";

export interface CostStats {
  totalLLMCalls: number;
  totalTokens: number;
  avgTokensPerGen: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  providers: string[];
  modelsUsed: string[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function analyzeCost(traces: GenerationTrace[]): CostStats {
  const durations = traces.map((t) => t.durationMs).sort((a, b) => a - b);
  const totalLLMCalls = traces.reduce((s, t) => s + t.cost.llmCalls, 0);
  const totalTokens = traces.reduce((s, t) => s + t.cost.totalTokens, 0);

  const allProviders = new Set<string>();
  const allModels = new Set<string>();
  for (const t of traces) {
    if (t.cost.provider) allProviders.add(t.cost.provider);
    if (t.cost.modelsUsed) {
      for (const m of t.cost.modelsUsed) allModels.add(m);
    }
  }

  return {
    totalLLMCalls,
    totalTokens,
    avgTokensPerGen:
      traces.length > 0
        ? Math.round(totalTokens / traces.length)
        : 0,
    avgDurationMs:
      traces.length > 0
        ? Math.round(
            durations.reduce((s, v) => s + v, 0) / traces.length,
          )
        : 0,
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    providers: [...allProviders],
    modelsUsed: [...allModels],
  };
}
