// src/observability/analyzers/dimension-analyzer.ts
// Per-dimension score breakdown across multiple generations.
// Answers: which dimensions are consistently underperforming?

import type { GenerationTrace } from "../../schemas/pipeline.js";

export interface DimensionStats {
  dimension: string;
  label: string;
  avgWeighted: number;
  maxPossible: number;
  avgRatio: number;
  min: number;
  max: number;
}

export function analyzeDimensions(
  traces: GenerationTrace[],
): DimensionStats[] {
  const map = new Map<
    string,
    { weighted: number[]; max: number; label: string }
  >();

  for (const trace of traces) {
    if (!trace.scores.componentBreakdown) continue;
    for (const [key, comp] of Object.entries(
      trace.scores.componentBreakdown,
    )) {
      if (!map.has(key)) {
        map.set(key, { weighted: [], max: comp.max, label: "" });
      }
      const entry = map.get(key)!;
      entry.weighted.push(comp.weighted);
      if (!entry.label && comp.label) {
        entry.label = comp.label;
      }
    }
  }

  return [...map.entries()].map(([dimension, data]) => {
    const sorted = [...data.weighted].sort((a, b) => a - b);
    const avg =
      sorted.length > 0
        ? sorted.reduce((s, v) => s + v, 0) / sorted.length
        : 0;
    return {
      dimension,
      label: data.label || dimension,
      avgWeighted: Math.round(avg * 100) / 100,
      maxPossible: data.max,
      avgRatio: data.max > 0
        ? Math.round((avg / data.max) * 100) / 100
        : 0,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
    };
  });
}
