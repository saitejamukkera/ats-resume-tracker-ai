// src/validation/scoring-context.ts
// Builds the ScoringContext from all available inputs.

import type { ScoringContext } from "./scorer-dimension.js";
import type { GeneratedSections, ParsedResume } from "../schemas/pipeline.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { RoleImpactProfile } from "../impact/detector.js";
import { stripLatexCommands } from "./utils/latex-stripper.js";

export function buildScoringContext(
  sections: GeneratedSections,
  jd: JDAnalysis,
  parsedResume: ParsedResume,
  impactProfiles: RoleImpactProfile[],
  fullLatexText: string,
): ScoringContext {
  const fullText = [
    sections.summary,
    stripLatexCommands(sections.skills),
    stripLatexCommands(parsedResume.skills),
    ...sections.experience.flatMap((r) => [
      r.roleTitle,
      r.company,
      ...r.bullets,
    ]),
  ]
    .join(" ")
    .toLowerCase();

  const skillsText = [
    stripLatexCommands(sections.skills),
    stripLatexCommands(parsedResume.skills),
  ]
    .join(" ")
    .toLowerCase();

  const experienceText = sections.experience
    .flatMap((r) => [r.roleTitle, ...r.bullets])
    .join(" ")
    .toLowerCase();

  const highWeightTexts = [
    sections.summary,
    ...sections.experience.flatMap((r) => r.bullets.slice(0, 2)),
  ];
  const highWeightText = highWeightTexts.join(" ").toLowerCase();

  return {
    sections,
    jd,
    parsedResume,
    impactProfiles,
    fullLatexText,
    fullText,
    skillsText,
    experienceText,
    highWeightText,
  };
}
