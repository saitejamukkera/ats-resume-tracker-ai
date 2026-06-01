// src/validation/dimensions/section-completeness.ts
// Checks for presence of required resume sections with meaningful content.

import type { ScorerDimension } from "../scorer-dimension.js";

export const sectionCompletenessDimension: ScorerDimension = {
  key: "sectionCompleteness",
  label: "Sections",

  evaluate(ctx): number {
    interface SectionCheck {
      text: string;
      weight: number;
      name: string;
    }

    const checks: SectionCheck[] = [
      { text: ctx.sections.summary, weight: 2, name: "summary" },
      { text: ctx.sections.skills, weight: 2, name: "skills" },
      {
        text: ctx.sections.experience
          .flatMap((r) => r.bullets)
          .join(" "),
        weight: 3,
        name: "experience",
      },
      {
        text: ctx.parsedResume.education,
        weight: 1.5,
        name: "education",
      },
      { text: ctx.parsedResume.preamble, weight: 1, name: "contactInfo" },
      {
        text: ctx.parsedResume.projects,
        weight: 0.5,
        name: "certifications",
      },
    ];

    let score = 0;
    let totalWeight = 0;
    for (const check of checks) {
      totalWeight += check.weight;
      if (check.text.trim().length > 20) {
        score += check.weight;
      }
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  },
};
