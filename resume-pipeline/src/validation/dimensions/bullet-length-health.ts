// src/validation/dimensions/bullet-length-health.ts
// % of experience bullets within the optimal word count range.
// Recruiters scan bullets in 6-8 seconds — bullets under 10 words
// lack context, bullets over 32 words become unreadable paragraphs.

import type { ScorerDimension } from "../scorer-dimension.js";

const OPTIMAL_MIN = 15;
const OPTIMAL_MAX = 25;
const BORDERLINE_MIN = 10;
const BORDERLINE_MAX = 32;

export const bulletLengthHealthDimension: ScorerDimension = {
  key: "bulletLengthHealth",
  label: "Bullet Length",

  evaluate(ctx): number {
    const allBullets = ctx.sections.experience.flatMap((r) => r.bullets);
    if (allBullets.length === 0) return 0;

    let totalCredit = 0;

    for (const bullet of allBullets) {
      const wordCount = bullet.split(/\s+/).filter((w) => w.length > 0).length;

      if (wordCount >= OPTIMAL_MIN && wordCount <= OPTIMAL_MAX) {
        totalCredit += 1;
      } else if (
        wordCount >= BORDERLINE_MIN &&
        wordCount <= BORDERLINE_MAX
      ) {
        totalCredit += 0.5;
      }
    }

    return totalCredit / allBullets.length;
  },
};
