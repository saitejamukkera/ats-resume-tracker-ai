// src/validation/ats-scorer.ts
// Stage 4.5: Deterministic ATS score calculator — 0 LLM calls.
// Phase 3: Semantic scoring via SBERT embeddings when enabled.

import type { GeneratedSections, ParsedResume, ATSScore } from "../schemas/pipeline.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { RoleImpactProfile } from "../impact/detector.js";
import { profileRoleImpact } from "../impact/detector.js";
import { buildScoringContext } from "./scoring-context.js";
import { createScorer, WEIGHTS_PHASE2, WEIGHTS_PHASE3, type ATSScorer } from "./scorer-factory.js";
import { validateFormat } from "./format-validator.js";
import { defaultDimensions, phase3Dimensions } from "./dimensions/index.js";
import {
  prepareTextForEmbedding,
  computeResumeJDSimilarity,
  computeSkillSetSimilarity,
  tokenizeSkills,
} from "./embedding-matcher.js";
import { applySemanticMatches, unmatchedSkills } from "./skill-matcher.js";

const scorerPhase2: ATSScorer = createScorer(defaultDimensions, WEIGHTS_PHASE2);
const scorerPhase3: ATSScorer = createScorer(phase3Dimensions, WEIGHTS_PHASE3);

export function calculateATSScore(
  sections: GeneratedSections,
  jd: JDAnalysis,
  opts?: {
    parsedResume?: ParsedResume;
    impactProfiles?: RoleImpactProfile[];
    fullLatexText?: string;
  },
): ATSScore {
  const parsedResume: ParsedResume = opts?.parsedResume ?? {
    preamble: "",
    header: "",
    summary: sections.summary,
    skills: sections.skills,
    experience: sections.experience.map((r) => ({
      heading: r.roleTitle,
      bullets: r.bullets,
      rawBlock: "",
    })),
    projects: "",
    education: "",
    postamble: "",
    rawLatex: "",
    sectionOrder: ["summary", "skills", "experience"],
  };

  const jdKeywords = [...jd.requiredSkills, ...jd.preferredSkills];
  const impactProfiles: RoleImpactProfile[] =
    opts?.impactProfiles ??
    sections.experience.map((role, i) =>
      profileRoleImpact(
        `${role.roleTitle || `Role ${i}`}`,
        role.bullets,
        jdKeywords,
        jd.experienceLevel,
      ),
    );

  const fullLatexText: string = opts?.fullLatexText ?? "";

  const ctx = buildScoringContext(
    sections,
    jd,
    parsedResume,
    impactProfiles,
    fullLatexText,
  );

  const overrides: Record<string, number> = {};
  let formatResult: ReturnType<typeof validateFormat> | undefined;

  if (fullLatexText) {
    try {
      formatResult = validateFormat(fullLatexText, sections, parsedResume.preamble);
      overrides.formatScore = formatResult.score;
    } catch (e) {
      console.warn(
        `[ats-scorer] Format validation failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const score = scorerPhase2.calculate(ctx, Object.keys(overrides).length > 0 ? overrides : undefined);

  if (formatResult) {
    score.formatIssues = formatResult.issues;
    score.features.formatValidated = true;
  } else if (fullLatexText) {
    score.features.formatValidated = false;
  }

  return score;
}

export async function calculateATSScoreWithEmbeddings(
  sections: GeneratedSections,
  jd: JDAnalysis,
  parsedResume: ParsedResume,
  impactProfiles: RoleImpactProfile[],
  fullLatexText: string,
  jdText: string,
): Promise<ATSScore> {
  const ctx = buildScoringContext(
    sections,
    jd,
    parsedResume,
    impactProfiles,
    fullLatexText,
  );

  const overrides: Record<string, number> = {};
  let formatResult: ReturnType<typeof validateFormat> | undefined;
  let semanticSimilarity = 0;
  let semanticScoringAvailable = false;

  if (fullLatexText) {
    try {
      formatResult = validateFormat(fullLatexText, sections, parsedResume.preamble);
      overrides.formatScore = formatResult.score;
    } catch (e) {
      console.warn(
        `[ats-scorer] Format validation failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (process.env.ENABLE_SEMANTIC_SCORING !== "false" && jdText) {
    try {
      const resumeText = prepareTextForEmbedding(sections);
      semanticSimilarity = await computeResumeJDSimilarity(resumeText, jdText);
      semanticScoringAvailable = true;
      overrides.semanticSimilarity = semanticSimilarity;

      // Skill-level semantic tier: upgrade still-unmatched required/preferred
      // skills using token-vs-token similarity against the candidate's skills.
      const candidateSkills = [
        ...tokenizeSkills(ctx.skillsText),
        ...sections.experience.map((r) => r.roleTitle.toLowerCase()),
      ];
      const gapSkills = [
        ...unmatchedSkills(ctx.requiredMatches),
        ...unmatchedSkills(ctx.preferredMatches),
      ];
      if (gapSkills.length > 0 && candidateSkills.length > 0) {
        const cosineBySkill = await computeSkillSetSimilarity(
          gapSkills,
          candidateSkills,
        );
        applySemanticMatches(ctx.requiredMatches, cosineBySkill);
        applySemanticMatches(ctx.preferredMatches, cosineBySkill);
      }
    } catch (e) {
      console.warn(
        `[ats-scorer] Semantic scoring unavailable: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const scorer = semanticScoringAvailable ? scorerPhase3 : scorerPhase2;
  const score = scorer.calculate(ctx, Object.keys(overrides).length > 0 ? overrides : undefined);

  score.semanticScoringAvailable = semanticScoringAvailable;
  score.semanticSimilarity = Math.round(semanticSimilarity * 100);
  score.features.semanticScoring = semanticScoringAvailable;

  if (formatResult) {
    score.formatIssues = formatResult.issues;
    score.features.formatValidated = true;
  } else if (fullLatexText) {
    score.features.formatValidated = false;
  }

  return score;
}
