// src/validation/dimensions/metrics-ratio.ts
// % of bullets containing quantifiable numbers.

import type { ScorerDimension } from "../scorer-dimension.js";

export const metricsRatioDimension: ScorerDimension = {
  key: "metricsRatio",
  label: "Metrics Usage",

  evaluate(ctx): number {
    const allAnalyses = ctx.impactProfiles.flatMap((p) => p.bullets);
    if (allAnalyses.length === 0) return 0;

    const withMetrics = allAnalyses.filter((a) => a.signals.hasNumber).length;
    return withMetrics / allAnalyses.length;
  },
};
