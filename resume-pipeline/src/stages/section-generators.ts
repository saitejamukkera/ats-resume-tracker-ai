// src/stages/section-generators.ts
// Stage 3: Summary + Experience generators.
// Each section gets a focused prompt. Experience roles run in parallel.
// Two-layer Zod: loose schema for LLM output, strict app-side validation after.

import { z } from "zod";
import { models as defaultModels } from "../config/models.js";
import { SummaryOutputSchema } from "../schemas/summary.js";
import {
  ExperienceOutputSchema,
  type RoleExperience,
} from "../schemas/experience.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { LanguageModel } from "ai";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type {
  ParsedResume,
  ParsedRole,
  GeneratedRole,
} from "../schemas/pipeline.js";
import type { SnapshotStore } from "../observability/debug.js";
import type { CandidateTechProfile } from "./tech-stack-extractor.js";

// ── Strict App-Side Schemas (§4 two-layer approach) ────────────
// These are NOT sent to the LLM. They validate LLM output app-side.

const StrictSummarySchema = z.object({
  summary: z
    .string()
    .min(50, "Summary too short")
    .max(1000, "Summary too long"),
});

const StrictExperienceBulletSchema = z.object({
  text: z.string().min(15, "Bullet too short").max(500, "Bullet too long"),
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
  models?: Record<string, LanguageModel>,
): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  const mdl = models ?? defaultModels;
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
    model: mdl.generation,
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
  candidateTech?: CandidateTechProfile,
  snapshotStore?: SnapshotStore,
  models?: Record<string, LanguageModel>,
): Promise<{
  roles: GeneratedRole[];
  inputTokens: number;
  outputTokens: number;
}> {
  const mdl = models ?? defaultModels;
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

  const techWeaveBlock = buildTechWeaveBlock(jd, candidateTech);

  const prompt = `Rewrite these experience bullets for a ${jd.position} role at ${jd.company}.

${rolesContext}

JD CONTEXT:
- Position: ${jd.position} at ${jd.company}
- Domain: ${jd.domainFocus}
- Key Responsibilities: ${jd.keyResponsibilities.join("; ")}
- Experience Level: ${experienceLevel}
- Key Phrases to Mirror: ${jd.keyPhrases.join(", ")}
${techWeaveBlock}
HARD CONSTRAINTS:
- You are explicitly authorized to weave the technologies listed in the "AUTHORIZED TECHNOLOGIES TO WEAVE" section.
- Under NO circumstances should you mention, weave, or fabricate experience with the technologies listed in the "FORBIDDEN / UNAUTHORIZED TECHNOLOGIES" section.
- IMPACT-DRIVEN WEAVING: Do not insert technologies randomly or as a laundry list at the end of a bullet. Weave them naturally alongside measurable engineering achievements, performance metrics, or software engineering problems solved.
- BULLET COUNT FLEXIBILITY: You are allowed to add, combine, or adjust bullets per job experience if it improves readability and quality. Do not adhere to a strict 1-to-1 match if it hampers logical flow.
- WORD LENGTH & STUFFING PROTECTION: Maintain the optimal word limit of 15-25 words per bullet. If adding a technology increases sentence length or creates a run-on sentence, you MUST proactively trim filler words, verbose phrasing, or secondary details from the original bullet text to keep it tight, punchy, and short. Do not overstuff.
- PRESERVE ADVANCED IDENTITY: Do NOT dilute advanced architectural terminology (e.g., OpenTelemetry, Resilience4j, DTO patterns, Testcontainers) from the original bullets. Weave authorized JD keywords around these core achievements rather than overwriting them.
- Use the EXACT technology names from the JD (e.g. if JD says "AWS", write "AWS" not "cloud services")
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
3. BULLET LENGTH VARIATION: Mix short (10-15 words) and long (25-35 words) bullets
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

CRITICAL: Return a JSON object with exactly ${roles.length} roles in the \`roles\` array. Each role must have \`roleTitle\`, \`company\`, and \`bullets\` (array of objects with \`text\` and \`technologies\`). DO NOT omit any roles.`;

  const result = await callLLM({
    model: mdl.generation,
    schema: ExperienceOutputSchema,
    prompt,
    maxTokens: 2500, // Allow sufficient room for all roles + bullets
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

  // Diagnostic logging before transformation
  console.debug(
    `[experience-generator] LLM returned: roles=${result.object?.roles?.length ?? "undefined"}, roles_type=${typeof result.object?.roles}`,
  );
  if (result.object?.roles) {
    result.object.roles.slice(0, 2).forEach((r, i) => {
      console.debug(
        `[experience-generator] Role ${i}: title="${r?.roleTitle}", bullets_count=${r?.bullets?.length ?? "undefined"}, bullets_type=${typeof r?.bullets}`,
      );
    });
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
  candidateTech?: CandidateTechProfile,
  snapshotStore?: SnapshotStore,
  models?: Record<string, LanguageModel>,
): Promise<{
  roles: GeneratedRole[];
  inputTokens: number;
  outputTokens: number;
}> {
  const mdl = models ?? defaultModels;
  let totalIn = 0;
  let totalOut = 0;
  const generatedRoles: GeneratedRole[] = [];

  const techWeaveBlock = buildTechWeaveBlock(jd, candidateTech);

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
- Key Responsibilities: ${jd.keyResponsibilities.join("; ")}
- Experience Level: ${experienceLevel}
- Key Phrases to Mirror: ${jd.keyPhrases.join(", ")}
${techWeaveBlock}
HARD CONSTRAINTS:
- You are explicitly authorized to weave the technologies listed in the "AUTHORIZED TECHNOLOGIES TO WEAVE" section.
- Under NO circumstances should you mention, weave, or fabricate experience with the technologies listed in the "FORBIDDEN / UNAUTHORIZED TECHNOLOGIES" section.
- IMPACT-DRIVEN WEAVING: Do not insert technologies randomly or as a laundry list at the end of a bullet. Weave them naturally alongside measurable engineering achievements, performance metrics, or software engineering problems solved.
- BULLET COUNT FLEXIBILITY: You are allowed to add, combine, or adjust bullets per job experience if it improves readability and quality. Do not adhere to a strict 1-to-1 match if it hampers logical flow.
- WORD LENGTH & STUFFING PROTECTION: Maintain the optimal word limit of 15-25 words per bullet. If adding a technology increases sentence length or creates a run-on sentence, you MUST proactively trim filler words, verbose phrasing, or secondary details from the original bullet text to keep it tight, punchy, and short. Do not overstuff.
- PRESERVE ADVANCED IDENTITY: Do NOT dilute advanced architectural terminology (e.g., OpenTelemetry, Resilience4j, DTO patterns, Testcontainers) from the original bullets. Weave authorized JD keywords around these core achievements rather than overwriting them.
- Use the EXACT technology names from the JD (e.g. if JD says "AWS", write "AWS" not "cloud services")
- Do NOT modify project details
- Use realistic metrics (10-50% improvements, not 10x claims)
- Avoid generic phrasing: "Responsible for", "Worked on", "Helped with"

WRITING STYLE — NON-NEGOTIABLE:
1. VERB DIVERSITY: Use at least ${Math.min(6, role.bullets.length)} different opening verbs
2. Mix sentence shapes: action-first, impact-first, context-first, problem-first
3. BULLET LENGTH VARIATION: Mix short (10-15 words) and long (25-35 words) bullets
4. 60-80% should have metrics. The rest show qualitative impact.

CRITICAL FORMATTING CONSTRAINTS:
- DO NOT use any raw LaTeX formatting (e.g. \\textbf{}, \\textit{}).
- Use symbols naturally (%, $, etc.) — they will be escaped automatically.
- DO NOT spell out symbols as words (write "30%" not "30 percent").
- DO NOT use em dashes (—) or en dashes (–). Use commas or semicolons.
- Return plain text.

Return a JSON object with \`roles\` array containing exactly 1 role with \`roleTitle\`, \`company\`, and \`bullets\` (array of objects with \`text\` and \`technologies\`).`;

    const result = await callLLM({
      model: mdl.generation,
      schema: ExperienceOutputSchema,
      prompt,
      stage: `experience-generator-role-${i + 1}`,
      snapshotStore,
    });

    console.debug(
      `[experience-generator-role-${i + 1}] LLM returned: roles_array_exists=${!!result.object?.roles}, roles_length=${result.object?.roles?.length ?? "undefined"}`,
    );

    const generated = result.object.roles[0];
    if (generated) {
      console.debug(
        `[experience-generator-role-${i + 1}] Generated role: title="${generated.roleTitle}", bullets=${generated.bullets?.length ?? "undefined"}`,
      );
      generatedRoles.push({
        roleTitle: generated.roleTitle,
        company: generated.company,
        bullets: generated.bullets.map((b) => b.text),
      });
    } else {
      // Fallback: keep original bullets
      console.warn(
        `[experience-generator-role-${i + 1}] Missing or empty role in LLM response! Using original ${role.bullets.length} bullets.`,
      );
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

// ── Tech Weave & Whitelist Helpers ──────────────────────────

function intersectSkills(
  jdSkills: string[],
  candidateTech?: CandidateTechProfile
): { authorized: string[]; forbidden: string[] } {
  if (!candidateTech) {
    return { authorized: jdSkills, forbidden: [] };
  }

  const authorized: string[] = [];
  const forbidden: string[] = [];

  // Combine primary and secondary technologies into a single lowercase Set
  const candidateSet = new Set(
    [...candidateTech.primary, ...candidateTech.secondary].map((s) => s.toLowerCase())
  );

  for (const skill of jdSkills) {
    const lowerSkill = skill.toLowerCase();
    let isMatched = candidateSet.has(lowerSkill);

    if (!isMatched) {
      // Check if any of the candidate's skills are variants or substrings of this JD skill
      for (const candTech of candidateSet) {
        if (lowerSkill.includes(candTech) || candTech.includes(lowerSkill)) {
          isMatched = true;
          break;
        }
      }
    }

    if (isMatched) {
      authorized.push(skill);
    } else {
      forbidden.push(skill);
    }
  }

  return { authorized, forbidden };
}

function buildTechWeaveBlock(
  jd: JDAnalysis,
  candidateTech?: CandidateTechProfile
): string {
  const jdRequired = intersectSkills(jd.requiredSkills, candidateTech);
  const jdPreferred = intersectSkills(jd.preferredSkills, candidateTech);

  const authorizedSkills = [...new Set([...jdRequired.authorized, ...jdPreferred.authorized])];
  const forbiddenSkills = [...new Set([...jdRequired.forbidden, ...jdPreferred.forbidden])];

  return `
AUTHORIZED TECHNOLOGIES TO WEAVE:
${authorizedSkills.length > 0 ? authorizedSkills.join(", ") : "None. (Only weave skills if they are present in the candidate's skills profile.)"}
(The candidate has explicit knowledge of these technologies. You are authorized to weave these naturally and contextually into the experience bullets.)

FORBIDDEN / UNAUTHORIZED TECHNOLOGIES:
${forbiddenSkills.length > 0 ? forbiddenSkills.join(", ") : "None"}
(The Job Description requests these technologies, but the candidate does NOT know them. Under NO circumstances should you mention, weave, or fabricate experience with these technologies in the rewritten bullets.)
`;
}
