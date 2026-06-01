// src/validation/dimensions/education-level-match.ts
// Compares JD's minimum education requirement against the candidate's
// actual degree level detected from the resume education section.

import type { ScorerDimension } from "../scorer-dimension.js";

const DEGREE_PATTERNS: Array<{ level: string; pattern: RegExp }> = [
  { level: "phd",       pattern: /\bph\.?\s*d\b|doctorate|doctoral/i },
  { level: "masters",   pattern: /\bm\.?\s*s\.?\b|\bm\.?\s*a\.?\b|\bm\.?\s*eng\b|master|mba/i },
  { level: "bachelors", pattern: /\bb\.?\s*s\.?\b|\bb\.?\s*a\.?\b|\bb\.?\s*eng\b|bachelor|undergrad/i },
  { level: "associate", pattern: /\ba\.?\s*s\.?\b|\ba\.?\s*a\.?\b|associate/i },
  { level: "high-school", pattern: /\bhigh\s+school\b|ged|secondary/i },
];

function detectResumeDegreeLevel(educationText: string): string | null {
  const text = educationText.toLowerCase();
  for (const entry of DEGREE_PATTERNS) {
    if (entry.pattern.test(text)) return entry.level;
  }
  return null;
}

const DEGREE_RANK: Record<string, number> = {
  none: 0,
  "high-school": 1,
  associate: 2,
  bachelors: 3,
  masters: 4,
  phd: 5,
};

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
