// src/observability/analytics.ts
// Layer 3: Aggregate Analytics — system health reports across multiple generations.

import type { GenerationTrace, FailedRule } from "../schemas/pipeline.js";

// ── System Health Report ────────────────────────────────────────
export interface SystemHealthReport {
  period: { from: string; to: string };
  totalGenerations: number;
  outcomes: {
    success: number;
    partial: number;
    failed: number;
    successRate: number;
  };
  topFailingRules: Array<{ rule: string; count: number; percentage: number }>;
  repairEffectiveness: {
    totalRepairs: number;
    avgRepairAttempts: number;
  };
  scoreDistributions: {
    ats: { min: number; max: number; avg: number; p50: number };
    impact: { min: number; max: number; avg: number; p50: number };
  };
  latency: {
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
  };
  cost: {
    totalLLMCalls: number;
    totalTokens: number;
    avgTokensPerGeneration: number;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function buildHealthReport(
  traces: GenerationTrace[],
): SystemHealthReport {
  if (traces.length === 0) {
    return emptyReport();
  }

  const timestamps = traces.map((t) => t.timestamp).sort();
  const success = traces.filter((t) => t.status === "success").length;
  const partial = traces.filter((t) => t.status === "partial").length;
  const failed = traces.filter((t) => t.status === "failed").length;

  // Aggregate failing rules
  const ruleCounts = new Map<string, number>();
  for (const trace of traces) {
    if (trace.failedRules) {
      for (const rule of trace.failedRules) {
        ruleCounts.set(
          rule.rule,
          (ruleCounts.get(rule.rule) ?? 0) + rule.count,
        );
      }
    }
  }
  const topFailingRules = [...ruleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rule, count]) => ({
      rule,
      count,
      percentage: (count / traces.length) * 100,
    }));

  // Repair stats
  const totalRepairs = traces.reduce(
    (s, t) => s + t.validation.repairAttempts,
    0,
  );
  const tracesWithRepairs = traces.filter(
    (t) => t.validation.repairAttempts > 0,
  );
  const avgRepairAttempts =
    tracesWithRepairs.length > 0 ? totalRepairs / tracesWithRepairs.length : 0;

  // Score distributions
  const atsScores = traces.map((t) => t.scores.ats).sort((a, b) => a - b);
  const impactScores = traces
    .map((t) => t.scores.impactScore)
    .sort((a, b) => a - b);

  // Latency
  const durations = traces.map((t) => t.durationMs).sort((a, b) => a - b);

  // Cost
  const totalLLMCalls = traces.reduce((s, t) => s + t.cost.llmCalls, 0);
  const totalTokens = traces.reduce((s, t) => s + t.cost.totalTokens, 0);

  return {
    period: { from: timestamps[0], to: timestamps[timestamps.length - 1] },
    totalGenerations: traces.length,
    outcomes: {
      success,
      partial,
      failed,
      successRate: (success / traces.length) * 100,
    },
    topFailingRules,
    repairEffectiveness: {
      totalRepairs,
      avgRepairAttempts,
    },
    scoreDistributions: {
      ats: {
        min: atsScores[0],
        max: atsScores[atsScores.length - 1],
        avg: atsScores.reduce((s, v) => s + v, 0) / atsScores.length,
        p50: percentile(atsScores, 50),
      },
      impact: {
        min: impactScores[0],
        max: impactScores[impactScores.length - 1],
        avg: impactScores.reduce((s, v) => s + v, 0) / impactScores.length,
        p50: percentile(impactScores, 50),
      },
    },
    latency: {
      avgDurationMs: durations.reduce((s, v) => s + v, 0) / durations.length,
      p50DurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
    },
    cost: {
      totalLLMCalls,
      totalTokens,
      avgTokensPerGeneration: totalTokens / traces.length,
    },
  };
}

function emptyReport(): SystemHealthReport {
  return {
    period: { from: "", to: "" },
    totalGenerations: 0,
    outcomes: { success: 0, partial: 0, failed: 0, successRate: 0 },
    topFailingRules: [],
    repairEffectiveness: { totalRepairs: 0, avgRepairAttempts: 0 },
    scoreDistributions: {
      ats: { min: 0, max: 0, avg: 0, p50: 0 },
      impact: { min: 0, max: 0, avg: 0, p50: 0 },
    },
    latency: { avgDurationMs: 0, p50DurationMs: 0, p95DurationMs: 0 },
    cost: { totalLLMCalls: 0, totalTokens: 0, avgTokensPerGeneration: 0 },
  };
}
