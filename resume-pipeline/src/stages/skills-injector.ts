// src/stages/skills-injector.ts
// Stage 3c: Guarantee that required JD skills the candidate LEGITIMATELY HAS
// appear verbatim in the Skills section — the highest-signal, lowest-risk ATS
// placement. Deterministic, truthful (only injects skills evidenced elsewhere in
// the resume or the candidate tech profile), no LLM.
//
// A skill is "legitimately held" when it is either:
//   • literally present somewhere in the resume text (e.g. in an experience
//     bullet but not the skills line), OR
//   • demonstrated by the candidate's extracted tech profile via the skill graph
//     (a more specific skill implies the JD's skill).
// Skills the candidate cannot back up are never injected.

import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { CandidateTechProfile } from "./tech-stack-extractor.js";
import { keywordExistsInText } from "../validation/utils/word-boundary.js";
import { getAllSkillVariants } from "../validation/skill-variants.js";
import {
  getGraphAliases,
  getCategory,
  impliesSkill,
} from "../validation/taxonomy/skill-graph.js";

// Maps a skill's graph category → keywords likely to appear in a resume's skill
// category headings, so injected skills land in a sensible bucket.
const CATEGORY_HINTS: Record<string, string[]> = {
  language: ["language", "programming"],
  frontend: ["frontend", "front-end", "ui", "web"],
  backend: ["backend", "back-end", "server"],
  data: ["database", "data", "cloud", "storage"],
  cloud: ["cloud", "infrastructure", "devops"],
  devops: ["devops", "tools", "ci", "infrastructure", "ops"],
  observability: ["devops", "tools", "monitoring", "ops"],
  messaging: ["backend", "messaging", "data"],
  ml: ["ai", "ml", "machine learning", "data"],
  api: ["backend", "api", "architecture"],
  testing: ["testing", "qa", "devops", "tools"],
  security: ["security", "backend"],
  mobile: ["mobile"],
  architecture: ["architecture", "backend"],
};

interface CategoryLine {
  raw: string; // full \textbf{Name}{: items} match
  displayName: string; // original-cased heading
  name: string; // lowercased heading, for matching
  items: string;
  jdRelevance: number;
}

function surfaceForms(skill: string): string[] {
  return [...new Set([...getAllSkillVariants(skill), ...getGraphAliases(skill)])];
}

function presentInText(skill: string, text: string): boolean {
  return surfaceForms(skill).some((f) => keywordExistsInText(f, text));
}

/** Title-case a skill for display when it isn't a known acronym/brand. */
function displaySkill(skill: string): string {
  return skill
    .split(" ")
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export interface SkillInjectionResult {
  skills: string;
  injected: string[];
}

export function injectVerifiedSkills(
  skillsSection: string,
  jd: JDAnalysis,
  candidateTech: CandidateTechProfile,
  fullResumeText: string,
): SkillInjectionResult {
  const candidateSet = [
    ...candidateTech.primary,
    ...candidateTech.secondary,
  ].map((s) => s.toLowerCase());

  const heldByProfile = (skill: string): boolean =>
    candidateSet.some((have) => have === skill.toLowerCase() || impliesSkill(have, skill));

  // Candidate "has" the skill if evidenced in resume text or tech profile.
  const isHeld = (skill: string): boolean =>
    presentInText(skill, fullResumeText) || heldByProfile(skill);

  // Parse category lines: \textbf{Name}{: items}
  const lineRegex = /\\textbf\{([^}]*)\}\{:\s*([^}]*)\}/g;
  const lines: CategoryLine[] = [];
  let m: RegExpExecArray | null;
  const allJd = [...jd.requiredSkills, ...jd.preferredSkills];
  while ((m = lineRegex.exec(skillsSection)) !== null) {
    const items = m[2];
    const jdRelevance = allJd.filter((s) => presentInText(s, items)).length;
    lines.push({
      raw: m[0],
      displayName: m[1],
      name: m[1].toLowerCase(),
      items,
      jdRelevance,
    });
  }

  // No parseable category lines → don't risk corrupting the LaTeX; skip injection.
  if (lines.length === 0) {
    return { skills: skillsSection, injected: [] };
  }

  // Prioritize required, then high-value preferred; only those not already present
  // in the skills section AND legitimately held.
  const candidates = [...jd.requiredSkills, ...jd.preferredSkills].filter(
    (skill) => !presentInText(skill, skillsSection) && isHeld(skill),
  );

  const additionsByLine = new Map<number, string[]>();
  const injected: string[] = [];
  const seen = new Set<string>();

  for (const skill of candidates) {
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const category = getCategory(skill);
    const hints = category ? CATEGORY_HINTS[category] ?? [] : [];

    // Pick the line whose heading matches the skill's category; else the most
    // JD-relevant line; else the last line.
    let targetIdx = lines.findIndex((l) => hints.some((h) => l.name.includes(h)));
    if (targetIdx === -1) {
      targetIdx = lines.reduce(
        (best, l, i, arr) => (l.jdRelevance > arr[best].jdRelevance ? i : best),
        lines.length - 1,
      );
    }

    const arr = additionsByLine.get(targetIdx) ?? [];
    arr.push(displaySkill(skill));
    additionsByLine.set(targetIdx, arr);
    injected.push(skill);
  }

  if (injected.length === 0) {
    return { skills: skillsSection, injected: [] };
  }

  // Rewrite each affected line, appending new skills inside its {: ...} group.
  let result = skillsSection;
  for (const [idx, additions] of additionsByLine) {
    const line = lines[idx];
    const trimmed = line.items.replace(/\s+$/, "");
    const sep = trimmed.endsWith(",") || trimmed === "" ? " " : ", ";
    const newItems = `${trimmed}${sep}${additions.join(", ")}`;
    const newRaw = `\\textbf{${line.displayName}}{: ${newItems}}`;
    result = result.replace(line.raw, newRaw);
  }

  return { skills: result, injected };
}
