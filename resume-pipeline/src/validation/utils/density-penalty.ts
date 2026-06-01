// src/validation/utils/density-penalty.ts
// Keyword density penalty — prevents score inflation from keyword stuffing.
// Returns 1.0 (clean) down to 0.6 (heavy stuffing).
// Applied as a MULTIPLIER on keywordRelevance, NOT as a standalone dimension.

import { countKeywordOccurrences } from "./word-boundary.js";

export function calculateDensityPenalty(
  skills: string[],
  text: string,
): number {
  const wordCount = text.split(/\s+/).length;
  if (wordCount === 0) return 1.0;

  let totalExcessOccurrences = 0;

  for (const skill of skills) {
    const count = countKeywordOccurrences(skill, text);
    const expectedMax = Math.max(3, Math.ceil(wordCount / 150));
    if (count > expectedMax) {
      totalExcessOccurrences += count - expectedMax;
    }
  }

  return Math.max(0.6, 1 - totalExcessOccurrences * 0.05);
}
