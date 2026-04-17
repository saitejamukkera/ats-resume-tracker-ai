// src/validation/human-voice.ts
// Stage 4.8: Human Voice Scorer + Anti-AI Detection + Humanize Repair Pass.
// Scorer and risk estimator are deterministic (0 LLM calls).
// Humanize pass is reactive (1 LLM call, only when Human Voice score < threshold).

import { z } from "zod";
import { models } from "../config/models.js";
import { callLLM } from "../observability/llm-wrapper.js";
import { analyzeBullet } from "../impact/detector.js";
import type { GeneratedSections } from "../schemas/pipeline.js";
import type { SnapshotStore } from "../observability/debug.js";

// ── Human Voice Score ──────────────────────────────────────────

export interface HumanVoiceScore {
  overall: number;        // 0-100, target: 70+
  verbDiversity: number;  // 0-1 — unique opening verbs / total bullets
  lengthVariance: number; // 0-1 — normalized stdDev of bullet word counts
  metricsBalance: number; // 0-1 — penalizes both <50% AND >85% metric density
  buzzwordDensity: number; // 0-1 — inverse of flagged buzzwords per bullet
  sentencePatterns: number; // 0-1 — unique syntactic patterns / total
}

/**
 * Score how human a set of resume bullets sound.
 * 
 * Key insight from recruiter feedback:
 * - 100% metrics = AI (real engineers have qualitative wins)
 * - Uniform bullet length = AI (real work is messy — some big, some minor)
 * - Same verb repeated = AI (real humans vary their openers)
 * - Corporate buzzwords = AI (real engineers say "built" not "spearheaded")
 */
export function scoreHumanVoice(bullets: string[]): HumanVoiceScore {
  if (bullets.length === 0) {
    return {
      overall: 100,
      verbDiversity: 1,
      lengthVariance: 1,
      metricsBalance: 1,
      buzzwordDensity: 1,
      sentencePatterns: 1,
    };
  }

  // ── Verb Diversity (25% of score) ──────────────────────────
  // Extract first word of each bullet (the action verb)
  const openingVerbs = bullets.map((b) =>
    b.trim().split(/\s+/)[0].toLowerCase(),
  );
  const uniqueVerbs = new Set(openingVerbs);
  const verbDiversity =
    openingVerbs.length > 0 ? uniqueVerbs.size / openingVerbs.length : 1;
  // Bad: 3 unique verbs across 10 bullets (0.3)
  // Good: 8 unique verbs across 10 bullets (0.8)

  // ── Length Variance (20% of score) ─────────────────────────
  // Since we explicitly enforce 15-25 word bullets, they will be uniform.
  // We no longer punish this.
  const lengthVariance = 1.0;

  // ── Metrics Balance (25% of score) ─────────────────────────
  // The insight: 100% metrics = AI. 60-80% metrics = real engineer who tracks impact.
  const metricPattern =
    /\d+%|\d+x|\$[\d,]+|\d+\s*(ms|seconds|hours|days|users|requests|records|endpoints|services|APIs)/i;
  const bulletsWithMetrics = bullets.filter((b) =>
    metricPattern.test(b),
  ).length;
  const metricsRatio =
    bullets.length > 0 ? bulletsWithMetrics / bullets.length : 0;
  // Penalize both too few (<50%) AND too many (>85%)
  let metricsBalance: number;
  if (metricsRatio >= 0.5 && metricsRatio <= 0.85) {
    metricsBalance = 1.0;
  } else if (metricsRatio < 0.5) {
    metricsBalance = metricsRatio / 0.5; // linearly penalize below 50%
  } else {
    metricsBalance = 1.0 - (metricsRatio - 0.85) / 0.15; // linearly penalize above 85%
  }
  metricsBalance = Math.max(0, metricsBalance);

  // ── Buzzword Density (15% of score) ────────────────────────
  // Words that only ChatGPT uses. Real engineers don't talk like this.
  // Research-report additions flag the most-seen AI phrases in resumes.
  const buzzwords = [
    "spearheaded",
    "orchestrated",
    "pioneered",
    "revolutionized",
    "transformative",
    "cutting-edge",
    "best-in-class",
    "world-class",
    "leveraged",
    "synergized",
    "paradigm",
    "holistic",
    "robust",
    "scalable",
    "seamless",
    "state-of-the-art",
    "utilize",
    "utilization",
    "facilitate",
    "facilitated",
    "champion",
    "championed",
    // Research-report additions
    "strong analytical skills",
    "proven track record",
    "results-driven",
    "results-oriented",
    "passionate about driving",
    "exceptional",
    "innovative solutions",
    "thought leader",
  ];
  const totalBuzzwords = bullets.reduce((count, b) => {
    return (
      count + buzzwords.filter((bw) => b.toLowerCase().includes(bw)).length
    );
  }, 0);
  const buzzwordDensity =
    1 - Math.min(totalBuzzwords / (bullets.length * 0.5), 1);

  // ── Sentence Pattern Diversity (15% of score) ──────────────
  // Classify each bullet's syntactic shape
  const patterns = bullets.map(classifySentencePattern);
  const uniquePatterns = new Set(patterns);
  const sentencePatterns =
    patterns.length > 0 ? uniquePatterns.size / Math.min(patterns.length, 7) : 1;
  // Cap denominator at 7 — you can't realistically have more than 7 distinct patterns,
  // so having 5/10 bullets with unique patterns is still great diversity.

  const overall = Math.round(
    verbDiversity * 25 +
      lengthVariance * 20 +
      metricsBalance * 25 +
      buzzwordDensity * 15 +
      Math.min(sentencePatterns, 1) * 15,
  );

  return {
    overall,
    verbDiversity: Math.round(verbDiversity * 100) / 100,
    lengthVariance: Math.round(lengthVariance * 100) / 100,
    metricsBalance: Math.round(metricsBalance * 100) / 100,
    buzzwordDensity: Math.round(buzzwordDensity * 100) / 100,
    sentencePatterns: Math.round(Math.min(sentencePatterns, 1) * 100) / 100,
  };
}

// ── Sentence Pattern Classification ────────────────────────────

export type SentencePattern =
  | "context-first" // "As part of the payments team, implemented..."
  | "action-then-impact" // "Built caching layer, reducing latency by 40%"
  | "result-then-method" // "Reduced P95 latency by 35% by introducing Redis..."
  | "creation-verb" // "Built/Created/Designed/Wrote..."
  | "impact-first" // "Reduced/Improved/Increased..."
  | "team-oriented" // "Collaborated/Partnered/Mentored/Led..."
  | "other";

export function classifySentencePattern(bullet: string): SentencePattern {
  if (/^(As part of|During|In collaboration|Working with)/i.test(bullet))
    return "context-first";
  if (
    /,\s*(reducing|improving|cutting|saving|enabling|resulting|achieving|bringing|eliminating)/i.test(
      bullet,
    )
  )
    return "action-then-impact";
  if (
    /\bby\s+(\d|introducing|implementing|using|migrating|building|creating|deploying|adding|leveraging|refactoring)/i.test(
      bullet,
    )
  )
    return "result-then-method";
  if (
    /^(Built|Created|Designed|Wrote|Configured|Set up|Established|Constructed|Assembled|Authored)/i.test(
      bullet,
    )
  )
    return "creation-verb";
  if (
    /^(Reduced|Improved|Increased|Decreased|Accelerated|Eliminated|Minimized|Maximized|Cut|Halved|Doubled)/i.test(
      bullet,
    )
  )
    return "impact-first";
  if (
    /^(Collaborated|Partnered|Mentored|Led|Coordinated|Onboarded|Trained|Guided|Supervised)/i.test(
      bullet,
    )
  )
    return "team-oriented";
  return "other";
}

// ── Anti-AI Detection Risk Estimator ───────────────────────────

export interface AIDetectionResult {
  risk: "low" | "medium" | "high";
  signals: string[];
}

/**
 * Estimate how likely a recruiter or ATS system would flag these bullets as AI-generated.
 * 
 * Directly maps to recruiter complaints:
 * - "Every bullet starts with an impressive action verb" → verb repetition
 * - "Bullets suspiciously balanced in length" → length uniformity
 * - "The tone is identical throughout" → pattern uniformity
 * - "Use of 'impressive' buzzwords" → AI-favorite words
 * - "Everything gets equal real estate" → 100% metric density
 */
export function estimateAIDetectionRisk(
  bullets: string[],
): AIDetectionResult {
  if (bullets.length === 0) return { risk: "low", signals: [] };

  const signals: string[] = [];

  // 1. Verb repetition — any verb used >2 times is a red flag
  const verbs = bullets.map((b) => b.trim().split(/\s+/)[0].toLowerCase());
  const verbCounts = new Map<string, number>();
  verbs.forEach((v) => verbCounts.set(v, (verbCounts.get(v) || 0) + 1));
  const maxVerbRepeat = Math.max(...verbCounts.values());
  if (maxVerbRepeat > 2) {
    const repeatedVerb = [...verbCounts.entries()].find(
      ([, c]) => c === maxVerbRepeat,
    )?.[0];
    signals.push(
      `Verb "${repeatedVerb}" used ${maxVerbRepeat} times — vary your openers`,
    );
  }

  // 2. Bullet length uniformity — stdDev-based (matches Human Voice scorer)
  // Check removed because 1-1.5 line (15-25 word) enforcement guarantees uniformity.

  // 3. AI-favorite buzzwords — >2 total is suspicious.
  // Research-report additions: the phrases below are the most frequently
  // observed tells in ChatGPT/Claude-drafted resumes and recruiter surveys.
  const aiWords = [
    "utilize",
    "leverage",
    "spearhead",
    "spearheaded",
    "orchestrate",
    "orchestrated",
    "cutting-edge",
    "robust",
    "seamless",
    "holistic",
    "synergy",
    "synergized",
    "paradigm",
    "pioneered",
    "revolutionized",
    "champion",
    "championed",
    "facilitated",
    "best-in-class",
    "world-class",
    "state-of-the-art",
    // Research-report additions
    "strong analytical skills",
    "proven track record",
    "results-driven",
    "results driven",
    "results-oriented",
    "dynamic solutions",
    "passionate about driving",
    "passionate about delivering",
    "exceptional",
    "innovative solutions",
    "thought leader",
    "transformative",
    "highly motivated",
  ];
  const aiWordCount = bullets.reduce(
    (c, b) =>
      c + aiWords.filter((w) => b.toLowerCase().includes(w)).length,
    0,
  );
  if (aiWordCount > 2) {
    signals.push(
      `${aiWordCount} AI-favorite buzzwords detected — use plain engineering language`,
    );
  }

  // 4. Pattern uniformity — ≤2 unique sentence patterns across all bullets
  const patterns = bullets.map(classifySentencePattern);
  const uniquePatterns = new Set(patterns);
  if (uniquePatterns.size <= 2 && bullets.length >= 4) {
    signals.push(
      `Only ${uniquePatterns.size} sentence patterns — extremely uniform (${[...uniquePatterns].join(", ")})`,
    );
  }

  // 5. 100% metrics — every single bullet has a number/percentage
  const metricBullets = bullets.filter((b) =>
    /\d+%|\d+x|\$[\d,]+|\d+\s*(K|M|B)\b/i.test(b),
  ).length;
  if (metricBullets === bullets.length && bullets.length >= 4) {
    signals.push(
      "100% of bullets have metrics — unnatural. Real work includes qualitative wins too",
    );
  }

  // 6. Formal vagueness — bullets that are polished but say nothing specific
  const vaguePhrases = [
    "cross-functional stakeholders",
    "drive alignment",
    "key deliverables",
    "strategic initiatives",
    "business objectives",
    "modern cloud technologies",
    "scalable solutions",
    "key performance",
    "best practices",
    "industry-leading",
  ];
  const vagueCount = bullets.reduce(
    (c, b) =>
      c +
      vaguePhrases.filter((p) => b.toLowerCase().includes(p)).length,
    0,
  );
  if (vagueCount > 1) {
    signals.push(
      `${vagueCount} vague corporate phrases — replace with specific technologies and outcomes`,
    );
  }

  const risk: AIDetectionResult["risk"] =
    signals.length === 0
      ? "low"
      : signals.length <= 2
        ? "medium"
        : "high";

  return { risk, signals };
}

// ── Humanize Repair Pass (LLM) ─────────────────────────────────

const HumanizeRepairSchema = z.object({
  repairedBullets: z.array(
    z.object({
      roleIndex: z.number(),
      bulletIndex: z.number(),
      text: z.string().min(10),
    }),
  ),
});

/**
 * Rewrite bullets that sound too AI-generated.
 * Uses the diagnostic data from scoreHumanVoice() and estimateAIDetectionRisk()
 * to give the LLM SPECIFIC, targeted instructions on what to fix.
 *
 * Only called when Human Voice score < HUMANIZE_THRESHOLD (default: 60).
 * Costs 1 LLM call.
 */
export async function humanizePass(
  sections: GeneratedSections,
  voiceScore: HumanVoiceScore,
  aiSignals: string[],
  experienceLevel: string,
  jdKeywords: string[],
  snapshotStore?: SnapshotStore,
): Promise<{
  sections: GeneratedSections;
  inputTokens: number;
  outputTokens: number;
}> {
  // Build the bullet map for the LLM
  const bulletMap = sections.experience
    .map((role, ri) => {
      return role.bullets.map((b, bi) => `  [${ri}-${bi}] ${b}`).join("\n");
    })
    .join("\n");

  // ── Always check for verb repetition (the #1 AI signal) ─────
  // This runs regardless of verbDiversity score because AI detection
  // flags it even when the overall score is high.
  const issues: string[] = [];
  const allBullets = sections.experience.flatMap((r) => r.bullets);
  const allVerbs = allBullets.map((b) => b.trim().split(/\s+/)[0].toLowerCase());
  const verbCounts = new Map<string, number>();
  allVerbs.forEach((v) => verbCounts.set(v, (verbCounts.get(v) || 0) + 1));
  const repeatedVerbs = [...verbCounts.entries()].filter(([, c]) => c > 2);

  if (repeatedVerbs.length > 0) {
    // Find exact bullet positions for each repeated verb
    const verbInstructions = repeatedVerbs
      .map(([verb, count]) => {
        // Find which bullets start with this verb
        const positions: string[] = [];
        let bulletIdx = 0;
        for (let ri = 0; ri < sections.experience.length; ri++) {
          for (let bi = 0; bi < sections.experience[ri].bullets.length; bi++) {
            const bVerb = sections.experience[ri].bullets[bi].trim().split(/\s+/)[0].toLowerCase();
            if (bVerb === verb) {
              positions.push(`[${ri}-${bi}]`);
            }
            bulletIdx++;
          }
        }
        return `"${verb}" appears ${count} times at bullets ${positions.join(", ")}. Keep it in at most 1 bullet. Change the opening verb in the others.`;
      })
      .join("\n   ");

    // Build avoid list — verbs already used, so the LLM doesn't swap into another collision
    const usedVerbs = [...verbCounts.keys()].filter((v) => verbCounts.get(v)! >= 1);
    const suggestedVerbs = [
      "built", "designed", "developed", "created", "configured",
      "migrated", "automated", "resolved", "optimized", "streamlined",
      "refactored", "consolidated", "integrated", "eliminated", "established",
      "wrote", "owned", "architected", "introduced", "delivered",
    ].filter((v) => !usedVerbs.includes(v));

    issues.push(
      `VERB REPETITION (CRITICAL — fix this first):\n   ${verbInstructions}\n   ALREADY USED verbs (do NOT use these): ${usedVerbs.join(", ")}\n   USE THESE INSTEAD: ${suggestedVerbs.slice(0, 10).join(", ")}\n   You MUST change the opening word of the specified bullets.`,
    );
  } else if (voiceScore.verbDiversity < 0.6) {
    const repeated = [...verbCounts.entries()]
      .filter(([, c]) => c > 1)
      .map(([v, c]) => `"${v}" (${c}x)`)
      .join(", ");
    issues.push(
      `VERB REPETITION: These verbs are overused: ${repeated}. Replace repeated verbs with varied alternatives.`,
    );
  }

  // Length Uniformity removed as we force 15-25 words exclusively.

  if (voiceScore.metricsBalance < 0.7 && voiceScore.metricsBalance > 0) {
    const metricCount = allBullets.filter((b) =>
      /\d+%|\d+x|\$[\d,]+|\d+\s*(ms|seconds|hours|days|users|requests|records)/i.test(b),
    ).length;
    const ratio = metricCount / allBullets.length;
    if (ratio > 0.85) {
      issues.push(
        `TOO MANY METRICS: ${Math.round(ratio * 100)}% of bullets have numbers — looks AI-generated. Convert 2-3 bullets to show QUALITATIVE impact instead: "Improved code review culture", "Became go-to person for K8s debugging", "Wrote internal docs after onboarding exposed gaps".`,
      );
    } else if (ratio < 0.5) {
      issues.push(
        `TOO FEW METRICS: Only ${Math.round(ratio * 100)}% of bullets have numbers. ` +
        `Add concrete metrics to 2-3 more bullets. Example: "Reduced build time by 40%" or "Handled 5K+ daily API requests".`,
      );
    }
  }

  if (voiceScore.buzzwordDensity < 0.7) {
    issues.push(
      `BUZZWORD OVERLOAD: Replace corporate buzzwords with plain engineering language. "Spearheaded" → "Led" or "Built". "Orchestrated" → "Set up" or "Configured". "Leveraged" → "Used". "Cutting-edge" → just name the actual technology.`,
    );
  }

  if (voiceScore.sentencePatterns < 0.5) {
    issues.push(
      `MONOTONOUS STRUCTURE: All bullets follow the same sentence pattern. Mix in these shapes:
   - Problem-first: "Noticed recurring OOM errors, profiled JVM heap and..."
   - Context-first: "As part of the payments team, implemented..."
   - Short-declarative: "Owned the deploy pipeline. 400+ deploys/month."`,
    );
  }

  // ── Bullet length bloat detection ─────────────────────────────
  const longBullets = allBullets.filter((b) => b.split(/\s+/).length > 35);
  if (longBullets.length > allBullets.length * 0.3) {
    issues.push(
      `BULLET LENGTH BLOAT: ${longBullets.length}/${allBullets.length} bullets exceed 35 words. ` +
        `Tighten these to under 30 words. Cut filler phrases like "in order to", "as part of the effort to", ` +
        `"which resulted in". Front-load the keyword and metric. A great bullet fits on one line of a resume.`,
    );
  }

  // Add non-verb AI detection signals (verb issues already handled above with bullet indices)
  const nonVerbSignals = aiSignals.filter(
    (s) => !s.toLowerCase().includes("verb"),
  );
  if (nonVerbSignals.length > 0) {
    issues.push(
      `AI DETECTION SIGNALS: ${nonVerbSignals.join(". ")}`,
    );
  }

  if (issues.length === 0) {
    // Shouldn't happen (function only called when score < 60), but safety check
    return { sections, inputTokens: 0, outputTokens: 0 };
  }

  const maxRewrites = Math.ceil(allBullets.length * 0.3);

  const prompt = `You are a resume writing expert. The following resume bullets were scored ${voiceScore.overall}/100 on "human voice" quality, meaning they sound too AI-generated. Recruiters WILL flag these.

CANDIDATE LEVEL: ${experienceLevel}

CURRENT BULLETS:
${bulletMap}

SPECIFIC ISSUES TO FIX:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n\n")}

RULES:
- Rewrite AT MOST ${maxRewrites} bullets in this pass. Focus on the bullets with the worst issues first.
- ONLY rewrite bullets that have the identified issues. Do NOT touch bullets that are already good.
- VERB COLLISION PREVENTION: Before choosing a new opening verb, check that no other bullet (including ones you already rewrote in this response) starts with the same verb. Every opening verb must be unique across the entire resume.
- PRESERVE IMPACT SIGNALS (NON-NEGOTIABLE): Do NOT rephrase or remove before→after comparisons (e.g. "from 850ms to 500ms", "from 65% to 90%"), explicit percentage improvements (e.g. "by 40%"), or before/after numbers. These are high-value ATS and impact signals. If a bullet contains one, you may only change the opening verb or surrounding context — keep the numbers and the "from X to Y" pattern word-for-word.
- Do NOT change any facts, technologies, projects, or metrics — only rephrase
- Do NOT add new metrics or make up technical details
- Make it sound like a real ${experienceLevel} engineer wrote this, not ChatGPT
- Keep the same meaning — just change the sentence structure, verb choice, and phrasing
- PRESERVE these JD keywords in every bullet that currently contains them: ${jdKeywords.slice(0, 20).join(", ")}
- Do NOT rephrase or remove technology names, framework names, or domain terms
- Every rewritten bullet must be under 35 words and 220 characters
- DO NOT use raw LaTeX formatting (e.g. \\textbf{}, \\textit{})
- Use symbols naturally (%, $, etc.) — they will be escaped automatically
- DO NOT use em dashes or en dashes. Use commas or semicolons.

Return ONLY the bullets you changed as {roleIndex, bulletIndex, text}.`;

  const result = await callLLM({
    model: models.repair,
    schema: HumanizeRepairSchema,
    prompt,
    stage: "humanize-pass",
    snapshotStore,
  });

  // Apply repairs — same immutable pattern as keyword-gap-repair
  const repaired: GeneratedSections = {
    ...sections,
    experience: sections.experience.map((r) => ({
      ...r,
      bullets: [...r.bullets],
    })),
  };

  const candidateLevel: "entry" | "mid" | "senior" =
    experienceLevel === "senior" ? "senior" : experienceLevel === "entry" ? "entry" : "mid";

  let appliedCount = 0;
  let rejectedCount = 0;
  for (const fix of result.object.repairedBullets) {
    const role = repaired.experience[fix.roleIndex];
    if (role && fix.bulletIndex >= 0 && fix.bulletIndex < role.bullets.length) {
      const wordCount = fix.text.split(/\s+/).length;
      if (wordCount > 40) {
        rejectedCount++;
        console.log(
          `[humanize-pass] Rejected [${fix.roleIndex}-${fix.bulletIndex}]: too long (${wordCount} words)`,
        );
        continue;
      }

      const originalBullet = role.bullets[fix.bulletIndex];
      const originalAnalysis = analyzeBullet(originalBullet, jdKeywords, candidateLevel);
      const rewrittenAnalysis = analyzeBullet(fix.text, jdKeywords, candidateLevel);
      // Humanize is purely stylistic — it must never reduce IDS strength at all.
      // Any downgrade (strong→medium, medium→weak, etc.) means the rewrite
      // stripped a signal (comparison, percentage, impact verb) → reject it.
      const strengthOrder = { none: 0, weak: 1, medium: 2, strong: 3 };
      if (strengthOrder[rewrittenAnalysis.strength] < strengthOrder[originalAnalysis.strength]) {
        rejectedCount++;
        console.log(
          `[humanize-pass] Rejected [${fix.roleIndex}-${fix.bulletIndex}]: ` +
            `IDS dropped ${originalAnalysis.strength} -> ${rewrittenAnalysis.strength}`,
        );
        continue;
      }

      role.bullets[fix.bulletIndex] = fix.text;
      appliedCount++;
    }
  }

  console.log(
    `[humanize-pass] Rewrote ${appliedCount} bullets to sound more human` +
      (rejectedCount > 0 ? `, rejected ${rejectedCount}` : ""),
  );

  return {
    sections: repaired,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

// ── Surgical Verb Dedup Pass (LLM) ─────────────────────────────

const VerbDedupSchema = z.object({
  repairedBullets: z.array(
    z.object({
      roleIndex: z.number(),
      bulletIndex: z.number(),
      text: z.string().min(10),
    }),
  ),
});

/**
 * Find new verb collisions introduced by prior humanize passes
 * and surgically fix ONLY the opening verb of those specific bullets.
 * Costs 1 small LLM call (only colliding bullets are sent).
 */
export async function fixVerbCollisions(
  sections: GeneratedSections,
  jdKeywords: string[],
  experienceLevel: string,
  snapshotStore?: SnapshotStore,
): Promise<{
  sections: GeneratedSections;
  inputTokens: number;
  outputTokens: number;
  fixed: number;
}> {
  const allBullets = sections.experience.flatMap((r) => r.bullets);
  const verbs = allBullets.map((b) => b.trim().split(/\s+/)[0].toLowerCase());
  const verbCounts = new Map<string, number>();
  verbs.forEach((v) => verbCounts.set(v, (verbCounts.get(v) || 0) + 1));
  const repeatedVerbs = [...verbCounts.entries()].filter(([, c]) => c > 2);

  if (repeatedVerbs.length === 0) {
    return { sections, inputTokens: 0, outputTokens: 0, fixed: 0 };
  }

  // Build list of bullets to fix (keep 1 instance of each repeated verb, fix the rest)
  const bulletsToFix: { ri: number; bi: number; text: string; verb: string }[] = [];
  const usedVerbs = new Set(verbCounts.keys());

  for (const [verb, count] of repeatedVerbs) {
    let kept = 0;
    let flatIdx = 0;
    for (let ri = 0; ri < sections.experience.length; ri++) {
      for (let bi = 0; bi < sections.experience[ri].bullets.length; bi++) {
        const bVerb = sections.experience[ri].bullets[bi].trim().split(/\s+/)[0].toLowerCase();
        if (bVerb === verb) {
          if (kept === 0) {
            kept++;
          } else {
            bulletsToFix.push({ ri, bi, text: sections.experience[ri].bullets[bi], verb });
          }
        }
        flatIdx++;
      }
    }
  }

  if (bulletsToFix.length === 0) {
    return { sections, inputTokens: 0, outputTokens: 0, fixed: 0 };
  }

  const suggestedVerbs = [
      "built", "designed", "developed", "created", "configured",
      "migrated", "automated", "resolved", "optimized", "streamlined",
      "refactored", "consolidated", "integrated", "eliminated", "established",
      "wrote", "owned", "introduced", "delivered",
      "standardized", "replaced", "accelerated", "simplified",
  ].filter((v) => !usedVerbs.has(v));

  const bulletList = bulletsToFix
    .map((b) => `[${b.ri}-${b.bi}] (starts with "${b.verb}"): "${b.text}"`)
    .join("\n");

  const prompt = `You are fixing verb repetition in a resume. These bullets start with a verb that is used too heavily elsewhere.

BULLETS TO FIX:
${bulletList}

VERBS ALREADY USED (do NOT use these as the new starting verb): ${[...usedVerbs].join(", ")}
USE ONE OF THESE INSTEAD: ${suggestedVerbs.slice(0, 15).join(", ")}

RULES:
- Rewrite the bullet to open with a DIFFERENT strong engineering action verb that is not in the used list.
- You MAY slightly rephrase the first few words so the new verb makes grammatical and logical sense.
- DO NOT just swap the first word blindly if it makes the sentence sound broken (e.g. don't replace "Reduced latency" with "Built latency").
- PRESERVE all technologies, metrics, and JD keywords EXACTLY: ${jdKeywords.slice(0, 10).join(", ")}
- Use plain engineering language. Do NOT use unnatural terminology like "triaging" or "auth bypass".
- DO NOT use em dashes or en dashes. Use commas or semicolons.

Return the fixed bullets as {roleIndex, bulletIndex, text}.`;

  const result = await callLLM({
    model: models.repair,
    schema: VerbDedupSchema,
    prompt,
    stage: "verb-dedup",
    snapshotStore,
  });

  const repaired: GeneratedSections = {
    ...sections,
    experience: sections.experience.map((r) => ({
      ...r,
      bullets: [...r.bullets],
    })),
  };

  let fixedCount = 0;
  for (const fix of result.object.repairedBullets) {
    const role = repaired.experience[fix.roleIndex];
    if (role && fix.bulletIndex >= 0 && fix.bulletIndex < role.bullets.length) {
      role.bullets[fix.bulletIndex] = fix.text;
      fixedCount++;
    }
  }

  console.log(
    `[verb-dedup] Fixed ${fixedCount} verb collisions (${repeatedVerbs.map(([v, c]) => `"${v}" x${c}`).join(", ")})`,
  );

  return {
    sections: repaired,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    fixed: fixedCount,
  };
}
