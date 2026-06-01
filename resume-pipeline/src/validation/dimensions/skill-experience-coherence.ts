// src/validation/dimensions/skill-experience-coherence.ts
// % of skills found in the skills section that also appear in experience.
// Prevents "orphan skills" — listed but never demonstrated.
//
// DESIGN NOTE: This dimension checks coherence only for skills that are
// part of the JD required skills list. It does NOT perform general-purpose
// skill extraction (NER) from the resume's skills text — that would require
// an LLM call. This is a 0-LLM deterministic phase, so coherence is
// JD-bound rather than resume-global.

import type { ScorerDimension } from "../scorer-dimension.js";
import { keywordExistsInText } from "../utils/word-boundary.js";
import { getAllSkillVariants } from "../skill-variants.js";

export const skillExperienceCoherenceDimension: ScorerDimension = {
  key: "skillExperienceCoherence",
  label: "Skill Coherence",

  evaluate(ctx): number {
    const skillsInSkillsSection = ctx.jd.requiredSkills.filter((s) =>
      getAllSkillVariants(s).some((v) =>
        keywordExistsInText(v, ctx.skillsText),
      ),
    );

    if (skillsInSkillsSection.length === 0) return 1.0;

    const skillsInExperience = skillsInSkillsSection.filter((s) =>
      getAllSkillVariants(s).some((v) =>
        keywordExistsInText(v, ctx.experienceText),
      ),
    );

    return skillsInExperience.length / skillsInSkillsSection.length;
  },
};
