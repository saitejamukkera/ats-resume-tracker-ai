// src/validation/dimensions/experience-level-match.ts
// Matches JD's inferred experience level against resume role count.
//
// TODO: Replace role count with actual years-of-experience computed
//       from parsed LaTeX date ranges. Role count is a weak proxy —
//       a candidate with 2 roles spanning 10 years ≠ a candidate
//       with 5 roles spanning 2 years. Ship it, improve later.

import type { ScorerDimension } from "../scorer-dimension.js";

export const experienceLevelMatchDimension: ScorerDimension = {
  key: "experienceLevelMatch",
  label: "Experience Level",

  evaluate(ctx): number {
    const level = ctx.jd.experienceLevel || "mid";
    const roleCount = ctx.sections.experience.length;

    const rangeMap: Record<string, { min: number; max: number }> = {
      entry: { min: 0, max: 2 },
      mid: { min: 2, max: 5 },
      senior: { min: 4, max: Infinity },
    };

    const range = rangeMap[level] ?? rangeMap.mid;

    if (roleCount >= range.min && roleCount <= range.max) return 1.0;
    if (
      roleCount >= range.min - 1 &&
      roleCount <= range.max + 1
    )
      return 0.7;
    return 0.4;
  },
};
