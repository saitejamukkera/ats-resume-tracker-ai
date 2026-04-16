// src/validation/repair.ts
// Stage 4: Per-bullet repair loop.
// ONLY failing bullets are sent to the LLM. Passing bullets are NEVER touched.
// After each repair, individual fixes are re-validated before acceptance.

import { z } from "zod";
import { models } from "../config/models.js";
import { callLLM } from "../observability/llm-wrapper.js";
import { analyzeBullet } from "../impact/detector.js";
import type { ValidationError, GeneratedRole } from "../schemas/pipeline.js";
import type { SnapshotStore } from "../observability/debug.js";

const BulletRepairSchema = z.object({
  repairs: z.array(
    z.object({
      roleIndex: z.number(),
      bulletIndex: z.number(),
      fixedText: z.string().min(20),
    }),
  ),
});

interface RepairTarget {
  roleIndex: number;
  bulletIndex: number;
  currentText: string;
  errors: string[];
}

/**
 * Repair only the bullets that failed validation.
 * Passing bullets are held in memory and NEVER sent to the LLM.
 */
export async function repairBullets(
  roles: GeneratedRole[],
  validationErrors: ValidationError[],
  jdKeywords: string[],
  maxAttempts: number,
  snapshotStore?: SnapshotStore,
): Promise<{
  repairedRoles: GeneratedRole[];
  repairAttempts: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}> {
  let currentRoles = roles.map((r) => ({ ...r, bullets: [...r.bullets] }));
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Identify failing bullets from validation errors
  const failingBullets = identifyFailingBullets(currentRoles, validationErrors);

  if (failingBullets.length === 0) {
    return {
      repairedRoles: currentRoles,
      repairAttempts: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (failingBullets.length === 0) break;

    const prompt = buildRepairPrompt(failingBullets, jdKeywords);

    try {
      const result = await callLLM({
        model: models.repair,
        schema: BulletRepairSchema,
        prompt,
        stage: `bullet-repair-attempt-${attempt + 1}`,
        snapshotStore,
      });

      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;

      // Apply repairs and re-validate each fix individually
      const stillFailing: RepairTarget[] = [];

      for (const fix of result.object.repairs) {
        if (
          fix.roleIndex >= currentRoles.length ||
          fix.bulletIndex >= currentRoles[fix.roleIndex].bullets.length
        ) {
          continue;
        }

        // Re-validate the fixed bullet before accepting it
        const analysis = analyzeBullet(fix.fixedText, jdKeywords, "mid");
        const hasWeakPhrasing = REPAIR_PHRASING_CHECKS.some((p) =>
          p.test(fix.fixedText),
        );

        if (analysis.strength === "none" || hasWeakPhrasing) {
          // Fix didn't actually resolve the issue — keep in failing list
          const original = failingBullets.find(
            (t) =>
              t.roleIndex === fix.roleIndex &&
              t.bulletIndex === fix.bulletIndex,
          );
          if (original) {
            original.currentText = fix.fixedText; // update text for next attempt
            stillFailing.push(original);
          }
          console.log(
            `[repair] Bullet ${fix.roleIndex}-${fix.bulletIndex} still failing after attempt ${attempt + 1}`,
          );
        } else {
          // Fix passed re-validation — apply it
          currentRoles[fix.roleIndex].bullets[fix.bulletIndex] = fix.fixedText;
        }
      }

      // Update failing list to only bullets that still fail
      failingBullets.length = 0;
      failingBullets.push(...stillFailing);

      console.log(
        `[repair] Attempt ${attempt + 1}: ${stillFailing.length} bullets still failing`,
      );
    } catch (error) {
      console.error(`[repair] Attempt ${attempt + 1} failed:`, error);
      break;
    }
  }

  return {
    repairedRoles: currentRoles,
    repairAttempts: Math.min(
      maxAttempts,
      failingBullets.length > 0 ? maxAttempts : 1,
    ),
    totalInputTokens,
    totalOutputTokens,
  };
}

function identifyFailingBullets(
  roles: GeneratedRole[],
  errors: ValidationError[],
): RepairTarget[] {
  const targets: RepairTarget[] = [];
  const seen = new Set<string>();

  for (const error of errors) {
    if (error.section !== "experience" || !error.offendingContent) continue;
    if (error.severity !== "critical") continue;

    // Find which role/bullet this error belongs to
    for (let ri = 0; ri < roles.length; ri++) {
      for (let bi = 0; bi < roles[ri].bullets.length; bi++) {
        const bullet = roles[ri].bullets[bi];
        if (bullet === error.offendingContent) {
          const key = `${ri}-${bi}`;
          if (!seen.has(key)) {
            seen.add(key);
            const existingTarget = targets.find(
              (t) => t.roleIndex === ri && t.bulletIndex === bi,
            );
            const errorMsg = error.suggestion
              ? `${error.message} → FIX: ${error.suggestion}`
              : error.message;
            if (existingTarget) {
              existingTarget.errors.push(errorMsg);
            } else {
              targets.push({
                roleIndex: ri,
                bulletIndex: bi,
                currentText: bullet,
                errors: [errorMsg],
              });
            }
          }
        }
      }
    }
  }

  return targets;
}

// Phrasing patterns that indicate a bullet still needs work (subset of validator checks)
const REPAIR_PHRASING_CHECKS = [
  /^(responsible for|tasked with|duties included)/i,
  /^(helped with|assisted in|assisted with)/i,
  /^(involved in|participated in)/i,
  /various (tasks|projects|responsibilities)/i,
  /day-to-day (operations|tasks|activities)/i,
];

function buildRepairPrompt(
  targets: RepairTarget[],
  jdKeywords: string[],
): string {
  return `You are fixing specific resume bullets that failed an automated impact quality check.

The checker requires EACH bullet to have at least TWO of these signals:
1. IMPACT VERB — start with: reduced, improved, automated, streamlined, migrated, optimized, built, designed, implemented, integrated, deployed, etc.
2. NUMBER/METRIC — include a measurable result: %, time saved, count, scale (e.g. "reduced latency by 30%", "serving 10K+ requests")
3. CAUSALITY — explain HOW: "by implementing...", "using...", "through...", "via..."
4. TECH MENTION — name specific technologies from the JD

A bullet that just says "Worked on microservices" fails because it has no impact verb, no metric, and no causality.
A fixed version: "Refactored 3 microservices using Spring Boot, reducing API response time by 40%" — has impact verb (Refactored), metric (3, 40%), causality (using), and tech (Spring Boot).

JD keywords to incorporate where natural: ${jdKeywords.slice(0, 15).join(", ")}

${targets
  .map(
    (t) => `
ROLE ${t.roleIndex}, BULLET ${t.bulletIndex}:
Current (needs fixes): "${t.currentText}"
Issues:
${t.errors.map((e) => `  - ${e}`).join("\n")}
`,
  )
  .join("\n---\n")}

LENGTH CONSTRAINT (NON-NEGOTIABLE):
- Every repaired bullet must be under 35 words and 220 characters.
- Front-load the most important keyword and metric in the first 15 words.
- If the original bullet is too long, tighten it while preserving the key achievement.

CRITICAL FORMATTING:
- Do NOT start with "Responsible for", "Helped with", "Assisted in", "Involved in", "Worked on"
- Do NOT use raw LaTeX (\\textbf{}, etc.) — symbols like %, $, & are escaped automatically
- Do NOT spell out symbols as words (write "30%" not "30 percent")
- Do NOT use em dashes or en dashes. Use commas or semicolons.

Return a JSON object with a "repairs" array containing objects with:
- "roleIndex": number (the role index above)
- "bulletIndex": number (the bullet index above)  
- "fixedText": string (the corrected bullet text)

Do NOT change bullets that weren't listed above.
Do NOT add new bullets.
Fix only what's broken.`;
}
