// src/validation/recruiter-search/query-builder.ts
// Derives the exact-keyword queries a recruiter would realistically run
// against the ATS for this JD. Deliberately deterministic (no LLM): the
// repair loop needs a stable convergence target, and boolean recruiter
// search is itself deterministic string matching.

import type { JDAnalysis } from "../../schemas/jd-analysis.js";

export interface RecruiterQuery {
  query: string;
  kind: "skill" | "title" | "combo" | "phrase";
  weight: number;
  /** For AND-combos: the member terms that must all hit. */
  members?: string[];
}

export const QUERY_WEIGHTS = {
  skill: 1.0,
  title: 0.7,
  combo: 0.5,
  phrase: 0.4,
} as const;

const SENIORITY_PREFIX =
  /^(?:senior|sr\.?|junior|jr\.?|staff|principal|lead|associate)\s+/i;
const LEVEL_SUFFIX = /\s+(?:i{1,3}|iv|v|\d)$/i;

/** "Senior Software Engineer II" → "Software Engineer". */
export function normalizeTitle(position: string): string {
  let title = position.trim().replace(/\s+/g, " ");
  // Drop anything after a separator: "Software Engineer - JAVA" → "Software Engineer"
  title = title.split(/\s*[-–—|(,]\s*/)[0].trim();
  let prev = "";
  while (prev !== title) {
    prev = title;
    title = title.replace(SENIORITY_PREFIX, "").replace(LEVEL_SUFFIX, "");
  }
  return title.trim();
}

/** Phrases a recruiter might paste into search: short, tech-looking. */
function isSearchablePhrase(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 4) return false;
  // Sentence fragments ("write unit tests following TDD") aren't queries.
  if (/^(?:you|we|our|the|a|an)\b/i.test(trimmed)) return false;
  return /[a-z]/i.test(trimmed);
}

export function buildRecruiterQueries(jd: JDAnalysis): RecruiterQuery[] {
  const queries: RecruiterQuery[] = [];
  const seen = new Set<string>();

  const add = (q: RecruiterQuery) => {
    const key = q.query.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(q);
  };

  // Every required skill, verbatim — the core boolean AND terms.
  for (const skill of jd.requiredSkills) {
    if (!skill.trim()) continue;
    add({ query: skill.trim(), kind: "skill", weight: QUERY_WEIGHTS.skill });
  }

  // The job title (normalized) — recruiters search by role name constantly.
  const title = normalizeTitle(jd.position ?? "");
  if (title.length >= 3) {
    add({ query: title, kind: "title", weight: QUERY_WEIGHTS.title });
  }

  // Pairwise AND-combos of the top-3 required skills — models compound
  // searches like "Java AND Kubernetes".
  const top = jd.requiredSkills.filter((s) => s.trim()).slice(0, 3);
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      add({
        query: `${top[i]} AND ${top[j]}`,
        kind: "combo",
        weight: QUERY_WEIGHTS.combo,
        members: [top[i], top[j]],
      });
    }
  }

  // Searchable key phrases (product names, domain terms a recruiter may use).
  for (const phrase of jd.keyPhrases ?? []) {
    if (isSearchablePhrase(phrase)) {
      add({
        query: phrase.trim(),
        kind: "phrase",
        weight: QUERY_WEIGHTS.phrase,
      });
    }
  }

  return queries;
}
