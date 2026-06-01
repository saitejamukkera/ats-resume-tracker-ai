// src/validation/dimensions/keyword-placement.ts
// % of JD required skills appearing in high-weight areas
// (summary + first 2 bullets of each role).

import type { ScorerDimension } from "../scorer-dimension.js";
import { keywordExistsInText } from "../utils/word-boundary.js";
import { getAllSkillVariants } from "../skill-variants.js";

export const keywordPlacementDimension: ScorerDimension = {
  key: "keywordPlacement",
  label: "Keyword Placement",

  evaluate(ctx): number {
    if (ctx.jd.requiredSkills.length === 0) return 1.0;

    if (!ctx.highWeightText.trim()) return 0;

    const hits = ctx.jd.requiredSkills.filter((skill) =>
      getAllSkillVariants(skill).some((v) =>
        keywordExistsInText(v, ctx.highWeightText),
      ),
    );

    return hits.length / ctx.jd.requiredSkills.length;
  },
};
