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
import { analyzeBullet, detectCategory, isLowValueCategory } from "../impact/detector.js";

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

  // Build bullet map for the LLM, annotating low-value bullets as
  // prime candidates for keyword injection (the LLM should prefer
  // rewriting these over high-value performance/scale bullets)
  const bulletMap = sections.experience
    .map((role, ri) => {
      return role.bullets.map((b, bi) => {
        const cat = detectCategory(b);
        const tag = isLowValueCategory(cat) ? ` [LOW-VALUE: ${cat} — prefer rewriting this one]` : '';
        return `  [${ri}-${bi}]${tag} ${b}`;
      }).join("\n");
    })
    .join("\n");

  const prompt = `You are an ATS optimization expert. The resume below is MISSING these keywords that appear in the job description. Your job is to weave them into existing experience bullets naturally, ALWAYS with demonstrated impact.

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

KEYWORD INJECTION WITH IMPACT (critical rule):
When adding a missing keyword (e.g. Kafka, Redis, Kubernetes), you MUST
show what impact was made USING that technology. Never just name-drop.
  BAD:  "...using Kafka for message processing."
  GOOD: "...using Kafka event streams, reducing payment settlement lag from [X] minutes to under [Y] seconds."
  BAD:  "...with Redis caching."
  GOOD: "...with Redis caching, reducing P95 response latency from [X]ms to [Y]ms."
The keyword must be tied to a measurable outcome or system-level improvement.

TARGET SELECTION STRATEGY:
Bullets marked [LOW-VALUE] are process/quality/team bullets that dilute the
resume. PREFER rewriting these to incorporate the missing keyword with
system-level impact. This simultaneously fixes two problems: it adds the
missing keyword AND replaces a weak bullet with a stronger one.
Example: A bullet about "PR review cycle time" is LOW-VALUE. Replace it
entirely with a bullet about Kafka event processing if Kafka is missing.

RULES:
- ONLY modify experience bullets. Do NOT touch or return a summary.
- Rewrite ONLY bullets where a missing keyword can be truthfully and naturally added WITH IMPACT
- Do NOT add keywords that don't fit the bullet's context — skip them if they can't be woven in honestly
- Do NOT change the meaning or project details of any bullet
- Preserve all existing metrics and achievements
- OUTCOME-FIRST: when possible, restructure the bullet so the outcome leads
  (e.g. "Reduced settlement lag by 90% by migrating batch jobs to Kafka event streams")
- Keep bullet style consistent (action verb + tech + outcome)
- DO NOT use raw LaTeX formatting (e.g. \\textbf{}, \\textit{})
- Use symbols naturally (%, $, etc.) — they will be escaped automatically
- DO NOT spell out symbols as words (write "30%" not "30 percent")
- DO NOT use em dashes or en dashes. Use commas or semicolons.
- Repaired bullets must stay under 35 words / 220 characters. If adding a keyword would make a bullet too long, rephrase to be tighter rather than appending.
- Remove filler phrases to make room: "using data structures", "using system design principles", "in an agile environment" add no value and can be replaced with the missing keyword + impact.
- MAXIMIZE SCORE WITH ALL KEYWORDS (CRITICAL): You MUST weave ALL missing keywords (even soft skills or CS concepts like "algorithms", "design patterns", "system architecture") into the bullets to maximize ATS match. 
- ORGANIC WEAVING FOR SOFT SKILLS: NEVER use abstract skills as blunt active verbs (e.g., NEVER write "applying algorithms", "using design patterns"). Weave them naturally as descriptive noun phrases (e.g. "by designing scalable query algorithms", "using resilient system architecture").
- If a keyword genuinely cannot be incorporated without breaking grammar, skip it, but prioritize maximum inclusion.

Return:
- repairedBullets: array of {roleIndex, bulletIndex, text} for ONLY the bullets you changed`;

  const result = await callLLM({
    model: models.repair,
    schema: KeywordGapRepairSchema,
    prompt,
    stage: "keyword-gap-repair",
    snapshotStore,
  });

  // Apply repairs with IDS regression guard
  const repaired: GeneratedSections = {
    ...sections,
    experience: sections.experience.map((r) => ({
      ...r,
      bullets: [...r.bullets],
    })),
  };

  const jdKeywordsList = [...jd.requiredSkills, ...jd.preferredSkills];
  let appliedCount = 0;
  let rejectedCount = 0;

  for (const fix of result.object.repairedBullets) {
    const role = repaired.experience[fix.roleIndex];
    if (role && fix.bulletIndex >= 0 && fix.bulletIndex < role.bullets.length) {
      // Length guard
      const wordCount = fix.text.split(/\s+/).length;
      if (wordCount > 40) {
        rejectedCount++;
        console.log(
          `[keyword-gap-repair] Rejected [${fix.roleIndex}-${fix.bulletIndex}]: ` +
            `Too long after repair (${wordCount} words)`,
        );
        continue;
      }

      // Check IDS impact of original vs rewritten bullet
      const originalBullet = role.bullets[fix.bulletIndex];
      const originalAnalysis = analyzeBullet(originalBullet, jdKeywordsList, "mid");
      const rewrittenAnalysis = analyzeBullet(fix.text, jdKeywordsList, "mid");

      // Only strong→medium is allowed (acceptable tradeoff for keyword coverage).
      // All other downgrades are rejected:
      //   - "none" is an absolute floor regardless of origin (fixes weak→none bug)
      //   - medium→weak and strong→weak are too much damage for one keyword
      const strengthOrder = { none: 0, weak: 1, medium: 2, strong: 3 };
      const originalRank = strengthOrder[originalAnalysis.strength];
      const rewrittenRank = strengthOrder[rewrittenAnalysis.strength];

      if (rewrittenAnalysis.strength === 'none' || (rewrittenRank <= 1 && originalRank > 1)) {
        rejectedCount++;
        console.log(
          `[keyword-gap-repair] Rejected [${fix.roleIndex}-${fix.bulletIndex}]: ` +
            `IDS dropped ${originalAnalysis.strength}→${rewrittenAnalysis.strength}`,
        );
      } else {
        role.bullets[fix.bulletIndex] = fix.text;
        appliedCount++;
      }
    }
  }

  console.log(
    `[keyword-gap-repair] Targeted ${targetKeywords.length} missing keywords, repaired ${appliedCount} bullets` +
      (rejectedCount > 0 ? `, rejected ${rejectedCount} (IDS regression)` : ""),
  );

  return {
    sections: repaired,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    keywordsTargeted: targetKeywords.length,
  };
}
