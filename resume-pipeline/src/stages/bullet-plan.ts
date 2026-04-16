// src/stages/bullet-plan.ts
// Deterministic burstiness planner. Before any LLM call, we assign each
// bullet a target "shape" so the generator cannot flatten the output into
// uniform bullets:
//   - a length band  (short 11-15 / medium 22-28 / long 30-34 words)
//   - a unique opening verb  (no collisions across the whole resume)
//   - a sentence pattern     (action-first / impact-first / context-first / problem-first)
//   - a metric-required flag (~60-75% of bullets)
//
// All assignments are seeded off a stable input (jobId + role index + bullet
// index) so retries produce the same plan and the output is reproducible.
//
// 0 LLM calls.

import type { BulletBrief } from "./bullet-brief.js";

// ── Types ──────────────────────────────────────────────────────

export type LengthBand = "short" | "medium" | "long";
export type SentencePattern =
  | "action-first"
  | "impact-first"
  | "context-first"
  | "problem-first"
  | "team-first";

export interface BulletPlan {
  roleIndex: number;
  bulletIndex: number;
  targetWordsMin: number;
  targetWordsMax: number;
  lengthBand: LengthBand;
  openingVerb: string;
  sentencePattern: SentencePattern;
  metricRequired: boolean;
  /** If the original bullet had a metric, we keep it and this is the preserved value. */
  preservedMetric: string | null;
  /** Technologies that MUST be preserved from the original brief. */
  preservedTechnologies: string[];
  /** Project name from the original brief, if any. */
  preservedProjectTag: string | null;
}

// ── Length Bands ───────────────────────────────────────────────

const LENGTH_BANDS: Record<LengthBand, { min: number; max: number }> = {
  short: { min: 11, max: 15 },
  medium: { min: 22, max: 28 },
  long: { min: 30, max: 34 },
};

// Target distribution per role.
// short ~25%, medium ~60%, long ~15%.
function distributeLengths(count: number): LengthBand[] {
  if (count <= 0) return [];
  const shortTarget = Math.max(1, Math.floor(count * 0.25));
  const longTarget = Math.max(count >= 6 ? 1 : 0, Math.floor(count * 0.15));
  const mediumTarget = Math.max(0, count - shortTarget - longTarget);

  const out: LengthBand[] = [];
  for (let i = 0; i < shortTarget; i++) out.push("short");
  for (let i = 0; i < mediumTarget; i++) out.push("medium");
  for (let i = 0; i < longTarget; i++) out.push("long");
  return out;
}

// ── Verb Pool ──────────────────────────────────────────────────
// Curated list of plain, human-engineering verbs. The AI-favorite buzzwords
// (spearheaded, orchestrated, leveraged, etc.) are deliberately excluded.
// Grouped so we can bias by pattern.
const VERB_POOL = {
  creation: [
    "built", "created", "designed", "wrote", "configured", "shipped",
    "set up", "established", "introduced", "developed", "integrated",
    "deployed", "prototyped", "authored", "assembled",
  ],
  impact: [
    "reduced", "improved", "cut", "eliminated", "accelerated", "halved",
    "doubled", "stabilized", "streamlined", "simplified", "consolidated",
    "resolved",
  ],
  problem: [
    "debugged", "profiled", "diagnosed", "fixed", "corrected",
    "investigated", "traced", "isolated", "repaired", "addressed",
  ],
  team: [
    "collaborated", "partnered", "mentored", "onboarded", "reviewed",
    "paired", "led", "trained", "coordinated", "advised",
  ],
  migration: [
    "migrated", "refactored", "upgraded", "replaced", "rewrote", "ported",
    "standardized", "unified",
  ],
  ownership: [
    "owned", "drove", "delivered", "maintained", "ran", "managed",
  ],
} as const;

function verbListForPattern(pattern: SentencePattern): readonly string[] {
  switch (pattern) {
    case "impact-first":
      return VERB_POOL.impact;
    case "problem-first":
      return VERB_POOL.problem;
    case "context-first":
      return VERB_POOL.creation;
    case "team-first":
      return VERB_POOL.team;
    case "action-first":
    default:
      return [
        ...VERB_POOL.creation,
        ...VERB_POOL.migration,
        ...VERB_POOL.ownership,
      ];
  }
}

// ── Deterministic PRNG ─────────────────────────────────────────
// Mulberry32 seeded by a stable string. Ensures retries produce the same
// plan without global state.
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: string) {
  let a = hashString(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Plan Builder ───────────────────────────────────────────────

export interface BuildPlansArgs {
  rolesBriefs: BulletBrief[][];
  /** Used as RNG seed for deterministic-under-retry plans. */
  jobIdSeed: string;
  /** Fraction of bullets that must have a metric (default 0.7). */
  metricRequiredRatio?: number;
}

export function buildPlans(args: BuildPlansArgs): BulletPlan[][] {
  const { rolesBriefs, jobIdSeed, metricRequiredRatio = 0.7 } = args;
  const rng = makeRng(`plan:${jobIdSeed}`);

  // Track verbs already assigned globally so there are no collisions.
  const usedVerbs = new Set<string>();

  const patternsRotation: SentencePattern[] = [
    "action-first",
    "impact-first",
    "context-first",
    "problem-first",
    "team-first",
  ];

  const plans: BulletPlan[][] = [];

  for (let ri = 0; ri < rolesBriefs.length; ri++) {
    const briefs = rolesBriefs[ri];
    const count = briefs.length;

    // 1. Length distribution per role (shuffled)
    const lengths = shuffle(distributeLengths(count), rng);

    // 2. Sentence patterns — rotate from a shuffled starting index
    const patternStart = Math.floor(rng() * patternsRotation.length);

    // 3. Metric flag — choose which bullets must have metrics
    // Bullets with already-existing metrics always count. Fill the rest
    // until we hit the target ratio.
    const required: boolean[] = briefs.map((b) => b.hasMetric);
    const targetCount = Math.round(count * metricRequiredRatio);
    const needed = Math.max(0, targetCount - required.filter(Boolean).length);

    const nonMetricIndices = briefs
      .map((b, i) => (b.hasMetric ? -1 : i))
      .filter((i) => i >= 0);
    const shuffledNonMetric = shuffle(nonMetricIndices, rng);
    for (let k = 0; k < Math.min(needed, shuffledNonMetric.length); k++) {
      required[shuffledNonMetric[k]] = true;
    }

    const rolePlans: BulletPlan[] = [];
    for (let bi = 0; bi < count; bi++) {
      const band = lengths[bi] || "medium";
      const pattern =
        patternsRotation[(patternStart + bi) % patternsRotation.length];

      // Pick an opening verb not yet used. Fallback to original if pool exhausted.
      const pool = verbListForPattern(pattern);
      let chosenVerb = "";
      const shuffledPool = shuffle([...pool], rng);
      for (const v of shuffledPool) {
        if (!usedVerbs.has(v.toLowerCase())) {
          chosenVerb = v;
          break;
        }
      }
      if (!chosenVerb) {
        // All pattern-specific verbs used — fall back to any unused verb
        const allVerbs = [
          ...VERB_POOL.creation,
          ...VERB_POOL.impact,
          ...VERB_POOL.problem,
          ...VERB_POOL.team,
          ...VERB_POOL.migration,
          ...VERB_POOL.ownership,
        ];
        const shuffledAll = shuffle(allVerbs, rng);
        for (const v of shuffledAll) {
          if (!usedVerbs.has(v.toLowerCase())) {
            chosenVerb = v;
            break;
          }
        }
        if (!chosenVerb) chosenVerb = briefs[bi].action || "built";
      }
      usedVerbs.add(chosenVerb.toLowerCase());

      const { min, max } = LENGTH_BANDS[band];

      rolePlans.push({
        roleIndex: ri,
        bulletIndex: bi,
        targetWordsMin: min,
        targetWordsMax: max,
        lengthBand: band,
        openingVerb: chosenVerb,
        sentencePattern: pattern,
        metricRequired: required[bi],
        preservedMetric: briefs[bi].metric,
        preservedTechnologies: briefs[bi].technologies,
        preservedProjectTag: briefs[bi].projectTag,
      });
    }

    plans.push(rolePlans);
  }

  return plans;
}

// ── Pretty-printer for prompts ─────────────────────────────────
// Produces a compact per-bullet instruction block the LLM can follow.

export function formatPlanForPrompt(plan: BulletPlan): string {
  const parts: string[] = [];
  parts.push(`length: ${plan.lengthBand} (${plan.targetWordsMin}-${plan.targetWordsMax} words)`);
  parts.push(`opening verb: "${plan.openingVerb}" (use exactly this, case may vary)`);
  parts.push(`pattern: ${plan.sentencePattern}`);
  parts.push(
    plan.metricRequired ? "metric: REQUIRED" : "metric: optional (qualitative OK)",
  );
  if (plan.preservedMetric) {
    parts.push(`PRESERVE metric verbatim: "${plan.preservedMetric}"`);
  }
  if (plan.preservedTechnologies.length > 0) {
    parts.push(`PRESERVE technologies: ${plan.preservedTechnologies.join(", ")}`);
  }
  if (plan.preservedProjectTag) {
    parts.push(`PRESERVE project name: "${plan.preservedProjectTag}"`);
  }
  return parts.join("; ");
}
