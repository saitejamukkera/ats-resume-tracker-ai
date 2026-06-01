// src/validation/dimensions/preferred-relevance.ts
// % of JD preferred/nice-to-have skills found in resume.

import type { ScorerDimension } from "../scorer-dimension.js";
import { keywordExistsInText } from "../utils/word-boundary.js";
import { getAllSkillVariants } from "../skill-variants.js";

export const preferredRelevanceDimension: ScorerDimension = {
  key: "preferredRelevance",
  label: "Preferred Skills",

  evaluate(ctx): number {
    if (ctx.jd.preferredSkills.length === 0) return 1.0;

    const found = ctx.jd.preferredSkills.filter((skill) =>
      getAllSkillVariants(skill).some((v) =>
        keywordExistsInText(v, ctx.fullText),
      ),
    );

    return found.length / ctx.jd.preferredSkills.length;
  },
};
