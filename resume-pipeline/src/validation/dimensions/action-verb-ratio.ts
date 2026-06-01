// src/validation/dimensions/action-verb-ratio.ts
// % of bullets starting with strong impact verbs.

import type { ScorerDimension } from "../scorer-dimension.js";

export const actionVerbRatioDimension: ScorerDimension = {
  key: "actionVerbRatio",
  label: "Action Verbs",

  evaluate(ctx): number {
    const allAnalyses = ctx.impactProfiles.flatMap((p) => p.bullets);
    if (allAnalyses.length === 0) return 0;

    const withStrongVerb = allAnalyses.filter(
      (a) => a.signals.hasImpactVerb,
    ).length;
    return withStrongVerb / allAnalyses.length;
  },
};
