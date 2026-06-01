// src/observability/analytics.ts
// Layer 3: Aggregate Analytics — system health reports across multiple generations.
// Composes individual analyzers for scores, dimensions, and cost.

import type { GenerationTrace } from "../schemas/pipeline.js";
import { analyzeScores, type ScoreDistribution } from "./analyzers/score-analyzer.js";
import { analyzeDimensions, type DimensionStats } from "./analyzers/dimension-analyzer.js";
import { analyzeCost, type CostStats } from "./analyzers/cost-analyzer.js";

export type { DimensionStats, ScoreDistribution, CostStats };

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
    ats: ScoreDistribution;
    impact: ScoreDistribution;
  };
  dimensionBreakdown: DimensionStats[];
  cost: CostStats & {
    avgTokensPerGeneration: number;
  };
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

  const totalRepairs = traces.reduce(
    (s, t) => s + t.validation.repairAttempts,
    0,
  );
  const tracesWithRepairs = traces.filter(
    (t) => t.validation.repairAttempts > 0,
  );
  const avgRepairAttempts =
    tracesWithRepairs.length > 0
      ? totalRepairs / tracesWithRepairs.length
      : 0;

  const scoreDistributions = analyzeScores(traces);
  const dimensionBreakdown = analyzeDimensions(traces);
  const costStats = analyzeCost(traces);

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
    repairEffectiveness: { totalRepairs, avgRepairAttempts },
    scoreDistributions,
    dimensionBreakdown,
    cost: {
      ...costStats,
      avgTokensPerGeneration:
        traces.length > 0
          ? Math.round(costStats.totalTokens / traces.length)
          : 0,
    },
  };
}

function emptyReport(): SystemHealthReport {
  const emptyDist: ScoreDistribution = { min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
  return {
    period: { from: "", to: "" },
    totalGenerations: 0,
    outcomes: { success: 0, partial: 0, failed: 0, successRate: 0 },
    topFailingRules: [],
    repairEffectiveness: { totalRepairs: 0, avgRepairAttempts: 0 },
    scoreDistributions: { ats: emptyDist, impact: emptyDist },
    dimensionBreakdown: [],
    cost: {
      totalLLMCalls: 0,
      totalTokens: 0,
      avgTokensPerGen: 0,
      avgDurationMs: 0,
      p50DurationMs: 0,
      p95DurationMs: 0,
      providers: [],
      modelsUsed: [],
      avgTokensPerGeneration: 0,
    },
  };
}
