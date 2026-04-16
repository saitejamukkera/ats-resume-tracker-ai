// src/stages/section-generators.ts
// Stage 3: Summary + Experience generators.
// Each section gets a focused prompt. Experience roles run in parallel.
// Two-layer Zod: loose schema for LLM output, strict app-side validation after.

import { z } from "zod";
import { models } from "../config/models.js";
import { SummaryOutputSchema } from "../schemas/summary.js";
import {
  ExperienceOutputSchema,
  type RoleExperience,
} from "../schemas/experience.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type {
  ParsedResume,
  ParsedRole,
  GeneratedRole,
} from "../schemas/pipeline.js";
import type { SnapshotStore } from "../observability/debug.js";

// ── Strict App-Side Schemas (§4 two-layer approach) ────────────
// These are NOT sent to the LLM. They validate LLM output app-side.

const StrictSummarySchema = z.object({
  summary: z
    .string()
    .min(50, "Summary too short")
    .max(1000, "Summary too long"),
});

const StrictExperienceBulletSchema = z.object({
  text: z.string().min(15, "Bullet too short").max(250, "Bullet too long (max 250 chars for scannability)"),
  technologies: z.array(z.string()),
});

const StrictRoleSchema = z.object({
  roleTitle: z.string().min(1),
  company: z.string().min(1),
  bullets: z
    .array(StrictExperienceBulletSchema)
    .min(1, "Role must have at least 1 bullet"),
});

const StrictExperienceSchema = z.object({
  roles: z.array(StrictRoleSchema).min(1, "Must have at least 1 role"),
});

// ── Summary Generator ──────────────────────────────────────────

export async function generateSummary(
  currentSummary: string,
  jd: JDAnalysis,
  experienceLevel: string,
  snapshotStore?: SnapshotStore,
): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  const prompt = `Rewrite this resume summary for a ${jd.position} role at ${jd.company}.

CURRENT SUMMARY:
${currentSummary}

JD CONTEXT:
- Domain: ${jd.domainFocus}
- Required Skills: ${jd.requiredSkills.join(", ")}
- Key Responsibilities: ${jd.keyResponsibilities.slice(0, 5).join("; ")}
- Experience Level: ${experienceLevel}

RULES:
- 2-3 sentences MAXIMUM. Keep it punchy and scannable — recruiters spend 6 seconds on a resume.
- First sentence: who you are + years of experience + core domain
- Second sentence: 3-5 most relevant technical skills from the JD (not a laundry list)
- Optional third sentence: one standout achievement or differentiator
- Must signal strong fit for this exact position
- Mirror the JD's language and priorities
- Do NOT list every skill — that's what the Skills section is for
- Do NOT use generic filler phrases
- Do NOT start with "Results-driven" or "Highly motivated"
- Return plain text.
- DO NOT use any raw LaTeX formatting (e.g. \\textbf{}, \\textit{}).
- DO NOT use unescaped special characters that break LaTeX (e.g. %, $, &, #, _). Either spell them out (e.g. "percent", "USD") or escape them properly.

Return the summary as a single string.`;

  const result = await callLLM({
    model: models.generation,
    schema: SummaryOutputSchema,
    prompt,
    stage: "summary-generator",
    snapshotStore,
  });

  // Strict app-side validation (loose schema was used for LLM compatibility)
  const parsed = StrictSummarySchema.safeParse(result.object);
  if (!parsed.success) {
    console.warn(
      `[summary-generator] Strict validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}. Using LLM output as-is.`,
    );
  }

  return {
    summary: result.object.summary,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

// ── Experience Generator ───────────────────────────────────────

export async function generateExperience(
  roles: ParsedRole[],
  jd: JDAnalysis,
  experienceLevel: string,
  userInfo?: string,
  snapshotStore?: SnapshotStore,
): Promise<{
  roles: GeneratedRole[];
  inputTokens: number;
  outputTokens: number;
}> {
  // Build a single call with all roles (they share JD context)
  const rolesContext = roles
    .map((role, i) => {
      const lines = role.heading.split("\n").filter((l) => l.trim());
      return `ROLE ${i + 1}:
Heading: ${lines.join(" | ")}
Current Bullets:
${role.bullets.map((b, j) => `  ${j + 1}. ${b}`).join("\n")}`;
    })
    .join("\n\n");

  const prompt = `Rewrite these experience bullets for a ${jd.position} role at ${jd.company}.

${rolesContext}

JD CONTEXT:
- Position: ${jd.position} at ${jd.company}
- Domain: ${jd.domainFocus}
- Required Skills: ${jd.requiredSkills.join(", ")}
- Preferred Skills: ${jd.preferredSkills.join(", ")}
- Key Responsibilities: ${jd.keyResponsibilities.join("; ")}
- Experience Level: ${experienceLevel}
- Key Phrases to Mirror: ${jd.keyPhrases.join(", ")}

HARD CONSTRAINTS:
- Keep the SAME number of bullets per role (do not add or remove)
- Every bullet must contain: technical action + tools/frameworks + measurable or clearly defined outcome
- Mirror JD language and technical stack naturally
- Weave as many required and preferred skills from the JD into bullets as possible, where truthful
- Use the EXACT technology names from the JD (e.g. if JD says "AWS", write "AWS" not "cloud services")
- Do NOT fabricate experience or invent unrealistic achievements
- Do NOT modify project details
- Use realistic metrics (10-50% improvements, not 10x claims)
- Avoid generic phrasing: "Responsible for", "Worked on", "Helped with"


WRITING STYLE — NON-NEGOTIABLE:
1. VERB DIVERSITY: Use at least 6 different opening verbs across all bullets
   Good: Built, Tackled, Migrated, Reduced, Configured, Collaborated on, Debugged, Shipped
2. SENTENCE SHAPE VARIETY: Mix these patterns (use at least 3 different ones):
   - Action-first: "Built the caching layer using Redis..."
   - Impact-first: "Reduced deploy time from 2hrs to 15min by..."
   - Context-first: "As part of the payments team, implemented..."
   - Problem-first: "Identified recurring OOM errors, profiled the JVM heap and..."
3. BULLET LENGTH — HARD LIMIT (NON-NEGOTIABLE):
   - SHORT bullets: 10-18 words. Punchy, single-clause. Use for minor wins. ~30% of bullets.
   - MEDIUM bullets: 20-30 words. Action + tech + outcome in one sentence. ~60% of bullets.
   - LONG bullets: 31-35 words MAXIMUM. Only for complex achievements. ~10% of bullets.
   - NEVER exceed 35 words or 220 characters per bullet. If a bullet is longer, split the outcome into a tighter phrase.
   - ATS parsers may truncate after ~200 characters. Front-load the keyword and metric.
4. LEVEL-APPROPRIATE VOCABULARY:
   - Entry-level: built, fixed, wrote, configured, tested, debugged, shipped
   - Mid-level: designed, refactored, optimized, led, mentored, proposed, migrated
   - Senior: architected, established, drove adoption, defined standards
5. NOT EVERY BULLET NEEDS A METRIC: 60-80% should have metrics. The rest show qualitative impact.

CRITICAL FORMATTING CONSTRAINTS:
- DO NOT use any raw LaTeX formatting (e.g. \\textbf{}, \\textit{}).
- Use symbols naturally (%, $, etc.) — they will be escaped automatically.
- DO NOT spell out symbols as words (write "30%" not "30 percent", write "$5M" not "5 million USD").
- DO NOT use em dashes (—) or en dashes (–) in your output. Use commas or semicolons to separate clauses.
- Return plain text.

Return a JSON object with \`roles\` array. Each role has \`roleTitle\`, \`company\`, and \`bullets\` (array of objects with \`text\` and \`technologies\`).`;

  const result = await callLLM({
    model: models.generation,
    schema: ExperienceOutputSchema,
    prompt,
    stage: "experience-generator",
    snapshotStore,
  });

  // Strict app-side validation (loose schema was used for LLM compatibility)
  const parsed = StrictExperienceSchema.safeParse(result.object);
  if (!parsed.success) {
    console.warn(
      `[experience-generator] Strict validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}. Proceeding with LLM output.`,
    );
  }

  return {
    roles: result.object.roles.map((r) => ({
      roleTitle: r.roleTitle,
      company: r.company,
      bullets: r.bullets.map((b) => b.text),
    })),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

// ── Per-Role Experience Generator (stricter quality, higher cost) ──

export async function generateExperiencePerRole(
  roles: ParsedRole[],
  jd: JDAnalysis,
  experienceLevel: string,
  userInfo?: string,
  snapshotStore?: SnapshotStore,
): Promise<{
  roles: GeneratedRole[];
  inputTokens: number;
  outputTokens: number;
}> {
  let totalIn = 0;
  let totalOut = 0;
  const generatedRoles: GeneratedRole[] = [];

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const lines = role.heading.split("\n").filter((l) => l.trim());

    const prompt = `Rewrite these experience bullets for a ${jd.position} role at ${jd.company}.

ROLE:
Heading: ${lines.join(" | ")}
Current Bullets:
${role.bullets.map((b, j) => `  ${j + 1}. ${b}`).join("\n")}

JD CONTEXT:
- Position: ${jd.position} at ${jd.company}
- Domain: ${jd.domainFocus}
- Required Skills: ${jd.requiredSkills.join(", ")}
- Preferred Skills: ${jd.preferredSkills.join(", ")}
- Key Responsibilities: ${jd.keyResponsibilities.join("; ")}
- Experience Level: ${experienceLevel}
- Key Phrases to Mirror: ${jd.keyPhrases.join(", ")}

HARD CONSTRAINTS:
- Keep the SAME number of bullets (${role.bullets.length} bullets)
- Every bullet must contain: technical action + tools/frameworks + measurable or clearly defined outcome
- Mirror JD language and technical stack naturally
- Do NOT fabricate experience or invent unrealistic achievements
- Do NOT modify project details
- Use realistic metrics (10-50% improvements, not 10x claims)
- Avoid generic phrasing: "Responsible for", "Worked on", "Helped with"

WRITING STYLE — NON-NEGOTIABLE:
1. VERB DIVERSITY: Use at least ${Math.min(6, role.bullets.length)} different opening verbs
2. Mix sentence shapes: action-first, impact-first, context-first, problem-first
3. BULLET LENGTH — HARD LIMIT (NON-NEGOTIABLE):
   - SHORT bullets: 10-18 words. Punchy, single-clause. Use for minor wins. ~30% of bullets.
   - MEDIUM bullets: 20-30 words. Action + tech + outcome in one sentence. ~60% of bullets.
   - LONG bullets: 31-35 words MAXIMUM. Only for complex achievements. ~10% of bullets.
   - NEVER exceed 35 words or 220 characters per bullet. If a bullet is longer, split the outcome into a tighter phrase.
   - ATS parsers may truncate after ~200 characters. Front-load the keyword and metric.
4. 60-80% should have metrics. The rest show qualitative impact.

CRITICAL FORMATTING CONSTRAINTS:
- DO NOT use any raw LaTeX formatting (e.g. \\textbf{}, \\textit{}).
- Use symbols naturally (%, $, etc.) — they will be escaped automatically.
- DO NOT spell out symbols as words (write "30%" not "30 percent").
- DO NOT use em dashes (—) or en dashes (–). Use commas or semicolons.
- Return plain text.

Return a JSON object with \`roles\` array containing exactly 1 role with \`roleTitle\`, \`company\`, and \`bullets\` (array of objects with \`text\` and \`technologies\`).`;

    const result = await callLLM({
      model: models.generation,
      schema: ExperienceOutputSchema,
      prompt,
      stage: `experience-generator-role-${i + 1}`,
      snapshotStore,
    });

    const generated = result.object.roles[0];
    if (generated) {
      generatedRoles.push({
        roleTitle: generated.roleTitle,
        company: generated.company,
        bullets: generated.bullets.map((b) => b.text),
      });
    } else {
      // Fallback: keep original bullets
      generatedRoles.push({
        roleTitle: "",
        company: "",
        bullets: role.bullets,
      });
    }

    totalIn += result.inputTokens;
    totalOut += result.outputTokens;
  }

  return {
    roles: generatedRoles,
    inputTokens: totalIn,
    outputTokens: totalOut,
  };
}
