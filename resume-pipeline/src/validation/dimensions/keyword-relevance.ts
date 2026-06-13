// src/validation/dimensions/keyword-relevance.ts
// Graded JD required-skill coverage via the hybrid skill matcher.
// Replaces binary word-boundary matching with tiered credit (exact 1.0,
// implied 0.65, semantic ≤0.5), then applies the keyword-density penalty.

import type { ScorerDimension } from "../scorer-dimension.js";
import { gradedCoverage } from "../skill-matcher.js";
import { calculateDensityPenalty } from "../utils/density-penalty.js";

export const keywordRelevanceDimension: ScorerDimension = {
  key: "keywordRelevance",
  label: "Keyword Match",

  evaluate(ctx): number {
    if (ctx.jd.requiredSkills.length === 0) return 1.0;

    const coverage = gradedCoverage(ctx.requiredMatches);

    const densityPenalty = calculateDensityPenalty(
      [...ctx.jd.requiredSkills, ...ctx.jd.preferredSkills],
      ctx.fullText,
    );

    return coverage * densityPenalty;
  },
};
