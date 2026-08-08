// src/validation/utils/education-detector.ts
// Shared degree-level detection — used by the educationLevelMatch dimension
// and the knockout evaluator so both agree on what degree the resume shows.

const DEGREE_PATTERNS: Array<{ level: string; pattern: RegExp }> = [
  { level: "phd",       pattern: /\bph\.?\s*d\b|doctorate|doctoral/i },
  { level: "masters",   pattern: /\bm\.?\s*s\.?\b|\bm\.?\s*a\.?\b|\bm\.?\s*eng\b|master|mba/i },
  { level: "bachelors", pattern: /\bb\.?\s*s\.?\b|\bb\.?\s*a\.?\b|\bb\.?\s*eng\b|bachelor|undergrad/i },
  { level: "associate", pattern: /\ba\.?\s*s\.?\b|\ba\.?\s*a\.?\b|associate/i },
  { level: "high-school", pattern: /\bhigh\s+school\b|ged|secondary/i },
];

export function detectResumeDegreeLevel(educationText: string): string | null {
  const text = educationText.toLowerCase();
  for (const entry of DEGREE_PATTERNS) {
    if (entry.pattern.test(text)) return entry.level;
  }
  return null;
}

export const DEGREE_RANK: Record<string, number> = {
  none: 0,
  "high-school": 1,
  associate: 2,
  bachelors: 3,
  masters: 4,
  phd: 5,
};
