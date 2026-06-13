// src/validation/skill-matcher.ts
// Hybrid skill matcher — the graded replacement for binary keyword matching.
// Resolves each JD skill to the best of three tiers against the resume:
//   exact    (1.00) — literal alias/variant present              (lexical, sync)
//   implied  (0.65) — a more specific resume skill proves it     (ontology, sync)
//   semantic (≤0.50)— embedding similarity above threshold       (SBERT, async)
// Lexical tiers run synchronously inside scoring-context; the semantic tier is
// merged later by the async embedding path. Free, offline, deterministic for the
// lexical tiers.

import { keywordExistsInText } from "./utils/word-boundary.js";
import { getAllSkillVariants } from "./skill-variants.js";
import {
  allGraphAliases,
  getGraphAliases,
  impliesSkill,
} from "./taxonomy/skill-graph.js";
import { TaxonomyService } from "./taxonomy/taxonomy-service.js";

export type MatchTier = "exact" | "implied" | "semantic" | "none";

export interface SkillMatch {
  /** Original JD skill string (preserves casing for display). */
  skill: string;
  tier: MatchTier;
  /** Credit toward coverage, 0..1. */
  credit: number;
}

export type SkillMatchMap = Map<string, SkillMatch>;

export const TIER_CREDIT: Record<Exclude<MatchTier, "semantic">, number> = {
  exact: 1.0,
  implied: 0.65,
  none: 0,
};

/** Cosine ≥ this counts as a (capped) semantic match. */
export const SEMANTIC_THRESHOLD = 0.45;
/** Semantic credit is capped so it never fully satisfies a requirement. */
export const SEMANTIC_CREDIT_CAP = 0.5;

const taxonomy = TaxonomyService.getInstance();

// ── Present-skill detection ─────────────────────────────────────

/**
 * Canonical graph skills physically present in `text`. Computed once per resume
 * and reused across all JD skills so implied matching is O(graph + jdSkills).
 */
export function detectPresentSkills(text: string): Set<string> {
  const present = new Set<string>();
  for (const { alias, canonical } of allGraphAliases()) {
    if (present.has(canonical)) continue;
    if (keywordExistsInText(alias, text)) present.add(canonical);
  }
  return present;
}

// ── Lexical matching (exact + implied) ──────────────────────────

function matchOne(
  jdSkill: string,
  resumeText: string,
  presentCanonical: Set<string>,
): SkillMatch {
  // Tier 1: exact / alias / variant present in resume text.
  const surfaceForms = new Set<string>([
    ...getAllSkillVariants(jdSkill),
    ...getGraphAliases(jdSkill),
  ]);
  for (const form of surfaceForms) {
    if (keywordExistsInText(form, resumeText)) {
      return { skill: jdSkill, tier: "exact", credit: TIER_CREDIT.exact };
    }
  }

  // Tier 2a: ontology inference — a present (more specific) skill proves jdSkill.
  for (const have of presentCanonical) {
    if (impliesSkill(have, jdSkill)) {
      return { skill: jdSkill, tier: "implied", credit: TIER_CREDIT.implied };
    }
  }

  // Tier 2b: ESCO synonym/hierarchy fallback for long-tail skills the curated
  // graph doesn't cover.
  const uri = taxonomy.normalize(jdSkill);
  if (uri) {
    const synonyms = taxonomy.getSynonyms(uri);
    if (synonyms.some((s) => keywordExistsInText(s, resumeText))) {
      return { skill: jdSkill, tier: "implied", credit: TIER_CREDIT.implied };
    }
    for (const childUri of taxonomy.getNarrower(uri)) {
      const childSyns = taxonomy.getSynonyms(childUri);
      if (childSyns.some((s) => keywordExistsInText(s, resumeText))) {
        return { skill: jdSkill, tier: "implied", credit: TIER_CREDIT.implied };
      }
    }
  }

  return { skill: jdSkill, tier: "none", credit: 0 };
}

/**
 * Lexical (exact + implied) match map for a list of JD skills. Keyed by the
 * original skill string. Semantic credit, if available, is merged afterward via
 * applySemanticMatches().
 */
export function matchSkillsLexical(
  jdSkills: string[],
  resumeText: string,
  presentCanonical?: Set<string>,
): SkillMatchMap {
  const present = presentCanonical ?? detectPresentSkills(resumeText);
  const map: SkillMatchMap = new Map();
  for (const skill of jdSkills) {
    map.set(skill, matchOne(skill, resumeText, present));
  }
  return map;
}

// ── Semantic tier merge (async path) ────────────────────────────

/**
 * Upgrade still-unmatched ("none") skills to the semantic tier using precomputed
 * cosine similarities (skill → max cosine vs candidate skills). Never downgrades
 * an existing exact/implied match.
 */
export function applySemanticMatches(
  map: SkillMatchMap,
  cosineBySkill: Map<string, number>,
): void {
  for (const [skill, match] of map) {
    if (match.tier !== "none") continue;
    const cosine = cosineBySkill.get(skill) ?? 0;
    if (cosine >= SEMANTIC_THRESHOLD) {
      map.set(skill, {
        skill,
        tier: "semantic",
        credit: Math.min(SEMANTIC_CREDIT_CAP, cosine),
      });
    }
  }
}

// ── Coverage summaries ──────────────────────────────────────────

/** Weighted coverage: mean credit across all skills (0..1). 1.0 if no skills. */
export function gradedCoverage(map: SkillMatchMap): number {
  if (map.size === 0) return 1.0;
  let sum = 0;
  for (const m of map.values()) sum += m.credit;
  return sum / map.size;
}

/**
 * "Hard" coverage for knockout gating: fraction of skills satisfied at a tier
 * strong enough to count as a real must-have (exact or implied only — semantic
 * does not satisfy a hard requirement). 1.0 if no skills.
 */
export function strongCoverage(map: SkillMatchMap): number {
  if (map.size === 0) return 1.0;
  let strong = 0;
  for (const m of map.values()) {
    if (m.tier === "exact" || m.tier === "implied") strong++;
  }
  return strong / map.size;
}

/** Skills with no match at any tier (for missingRequired/missingPreferred). */
export function unmatchedSkills(map: SkillMatchMap): string[] {
  const out: string[] = [];
  for (const m of map.values()) {
    if (m.tier === "none") out.push(m.skill);
  }
  return out;
}

/** Skills not satisfied at exact/implied tier (true knockout gaps). */
export function hardGaps(map: SkillMatchMap): string[] {
  const out: string[] = [];
  for (const m of map.values()) {
    if (m.tier !== "exact" && m.tier !== "implied") out.push(m.skill);
  }
  return out;
}
