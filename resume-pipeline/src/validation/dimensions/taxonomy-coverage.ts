// src/validation/dimensions/taxonomy-coverage.ts
// Checks JD required skills against ESCO taxonomy for synonym and
// hierarchical relationship matches that keyword matching misses.
// Example: JD asks "container orchestration" → resume has "Kubernetes" → MATCH.

import type { ScorerDimension } from "../scorer-dimension.js";
import { keywordExistsInText } from "../utils/word-boundary.js";
import { TaxonomyService } from "../taxonomy/taxonomy-service.js";

const taxonomy = TaxonomyService.getInstance();

export const taxonomyCoverageDimension: ScorerDimension = {
  key: "taxonomyCoverage",
  label: "Taxonomy Match",

  evaluate(ctx): number {
    if (ctx.jd.requiredSkills.length === 0) return 1.0;

    let matched = 0;
    let relevantCount = 0;

    for (const jdSkill of ctx.jd.requiredSkills) {
      const canonicalUri = taxonomy.normalize(jdSkill);
      if (!canonicalUri) continue;

      relevantCount++;

      const synonyms = taxonomy.getSynonyms(canonicalUri);
      const found = synonyms.some((s) =>
        keywordExistsInText(s, ctx.fullText),
      );
      if (found) {
        matched++;
        continue;
      }

      const narrowers = taxonomy.getNarrower(canonicalUri);
      if (narrowers.length === 0) continue;

      let childMatched = false;
      for (const childUri of narrowers) {
        const childSynonyms = taxonomy.getSynonyms(childUri);
        if (
          childSynonyms.some((s) => keywordExistsInText(s, ctx.fullText))
        ) {
          childMatched = true;
          break;
        }
      }
      if (childMatched) matched++;
    }

    return relevantCount > 0 ? matched / relevantCount : 1.0;
  },
};
