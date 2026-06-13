// src/validation/dimensions/preferred-relevance.ts
// Graded JD preferred/nice-to-have coverage via the hybrid skill matcher.
// Bonus-only signal: missing preferred skills never penalize (handled in
// scorer-factory by treating this contribution as additive).

import type { ScorerDimension } from "../scorer-dimension.js";
import { gradedCoverage } from "../skill-matcher.js";

export const preferredRelevanceDimension: ScorerDimension = {
  key: "preferredRelevance",
  label: "Preferred Skills",

  evaluate(ctx): number {
    if (ctx.jd.preferredSkills.length === 0) return 1.0;
    return gradedCoverage(ctx.preferredMatches);
  },
};
