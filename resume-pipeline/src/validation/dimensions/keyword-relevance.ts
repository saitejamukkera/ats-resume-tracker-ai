// src/validation/dimensions/keyword-relevance.ts
// % of JD required skills found in resume via word-boundary matching.

import type { ScorerDimension } from "../scorer-dimension.js";
import { keywordExistsInText } from "../utils/word-boundary.js";
import { getAllSkillVariants } from "../skill-variants.js";
import { calculateDensityPenalty } from "../utils/density-penalty.js";

export const keywordRelevanceDimension: ScorerDimension = {
  key: "keywordRelevance",
  label: "Keyword Match",

  evaluate(ctx): number {
    if (ctx.jd.requiredSkills.length === 0) return 1.0;

    const found = ctx.jd.requiredSkills.filter((skill) =>
      getAllSkillVariants(skill).some((v) =>
        keywordExistsInText(v, ctx.fullText),
      ),
    );

    const ratio =
      ctx.jd.requiredSkills.length > 0
        ? found.length / ctx.jd.requiredSkills.length
        : 1;

    const densityPenalty = calculateDensityPenalty(
      [...ctx.jd.requiredSkills, ...ctx.jd.preferredSkills],
      ctx.fullText,
    );

    return ratio * densityPenalty;
  },
};
