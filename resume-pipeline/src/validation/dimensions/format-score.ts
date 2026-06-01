// src/validation/dimensions/format-score.ts
// Validates generated LaTeX for ATS compatibility with error boundary.
// Degrades gracefully to 0.85 when LaTeX is not yet available.

import type { ScorerDimension } from "../scorer-dimension.js";
import { validateFormat } from "../format-validator.js";

export const formatScoreDimension: ScorerDimension = {
  key: "formatScore",
  label: "ATS Format",

  evaluate(ctx): number {
    if (!ctx.fullLatexText) {
      return 0.85;
    }

    try {
      const result = validateFormat(
        ctx.fullLatexText,
        ctx.sections,
        ctx.parsedResume.preamble,
      );
      return result.score;
    } catch (e) {
      console.warn(
        `[scorer] Format validation failed, using default: ${e instanceof Error ? e.message : String(e)}`,
      );
      return 0.85;
    }
  },
};
