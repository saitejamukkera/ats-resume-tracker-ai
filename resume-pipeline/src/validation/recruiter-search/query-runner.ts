// src/validation/recruiter-search/query-runner.ts
// Runs recruiter queries against the resume text the way an ATS boolean
// search does: literal string / known-alias matching only. Implied or
// semantic relationships never count — if the string isn't on the resume,
// the recruiter's search doesn't surface it.

import type {
  RecruiterQueryResult,
  ResumeSection,
} from "../../schemas/ats-verdict.js";
import type {
  GeneratedSections,
  ParsedResume,
} from "../../schemas/pipeline.js";
import type { SkillMatchMap } from "../skill-matcher.js";
import type { RecruiterQuery } from "./query-builder.js";
import { getAllSkillVariants } from "../skill-variants.js";
import { keywordExistsInText } from "../utils/word-boundary.js";
import { stripLatexCommands } from "../utils/latex-stripper.js";

export interface SearchableText {
  bySection: Partial<Record<ResumeSection, string>>;
  fullText: string;
}

/** Build the searchable view from generated sections (pre-assembly path). */
export function buildSearchableText(
  sections: GeneratedSections,
  parsed: ParsedResume,
): SearchableText {
  const bySection: SearchableText["bySection"] = {
    header: stripLatexCommands(parsed.header).toLowerCase(),
    summary: sections.summary.toLowerCase(),
    skills: [
      stripLatexCommands(sections.skills),
      stripLatexCommands(parsed.skills),
    ]
      .join(" ")
      .toLowerCase(),
    experience: sections.experience
      .flatMap((r) => [r.roleTitle, r.company, ...r.bullets])
      .join(" ")
      .toLowerCase(),
    projects: stripLatexCommands(parsed.projects).toLowerCase(),
    education: stripLatexCommands(parsed.education).toLowerCase(),
  };
  const fullText = Object.values(bySection).join(" ");
  return { bySection, fullText };
}

function findVariantHit(
  term: string,
  text: string,
): string | null {
  for (const variant of getAllSkillVariants(term)) {
    if (keywordExistsInText(variant, text)) return variant;
  }
  return null;
}

function locateSections(
  variant: string,
  bySection: SearchableText["bySection"],
): ResumeSection[] {
  const out: ResumeSection[] = [];
  for (const [section, text] of Object.entries(bySection)) {
    if (text && keywordExistsInText(variant, text)) {
      out.push(section as ResumeSection);
    }
  }
  return out;
}

export function runRecruiterQueries(
  queries: RecruiterQuery[],
  searchable: SearchableText,
  requiredMatches?: SkillMatchMap,
): RecruiterQueryResult[] {
  return queries.map((q) => {
    if (q.kind === "combo" && q.members) {
      const memberHits = q.members.map((m) =>
        findVariantHit(m, searchable.fullText),
      );
      const hit = memberHits.every((h) => h !== null);
      const firstHit = memberHits.find((h) => h !== null) ?? null;
      return {
        query: q.query,
        kind: q.kind,
        hit,
        matchedVariant: hit ? memberHits.join(" AND ") : firstHit,
        locations: hit && memberHits[0] ? locateSections(memberHits[0], searchable.bySection) : [],
        weight: q.weight,
      };
    }

    const matched = findVariantHit(q.query, searchable.fullText);
    const result: RecruiterQueryResult = {
      query: q.query,
      kind: q.kind,
      hit: matched !== null,
      matchedVariant: matched,
      locations: matched ? locateSections(matched, searchable.bySection) : [],
      weight: q.weight,
    };

    // Explain the miss: the skill matched at a non-literal tier, so scoring
    // gave partial credit but a recruiter's exact search still misses it.
    if (!result.hit && requiredMatches) {
      for (const [skill, m] of requiredMatches) {
        if (
          skill.toLowerCase() === q.query.toLowerCase() &&
          m.tier !== "none"
        ) {
          result.nearMissTier = m.tier;
          break;
        }
      }
    }

    return result;
  });
}
