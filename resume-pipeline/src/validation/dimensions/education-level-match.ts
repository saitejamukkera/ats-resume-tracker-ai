// src/validation/dimensions/education-level-match.ts
// Compares JD's minimum education requirement against the candidate's
// actual degree level detected from the resume education section.

import type { ScorerDimension } from "../scorer-dimension.js";
import {
  detectResumeDegreeLevel,
  DEGREE_RANK,
} from "../utils/education-detector.js";

export const educationLevelMatchDimension: ScorerDimension = {
  key: "educationLevelMatch",
  label: "Education Level",

  evaluate(ctx): number {
    const required = ctx.jd.educationLevel || "none";
    if (required === "none") return 1.0;

    const candidateDegree = detectResumeDegreeLevel(ctx.parsedResume.education);
    if (!candidateDegree) return 0.3;

    const requiredRank = DEGREE_RANK[required] ?? 0;
    const candidateRank = DEGREE_RANK[candidateDegree] ?? 0;

    if (candidateRank >= requiredRank) return 1.0;
    if (candidateRank === requiredRank - 1) return 0.7;
    return 0.3;
  },
};
