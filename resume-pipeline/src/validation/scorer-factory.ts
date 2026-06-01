// src/validation/scorer-factory.ts
// Creates a scorer from a list of dimensions.
// Pure function — all inputs are pre-computed, no side effects.

import type { ScorerDimension, ScoringContext } from "./scorer-dimension.js";
import type { ATSScore, FormatIssue } from "../schemas/pipeline.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import { keywordExistsInText } from "./utils/word-boundary.js";
import { getAllSkillVariants } from "./skill-variants.js";

// ── Weight tables ───────────────────────────────────────────────

export interface DimensionWeight {
  key: string;
  weight: number;
}

// Phase 2 weights (no embedding — semanticSimilarity returns 0)
// Total = 108 creates intentional top-end compression:
//   A perfect 100/100 requires near-perfect scores in ALL dimensions
//   PLUS title alignment bonus. Clamped to 100 at output.
export const WEIGHTS_PHASE2: DimensionWeight[] = [
  { key: "keywordRelevance", weight: 27 },
  { key: "preferredRelevance", weight: 10 },
  { key: "impactScore", weight: 14 },
  { key: "metricsRatio", weight: 9 },
  { key: "actionVerbRatio", weight: 6 },
  { key: "keywordPlacement", weight: 7 },
  { key: "sectionCompleteness", weight: 7 },
  { key: "formatScore", weight: 8 },
  { key: "skillExperienceCoherence", weight: 6 },
  { key: "experienceLevelMatch", weight: 4 },
  { key: "educationLevelMatch", weight: 4 },
  { key: "taxonomyCoverage", weight: 3 },
  { key: "bulletLengthHealth", weight: 2 },
];

// Phase 3 weights (with embedding)
// Total = 107, same top-end compression logic
export const WEIGHTS_PHASE3: DimensionWeight[] = [
  { key: "keywordRelevance", weight: 22 },
  { key: "semanticSimilarity", weight: 15 },
  { key: "preferredRelevance", weight: 8 },
  { key: "impactScore", weight: 12 },
  { key: "metricsRatio", weight: 8 },
  { key: "actionVerbRatio", weight: 5 },
  { key: "keywordPlacement", weight: 6 },
  { key: "sectionCompleteness", weight: 6 },
  { key: "formatScore", weight: 7 },
  { key: "skillExperienceCoherence", weight: 5 },
  { key: "experienceLevelMatch", weight: 4 },
  { key: "educationLevelMatch", weight: 4 },
  { key: "taxonomyCoverage", weight: 3 },
  { key: "bulletLengthHealth", weight: 2 },
];

const LABELS: Record<string, string> = {
  keywordRelevance: "Keyword Match",
  semanticSimilarity: "Semantic Fit",
  preferredRelevance: "Preferred Skills",
  impactScore: "Bullet Impact",
  metricsRatio: "Metrics Usage",
  actionVerbRatio: "Action Verbs",
  keywordPlacement: "Keyword Placement",
  sectionCompleteness: "Sections",
  formatScore: "ATS Format",
  skillExperienceCoherence: "Skill Coherence",
  experienceLevelMatch: "Experience Level",
  educationLevelMatch: "Education Level",
  taxonomyCoverage: "Taxonomy Match",
  bulletLengthHealth: "Bullet Length",
};

// ── Scorer factory ──────────────────────────────────────────────

export interface ATSScorer {
  calculate(
    ctx: ScoringContext,
    overrides?: Partial<Record<string, number>>,
  ): ATSScore;
}

export function createScorer(
  dimensions: ScorerDimension[],
  weightTable: DimensionWeight[] = WEIGHTS_PHASE2,
): ATSScorer {
  const weightMap = new Map(weightTable.map((w) => [w.key, w.weight]));

  return {
    calculate(
      ctx: ScoringContext,
      overrides?: Partial<Record<string, number>>,
    ): ATSScore {
      const results = new Map<string, number>();
      const errors: string[] = [];

      for (const dim of dimensions) {
        try {
          results.set(dim.key, dim.evaluate(ctx));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`[scorer] Dimension "${dim.key}" failed: ${msg}`);
          results.set(dim.key, 0);
          errors.push(dim.key);
        }
      }

      if (overrides) {
        for (const [key, value] of Object.entries(overrides)) {
          if (value !== undefined) {
            results.set(key, value);
          }
        }
      }

      return composeFinalScore(dimensions, results, errors, ctx, weightMap);
    },
  };
}

// ── Score composition ───────────────────────────────────────────

function composeFinalScore(
  dimensions: ScorerDimension[],
  results: Map<string, number>,
  errors: string[],
  ctx: ScoringContext,
  weightMap: Map<string, number>,
): ATSScore {
  const componentBreakdown: ATSScore["componentBreakdown"] = {} as ATSScore["componentBreakdown"];

  let keywordRelevance = 0;
  let preferredRelevance = 0;
  let impactScore = 0;
  let metricsRatio = 0;
  let actionVerbRatio = 0;
  let keywordPlacement = 0;
  let sectionCompleteness = 0;
  let formatScore = 0;
  let skillExperienceCoherence = 0;
  let experienceLevelMatch = 0;
  let educationLevelMatch = 0;
  let taxonomyCoverage = 0;
  let bulletLengthHealth = 0;
  let semanticSimilarity = 0;
  let densityPenaltyFactor = 1.0;

  for (const dim of dimensions) {
    const raw = results.get(dim.key) ?? 0;
    const weight = weightMap.get(dim.key) ?? 0;
    const label = LABELS[dim.key] || dim.label;

    componentBreakdown[dim.key] = {
      raw: Math.round(raw * 100) / 100,
      weighted: Math.round(raw * weight),
      max: weight,
      label,
    };

    switch (dim.key) {
      case "keywordRelevance":
        keywordRelevance = raw;
        break;
      case "semanticSimilarity":
        semanticSimilarity = raw;
        break;
      case "preferredRelevance":
        preferredRelevance = raw;
        break;
      case "impactScore":
        impactScore = raw;
        break;
      case "metricsRatio":
        metricsRatio = raw;
        break;
      case "actionVerbRatio":
        actionVerbRatio = raw;
        break;
      case "keywordPlacement":
        keywordPlacement = raw;
        break;
      case "sectionCompleteness":
        sectionCompleteness = raw;
        break;
      case "formatScore":
        formatScore = raw;
        break;
      case "skillExperienceCoherence":
        skillExperienceCoherence = raw;
        break;
      case "experienceLevelMatch":
        experienceLevelMatch = raw;
        break;
      case "educationLevelMatch":
        educationLevelMatch = raw;
        break;
      case "taxonomyCoverage":
        taxonomyCoverage = raw;
        break;
      case "bulletLengthHealth":
        bulletLengthHealth = raw;
        break;
    }
  }

  const baseOverall = Object.values(componentBreakdown).reduce(
    (sum, c) => sum + c.weighted,
    0,
  );
  const overall = Math.min(100, Math.round(baseOverall));

  return {
    version: 1,
    overall,
    keywordMatch: Math.round(keywordRelevance * 100),
    keywordRelevance: Math.round(keywordRelevance * 100),
    preferredMatch: Math.round(preferredRelevance * 100),
    preferredRelevance: Math.round(preferredRelevance * 100),
    sectionCompleteness: Math.round(sectionCompleteness * 100),
    formatScore: Math.round(formatScore * 100),
    keywordPlacement: Math.round(keywordPlacement * 100),
    impactScore: Math.round(impactScore * 100),
    metricsRatio: Math.round(metricsRatio * 100),
    actionVerbRatio: Math.round(actionVerbRatio * 100),
    skillExperienceCoherence: Math.round(skillExperienceCoherence * 100),
    experienceLevelMatch: Math.round(experienceLevelMatch * 100),
    educationLevelMatch: Math.round(educationLevelMatch * 100),
    taxonomyCoverage: Math.round(taxonomyCoverage * 100),
    bulletLengthHealth: Math.round(bulletLengthHealth * 100),
    densityPenaltyFactor: Math.round(densityPenaltyFactor * 100),
    semanticSimilarity: Math.round(semanticSimilarity * 100),
    semanticScoringAvailable: semanticSimilarity > 0,
    missingRequired: ctx.jd.requiredSkills.filter((skill) =>
      !getAllSkillVariants(skill).some((v) => keywordExistsInText(v, ctx.fullText)),
    ),
    missingPreferred: ctx.jd.preferredSkills.filter((skill) =>
      !getAllSkillVariants(skill).some((v) => keywordExistsInText(v, ctx.fullText)),
    ),
    componentBreakdown,
    formatIssues: [],
    features: {
      semanticScoring: semanticSimilarity > 0,
      formatValidated: true,
    },
  };
}
