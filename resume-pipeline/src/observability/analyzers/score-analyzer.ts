// src/observability/analyzers/score-analyzer.ts
// ATS and impact score distributions across generations.

import type { GenerationTrace } from "../../schemas/pipeline.js";

export interface ScoreDistribution {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function analyzeScores(
  traces: GenerationTrace[],
): { ats: ScoreDistribution; impact: ScoreDistribution } {
  const atsScores = traces.map((t) => t.scores.ats).sort((a, b) => a - b);
  const impactScores = traces
    .map((t) => t.scores.impactScore)
    .sort((a, b) => a - b);

  return {
    ats: {
      min: atsScores[0] ?? 0,
      max: atsScores[atsScores.length - 1] ?? 0,
      avg:
        atsScores.length > 0
          ? Math.round(
              (atsScores.reduce((s, v) => s + v, 0) / atsScores.length) * 100,
            ) / 100
          : 0,
      p50: percentile(atsScores, 50),
      p95: percentile(atsScores, 95),
    },
    impact: {
      min: impactScores[0] ?? 0,
      max: impactScores[impactScores.length - 1] ?? 0,
      avg:
        impactScores.length > 0
          ? Math.round(
              (impactScores.reduce((s, v) => s + v, 0) /
                impactScores.length) *
                100,
            ) / 100
          : 0,
      p50: percentile(impactScores, 50),
      p95: percentile(impactScores, 95),
    },
  };
}
