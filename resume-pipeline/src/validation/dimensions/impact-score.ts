// src/validation/dimensions/impact-score.ts
// Average bullet impact score from the impact detector.

import type { ScorerDimension } from "../scorer-dimension.js";

export const impactScoreDimension: ScorerDimension = {
  key: "impactScore",
  label: "Bullet Impact",

  evaluate(ctx): number {
    const allAnalyses = ctx.impactProfiles.flatMap((p) => p.bullets);
    if (allAnalyses.length === 0) return 0;

    const avg =
      allAnalyses.reduce((sum, b) => sum + b.score, 0) / allAnalyses.length;
    return Math.min(1, avg / 100);
  },
};
