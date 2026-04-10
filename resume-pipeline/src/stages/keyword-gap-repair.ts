// src/stages/keyword-gap-repair.ts
// Stage 4.6: Targeted keyword gap repair.
// After ATS scoring, if missing keywords are found, this stage rewrites
// specific bullets to naturally incorporate them. Single LLM call.

import { z } from "zod";
import { models } from "../config/models.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { GeneratedSections, GeneratedRole } from "../schemas/pipeline.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { SnapshotStore } from "../observability/debug.js";

const KeywordGapRepairSchema = z.object({
  repairedBullets: z.array(
    z.object({
      roleIndex: z.number(),
      bulletIndex: z.number(),
      text: z.string().min(15),
    }),
  ),
});

export async function repairKeywordGaps(
  sections: GeneratedSections,
  jd: JDAnalysis,
  missingRequired: string[],
  missingPreferred: string[],
  snapshotStore?: SnapshotStore,
): Promise<{
  sections: GeneratedSections;
  inputTokens: number;
  outputTokens: number;
  keywordsTargeted: number;
}> {
  // Prioritize: all missing required + up to 5 missing preferred
  const targetKeywords = [...missingRequired, ...missingPreferred.slice(0, 5)];

  if (targetKeywords.length === 0) {
    return { sections, inputTokens: 0, outputTokens: 0, keywordsTargeted: 0 };
  }

  // Build bullet map for the LLM
  const bulletMap = sections.experience
    .map((role, ri) => {
      return role.bullets.map((b, bi) => `  [${ri}-${bi}] ${b}`).join("\n");
    })
    .join("\n");

  const prompt = `You are an ATS optimization expert. The resume below is MISSING these keywords that appear in the job description. Your job is to weave them into existing experience bullets naturally.

MISSING REQUIRED SKILLS (highest priority):
${missingRequired.length > 0 ? missingRequired.map((k) => `- ${k}`).join("\n") : "(none)"}

MISSING PREFERRED SKILLS:
${
  missingPreferred.slice(0, 5).length > 0
    ? missingPreferred
        .slice(0, 5)
        .map((k) => `- ${k}`)
        .join("\n")
    : "(none)"
}

CURRENT BULLETS:
${bulletMap}

JD CONTEXT:
- Position: ${jd.position} at ${jd.company}
- Domain: ${jd.domainFocus}

RULES:
- ONLY modify experience bullets. Do NOT touch or return a summary.
- Rewrite ONLY bullets where a missing keyword can be truthfully and naturally added
- Do NOT add keywords that don't fit the bullet's context — skip them if they can't be woven in honestly
- Do NOT change the meaning or project details of any bullet
- Preserve all existing metrics and achievements
- Keep bullet style consistent (action verb + tech + outcome)
- DO NOT use raw LaTeX formatting (e.g. \\textbf{}, \\textit{})
- Use symbols naturally (%, $, etc.) — they will be escaped automatically
- DO NOT spell out symbols as words (write "30%" not "30 percent")
- DO NOT use em dashes or en dashes. Use commas or semicolons.
- If a keyword genuinely cannot be incorporated into any bullet, skip it

Return:
- repairedBullets: array of {roleIndex, bulletIndex, text} for ONLY the bullets you changed`;

  const result = await callLLM({
    model: models.repair,
    schema: KeywordGapRepairSchema,
    prompt,
    stage: "keyword-gap-repair",
    snapshotStore,
  });

  // Apply repairs
  const repaired: GeneratedSections = {
    ...sections,
    experience: sections.experience.map((r) => ({
      ...r,
      bullets: [...r.bullets],
    })),
  };

  let appliedCount = 0;
  for (const fix of result.object.repairedBullets) {
    const role = repaired.experience[fix.roleIndex];
    if (role && fix.bulletIndex >= 0 && fix.bulletIndex < role.bullets.length) {
      role.bullets[fix.bulletIndex] = fix.text;
      appliedCount++;
    }
  }

  console.log(
    `[keyword-gap-repair] Targeted ${targetKeywords.length} missing keywords, repaired ${appliedCount} bullets`,
  );

  return {
    sections: repaired,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    keywordsTargeted: targetKeywords.length,
  };
}
