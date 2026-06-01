// src/stages/keyword-gap-repair.ts
// Stage 4.6: Targeted keyword gap repair with anti-stuffing optimization.
// Limits repair to top-8 most impactful missing keywords per pass.
// Uses variant-aware density filtering to prevent over-stuffing.

import { z } from "zod";
import { models as defaultModels } from "../config/models.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { LanguageModel } from "ai";
import type { GeneratedSections } from "../schemas/pipeline.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { SnapshotStore } from "../observability/debug.js";
import type { CandidateTechProfile } from "./tech-stack-extractor.js";
import { countKeywordOccurrences } from "../validation/utils/word-boundary.js";
import { getAllSkillVariants } from "../validation/skill-variants.js";

const KeywordGapRepairSchema = z.object({
  repairedBullets: z.array(
    z.object({
      roleIndex: z.number(),
      bulletIndex: z.number(),
      text: z.string().min(15),
    }),
  ),
});

const MAX_REPAIR_KEYWORDS = 8;

// ── Keyword Selection ──────────────────────────────────────────

function selectRepairKeywords(
  missingRequired: string[],
  missingPreferred: string[],
  fullResumeText: string,
  jdText: string,
  skipKeywords: Set<string>,
  candidateTech?: CandidateTechProfile,
): string[] {
  const loweredJd = jdText.toLowerCase();
  const loweredResume = fullResumeText.toLowerCase();
  
  let allCandidates = [...missingRequired, ...missingPreferred];

  // Whitelist filtering: only repair skills the candidate has declared/knows
  if (candidateTech) {
    const candidateSet = new Set(
      [...candidateTech.primary, ...candidateTech.secondary].map((s) => s.toLowerCase())
    );
    allCandidates = allCandidates.filter((skill) => {
      const lowerSkill = skill.toLowerCase();
      let isMatched = candidateSet.has(lowerSkill);
      if (!isMatched) {
        for (const candTech of candidateSet) {
          if (lowerSkill.includes(candTech) || candTech.includes(lowerSkill)) {
            isMatched = true;
            break;
          }
        }
      }
      return isMatched;
    });
  }

  const filtered = allCandidates.filter((skill) => {
    const lower = skill.toLowerCase();
    if (skipKeywords.has(lower)) return false;
    const variants = getAllSkillVariants(skill);
    let totalOccurrences = 0;
    for (const v of variants) {
      totalOccurrences += countKeywordOccurrences(v, loweredResume);
    }
    return totalOccurrences < 2;
  });

  if (filtered.length === 0) return [];

  const maxJdFreq = Math.max(
    ...filtered.map((s) => {
      let sum = 0;
      for (const v of getAllSkillVariants(s)) {
        sum += countKeywordOccurrences(v, loweredJd);
      }
      return sum;
    }),
    1,
  );

  const scored = filtered.map((skill) => {
    let jdFreq = 0;
    for (const v of getAllSkillVariants(skill)) {
      jdFreq += countKeywordOccurrences(v, loweredJd);
    }
    let resumeCount = 0;
    for (const v of getAllSkillVariants(skill)) {
      resumeCount += countKeywordOccurrences(v, loweredResume);
    }
    const jdScore = maxJdFreq > 0 ? jdFreq / maxJdFreq : 0;
    const resumeGap = Math.max(0, (2 - resumeCount) / 2);
    return { skill, impact: jdScore * resumeGap };
  });

  scored.sort((a, b) => b.impact - a.impact);
  return scored.slice(0, MAX_REPAIR_KEYWORDS).map((s) => s.skill);
}

// ── Main Repair Function ───────────────────────────────────────

export async function repairKeywordGaps(
  sections: GeneratedSections,
  jd: JDAnalysis,
  rawJdText: string,
  missingRequired: string[],
  missingPreferred: string[],
  skipKeywords: Set<string>,
  candidateTech?: CandidateTechProfile,
  snapshotStore?: SnapshotStore,
  models?: Record<string, LanguageModel>,
): Promise<{
  sections: GeneratedSections;
  inputTokens: number;
  outputTokens: number;
  targetedKeywords: string[];
  keywordsPlaced: number;
}> {
  const mdl = models ?? defaultModels;

  const fullText = [
    sections.summary,
    sections.skills,
    ...sections.experience.flatMap((r) => [
      r.roleTitle,
      r.company,
      ...r.bullets,
    ]),
  ].join(" ");

  const targetKeywords = selectRepairKeywords(
    missingRequired,
    missingPreferred,
    fullText,
    rawJdText,
    skipKeywords,
    candidateTech,
  );

  if (targetKeywords.length === 0) {
    return {
      sections,
      inputTokens: 0,
      outputTokens: 0,
      targetedKeywords: [],
      keywordsPlaced: 0,
    };
  }

  const bulletMap = sections.experience
    .map((role, ri) =>
      role.bullets.map((b, bi) => `  [${ri}-${bi}] ${b}`).join("\n"),
    )
    .join("\n");

  const prompt = `You are an ATS optimization expert. The resume below is MISSING these keywords that appear in the job description. Your job is to weave them into existing experience bullets naturally.

TARGET MISSING SKILLS:
${targetKeywords.map((k) => `- ${k}`).join("\n")}

CURRENT BULLETS:
${bulletMap}

JD CONTEXT:
- Position: ${jd.position} at ${jd.company}
- Domain: ${jd.domainFocus}

RULES:
- ONLY modify experience bullets. Do NOT touch or return a summary.
- ANTI-STUFFING: Limit each modified bullet to at most 1 (max 2) target keywords. Do NOT create overloaded run-on sentences.
- CONTEXT PRESERVATION: Do NOT change the core meaning, project details, metrics, or achievements of any bullet. Only append/insert the tool or technology where it fits naturally as the tool/context used to achieve the outcome.
- TRUTHFULNESS: If a keyword cannot be naturally integrated into any current experience bullet, skip it.
- Bullet style: Keep consistent (action verb + tech + outcome).
- Return: repairedBullets array of {roleIndex, bulletIndex, text} for ONLY the bullets you changed.`;

  const result = await callLLM({
    model: mdl.repair,
    schema: KeywordGapRepairSchema,
    prompt,
    stage: "keyword-gap-repair",
    snapshotStore,
  });

  const repaired: GeneratedSections = {
    ...sections,
    experience: sections.experience.map((r) => ({
      ...r,
      bullets: [...r.bullets],
    })),
  };

  for (const fix of result.object.repairedBullets) {
    const role = repaired.experience[fix.roleIndex];
    if (
      role &&
      fix.bulletIndex >= 0 &&
      fix.bulletIndex < role.bullets.length
    ) {
      role.bullets[fix.bulletIndex] = fix.text;
    }
  }

  // Post-repair variant-aware verification
  const repairedFullText = [
    repaired.summary,
    repaired.skills,
    ...repaired.experience.flatMap((r) => [
      r.roleTitle,
      r.company,
      ...r.bullets,
    ]),
  ]
    .join(" ")
    .toLowerCase();

  let keywordsPlaced = 0;
  for (const kw of targetKeywords) {
    const variants = getAllSkillVariants(kw);
    if (variants.some((v) => loweredIncludes(repairedFullText, v))) {
      keywordsPlaced++;
    }
  }

  const placementRatio =
    targetKeywords.length > 0
      ? Math.round((keywordsPlaced / targetKeywords.length) * 100)
      : 0;
  console.log(
    `[keyword-gap-repair] Targeted ${targetKeywords.length} keywords, placed ${keywordsPlaced} (${placementRatio}%)`,
  );
  if (placementRatio < 50 && targetKeywords.length > 0) {
    console.warn(
      `[keyword-gap-repair] Low placement ratio — prompt may need tuning.`,
    );
  }

  return {
    sections: repaired,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    targetedKeywords: targetKeywords,
    keywordsPlaced,
  };
}

function loweredIncludes(text: string, word: string): boolean {
  return text.includes(word.toLowerCase().trim());
}
