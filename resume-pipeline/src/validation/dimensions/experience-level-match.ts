// src/validation/dimensions/experience-level-match.ts
// Matches the JD's inferred seniority against the candidate's ACTUAL years of
// experience (parsed from role date ranges in scoring-context), with a light
// title-seniority consistency check. Falls back to role count when no dates parse.

import type { ScorerDimension } from "../scorer-dimension.js";

const YEAR_RANGES: Record<string, { min: number; max: number }> = {
  entry: { min: 0, max: 2.5 },
  mid: { min: 2, max: 6 },
  senior: { min: 5, max: Infinity },
};

const ROLE_COUNT_RANGES: Record<string, { min: number; max: number }> = {
  entry: { min: 0, max: 2 },
  mid: { min: 2, max: 5 },
  senior: { min: 4, max: Infinity },
};

const SENIOR_TITLE = /\b(senior|sr\.?|staff|principal|lead|architect|head|director)\b/i;
const JUNIOR_TITLE = /\b(junior|jr\.?|intern|entry|associate|trainee|graduate)\b/i;

function fitScore(value: number, range: { min: number; max: number }): number {
  if (value >= range.min && value <= range.max) return 1.0;
  if (value >= range.min - 1 && value <= range.max + 1) return 0.75;
  return 0.45;
}

export const experienceLevelMatchDimension: ScorerDimension = {
  key: "experienceLevelMatch",
  label: "Experience Level",

  evaluate(ctx): number {
    const level = ctx.jd.experienceLevel || "mid";

    // Primary signal: actual years from parsed date ranges.
    let base: number;
    if (ctx.totalExperienceYears > 0) {
      base = fitScore(ctx.totalExperienceYears, YEAR_RANGES[level] ?? YEAR_RANGES.mid);
    } else {
      // Fallback: role count proxy when no dates were parseable.
      const roleCount = ctx.sections.experience.length;
      base = fitScore(roleCount, ROLE_COUNT_RANGES[level] ?? ROLE_COUNT_RANGES.mid);
    }

    // Title-seniority consistency: penalize a clear mismatch (JD wants senior but
    // the latest title reads junior, or vice versa); small bonus on alignment.
    const latestTitle = ctx.sections.experience[0]?.roleTitle ?? "";
    const titleSenior = SENIOR_TITLE.test(latestTitle);
    const titleJunior = JUNIOR_TITLE.test(latestTitle);

    if (level === "senior") {
      if (titleSenior) base = Math.min(1, base + 0.1);
      else if (titleJunior) base *= 0.8;
    } else if (level === "entry") {
      if (titleSenior) base *= 0.85;
    }

    return Math.max(0, Math.min(1, base));
  },
};
