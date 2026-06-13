// src/stages/impact-lift.ts
// Stage 4b: Impact-lift loop — raises weak/medium experience bullets to an
// impact-led (X→Y) bar by feeding the deterministic detector's own per-bullet
// suggestions back to the LLM. Iterates up to maxImpactPasses until every role
// reaches targetStrongRatio. Accepts ONLY strict improvements (new strength rank
// > old) that stay credible and never weave forbidden tech.

import { z } from "zod";
import { models as defaultModels } from "../config/models.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { LanguageModel } from "ai";
import type {
  GeneratedSections,
  GeneratedRole,
  PipelineConfig,
} from "../schemas/pipeline.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { SnapshotStore } from "../observability/debug.js";
import type { CandidateTechProfile } from "./tech-stack-extractor.js";
import {
  profileRoleImpact,
  analyzeBullet,
  classifyStrength,
  scoreBulletImpact,
  detectSignals,
  type ImpactStrength,
  type RoleImpactProfile,
} from "../impact/detector.js";
import { buildTechWeaveBlock, intersectSkills } from "./section-generators.js";
import { keywordExistsInText } from "../validation/utils/word-boundary.js";

const ImpactLiftSchema = z.object({
  repairedBullets: z.array(
    z.object({
      roleIndex: z.number(),
      bulletIndex: z.number(),
      text: z.string().min(15),
    }),
  ),
});

// ── Pure helpers (unit-tested) ──────────────────────────────────

const STRENGTH_RANK: Record<ImpactStrength, number> = {
  none: 0,
  weak: 1,
  medium: 2,
  strong: 3,
};

export interface LiftTarget {
  roleIndex: number;
  bulletIndex: number;
  text: string;
  suggestion?: string;
  category: string;
}

/** Fraction of a role's bullets classified "strong" (1.0 for an empty role). */
export function strongRatio(profile: RoleImpactProfile): number {
  const total = profile.bullets.length;
  return total > 0 ? profile.distribution.strong / total : 1;
}

/**
 * Non-strong bullets from roles that are BELOW the target strong-ratio.
 * Roles already meeting the bar are left untouched.
 */
export function selectWeakBullets(
  profiles: RoleImpactProfile[],
  targetStrongRatio: number,
): LiftTarget[] {
  const targets: LiftTarget[] = [];
  profiles.forEach((profile, roleIndex) => {
    if (strongRatio(profile) >= targetStrongRatio) return;
    profile.bullets.forEach((b, bulletIndex) => {
      if (b.strength !== "strong") {
        targets.push({
          roleIndex,
          bulletIndex,
          text: b.text,
          suggestion: b.suggestion,
          category: b.category,
        });
      }
    });
  });
  return targets;
}

function strengthOf(text: string, jdKeywords: string[]): ImpactStrength {
  return classifyStrength(scoreBulletImpact(detectSignals(text, jdKeywords)));
}

/**
 * Accept a rewrite only if it strictly raises the impact strength AND stays
 * credible (no 10x / executive-language flags). Regressions and equal-strength
 * rewrites are rejected so the loop never degrades a bullet.
 */
export function shouldAccept(
  oldText: string,
  newText: string,
  jdKeywords: string[],
  level: "entry" | "mid" | "senior",
): boolean {
  // Hard reject inflated multipliers (10x and above). The detector's credibility
  // check only flags 20x+, but our aggressive-but-realistic stance bans 10x.
  if (/\b\d{2,}x\b/i.test(newText)) return false;
  const oldStrength = strengthOf(oldText, jdKeywords);
  const analysis = analyzeBullet(newText, jdKeywords, level);
  if (!analysis.credibility.plausible) return false;
  return STRENGTH_RANK[analysis.strength] > STRENGTH_RANK[oldStrength];
}

/** True if the text literally mentions any forbidden (un-owned) technology. */
export function mentionsForbidden(text: string, forbidden: Set<string>): boolean {
  for (const skill of forbidden) {
    if (keywordExistsInText(skill, text)) return true;
  }
  return false;
}

// ── Prompt ──────────────────────────────────────────────────────

function buildImpactPrompt(
  targets: LiftTarget[],
  roles: GeneratedRole[],
  jd: JDAnalysis,
  experienceLevel: string,
  techWeaveBlock: string,
): string {
  const targetBlock = targets
    .map((t) => {
      const role = roles[t.roleIndex];
      const coaching = t.suggestion ? `\n  Coaching: ${t.suggestion}` : "";
      return `ROLE ${t.roleIndex} (${role?.roleTitle ?? ""}), BULLET ${t.bulletIndex} [${t.category}]:
  Current: "${t.text}"${coaching}`;
    })
    .join("\n\n");

  return `You are an expert resume writer making bullets IMPACT-LED. Each bullet below scored
below the impact bar. Rewrite each into the X→Y structure:

  [Strong action verb] + [what you did] + [tech/how] → [quantified outcome]

Example: "Cut checkout API p99 latency 38% by adding a Redis cache to the Spring Boot service."

RULES:
- Every rewrite MUST end in a measurable result (%, time, scale, count, or $).
- Where the current bullet has no number, INVENT a realistic improvement in the 10-50% range.
  NEVER use 10x, "10x", or absolute 100% claims, and avoid executive language
  ("single-handedly", "revolutionized").
- Preserve the core project, domain, and any advanced architecture already present.
- Keep each bullet 15-28 words. Use a DIFFERENT opening verb from neighbouring bullets.
- Position: ${jd.position} at ${jd.company} | Domain: ${jd.domainFocus} | Level: ${experienceLevel}
${techWeaveBlock}
FORMATTING:
- Plain text only. No raw LaTeX (\\textbf{}, etc.). Use %, $ naturally (auto-escaped later).
- No em dashes or en dashes; use commas or semicolons.
- Write "30%" not "30 percent".

BULLETS TO REWRITE:
${targetBlock}

Return JSON: { "repairedBullets": [ { "roleIndex": number, "bulletIndex": number, "text": string } ] }
Include an entry for EVERY bullet above. Do not add or remove bullets.`;
}

// ── Main loop ───────────────────────────────────────────────────

export interface ImpactLiftResult {
  sections: GeneratedSections;
  inputTokens: number;
  outputTokens: number;
  passes: number;
  liftedCount: number;
}

export async function liftImpact(
  sections: GeneratedSections,
  jd: JDAnalysis,
  experienceLevel: string,
  candidateTech: CandidateTechProfile | undefined,
  config: PipelineConfig,
  snapshotStore?: SnapshotStore,
  models?: Record<string, LanguageModel>,
): Promise<ImpactLiftResult> {
  const mdl = models ?? defaultModels;
  const jdKeywords = [...jd.requiredSkills, ...jd.preferredSkills];
  const level = jd.experienceLevel ?? "mid";
  const target = config.constraints.targetStrongRatio;
  const maxPasses = config.constraints.maxImpactPasses;

  const techWeaveBlock = buildTechWeaveBlock(jd, candidateTech);
  const forbiddenSet = new Set(
    intersectSkills(jdKeywords, candidateTech).forbidden.map((s) => s.toLowerCase()),
  );

  const roles: GeneratedRole[] = sections.experience.map((r) => ({
    ...r,
    bullets: [...r.bullets],
  }));

  let inputTokens = 0;
  let outputTokens = 0;
  let passes = 0;
  let liftedCount = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    const profiles = roles.map((r, i) =>
      profileRoleImpact(r.roleTitle || `Role ${i}`, r.bullets, jdKeywords, level),
    );

    if (profiles.every((p) => strongRatio(p) >= target)) break;

    const targets = selectWeakBullets(profiles, target);
    if (targets.length === 0) break;

    passes++;
    const prompt = buildImpactPrompt(targets, roles, jd, experienceLevel, techWeaveBlock);

    let result;
    try {
      result = await callLLM({
        model: mdl.repair,
        schema: ImpactLiftSchema,
        prompt,
        stage: `impact-lift-pass-${pass + 1}`,
        snapshotStore,
      });
    } catch (e) {
      console.warn(
        `[impact-lift] pass ${pass + 1} LLM call failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      break;
    }

    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;

    let acceptedThisPass = 0;
    for (const fix of result.object.repairedBullets) {
      const role = roles[fix.roleIndex];
      if (!role || fix.bulletIndex < 0 || fix.bulletIndex >= role.bullets.length) continue;

      const oldText = role.bullets[fix.bulletIndex];
      if (mentionsForbidden(fix.text, forbiddenSet)) continue;
      if (shouldAccept(oldText, fix.text, jdKeywords, level)) {
        role.bullets[fix.bulletIndex] = fix.text;
        acceptedThisPass++;
        liftedCount++;
      }
    }

    const ratios = roles
      .map((r, i) =>
        strongRatio(profileRoleImpact(r.roleTitle || `Role ${i}`, r.bullets, jdKeywords, level)),
      )
      .map((x) => Math.round(x * 100));
    console.log(
      `[impact-lift] pass ${pass + 1}: lifted ${acceptedThisPass}/${targets.length} bullets, strong ratio per role: [${ratios.join(", ")}]%`,
    );

    if (acceptedThisPass === 0) break; // no progress — stop spending tokens
  }

  return {
    sections: { ...sections, experience: roles },
    inputTokens,
    outputTokens,
    passes,
    liftedCount,
  };
}
