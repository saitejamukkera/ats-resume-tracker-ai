// src/validation/knockout/knockout-evaluator.ts
// Stage A of the ATS verdict: binary knockout checks, modeled after the
// hard filters real ATS apply (application-form questions + must-have
// requirements) before a human ever sees the resume.
// Pure and deterministic — adjudication results are passed in, never fetched.

import type { ScoringContext } from "../scorer-dimension.js";
import type { KnockoutCheck } from "../../schemas/ats-verdict.js";
import {
  detectResumeDegreeLevel,
  DEGREE_RANK,
} from "../utils/education-detector.js";
import { keywordExistsInText } from "../utils/word-boundary.js";

/** Result of the LLM skill adjudicator for one still-unmatched skill. */
export interface AdjudicationResult {
  skill: string;
  demonstrated: boolean;
  citedLine: string;
  confidence: "high" | "medium" | "low";
}

const AUTH_EVIDENCE =
  /authorized\s+to\s+work|u\.?s\.?\s+citizen|green\s+card|permanent\s+resident|security\s+clearance/i;

export function evaluateKnockouts(
  ctx: ScoringContext,
  adjudicated?: Map<string, AdjudicationResult>,
): KnockoutCheck[] {
  const checks: KnockoutCheck[] = [];
  const jd = ctx.jd;

  // ── Must-have skills ──────────────────────────────────────────
  for (const [skill, match] of ctx.requiredMatches) {
    const key = skill.toLowerCase();
    if (match.tier === "exact" || match.tier === "implied") {
      checks.push({
        id: `skill:${key}`,
        kind: "must-have-skill",
        requirement: skill,
        passed: true,
        evidence:
          match.tier === "exact"
            ? `"${skill}" appears verbatim in the resume`
            : `implied by a more specific skill on the resume`,
        matchTier: match.tier,
        confidence: "high",
        fixable: true,
      });
      continue;
    }

    const adj = adjudicated?.get(key);
    if (adj?.demonstrated) {
      checks.push({
        id: `skill:${key}`,
        kind: "must-have-skill",
        requirement: skill,
        passed: true,
        evidence: adj.citedLine || null,
        matchTier: "adjudicated",
        confidence: adj.confidence === "high" ? "medium" : "low",
        fixable: true,
        detail:
          "Demonstrated per LLM adjudication, but the literal keyword is absent — a recruiter keyword search will still miss it.",
      });
      continue;
    }

    checks.push({
      id: `skill:${key}`,
      kind: "must-have-skill",
      requirement: skill,
      passed: false,
      evidence: null,
      matchTier: match.tier, // "semantic" | "none"
      confidence: "high",
      fixable: true,
      detail:
        match.tier === "semantic"
          ? "Only a loosely related term is present — does not satisfy a must-have."
          : "No evidence found on the resume.",
    });
  }

  // ── Minimum years of experience ───────────────────────────────
  if (jd.minYearsExperience != null && jd.minYearsExperience > 0) {
    const have = ctx.totalExperienceYears;
    const roleCount = ctx.parsedResume.experience.length;
    checks.push({
      id: "experience-years",
      kind: "experience-years",
      requirement: `${jd.minYearsExperience}+ years of experience`,
      passed: have >= jd.minYearsExperience,
      evidence: `${have.toFixed(1)} years across ${roleCount} role${roleCount === 1 ? "" : "s"}`,
      confidence: "high",
      fixable: false,
      detail:
        have >= jd.minYearsExperience
          ? undefined
          : "Parsed from role date ranges — a rewrite cannot add years. Verify the resume's date ranges parse correctly.",
    });
  }

  // ── Education ─────────────────────────────────────────────────
  const requiredEdu = jd.educationLevel || "none";
  if (requiredEdu !== "none") {
    const candidateDegree = detectResumeDegreeLevel(ctx.parsedResume.education);
    const passed =
      candidateDegree != null &&
      (DEGREE_RANK[candidateDegree] ?? 0) >= (DEGREE_RANK[requiredEdu] ?? 0);
    checks.push({
      id: "education",
      kind: "education",
      requirement: `${requiredEdu} degree or higher`,
      passed,
      evidence: candidateDegree
        ? `${candidateDegree} degree detected on resume`
        : "no degree detected in the education section",
      confidence: "high",
      fixable: false,
    });
  }

  // ── Required certifications ───────────────────────────────────
  for (const cert of jd.certifications ?? []) {
    const present = keywordExistsInText(cert, ctx.fullText);
    checks.push({
      id: `certification:${cert.toLowerCase()}`,
      kind: "certification",
      requirement: cert,
      passed: present,
      evidence: present ? `"${cert}" found on the resume` : null,
      confidence: "high",
      fixable: false,
      detail: present
        ? undefined
        : "Add this certification to the resume only if you actually hold it.",
    });
  }

  // ── Work authorization (informational) ────────────────────────
  // Real ATS ask this on the application form, not the resume — absence of an
  // auth statement on the resume is NOT a failure. Surfaced so the user knows
  // the JD will knock out on it at application time.
  if (jd.workAuthRequirement) {
    const stated = AUTH_EVIDENCE.test(ctx.fullText);
    checks.push({
      id: "work-auth",
      kind: "work-auth",
      requirement: jd.workAuthRequirement,
      passed: true,
      evidence: stated
        ? "resume states a work-authorization status"
        : null,
      confidence: "low",
      fixable: false,
      detail:
        "This is asked on the application form, not screened from the resume. Be prepared to answer it.",
    });
  }

  return checks;
}

/** Overall Stage A result: every non-informational check must pass. */
export function knockoutPassed(checks: KnockoutCheck[]): boolean {
  return checks.every((c) => c.passed);
}

/** Human-readable list of failed requirements that a rewrite cannot fix. */
export function unfixableFailures(checks: KnockoutCheck[]): string[] {
  return checks
    .filter((c) => !c.passed && !c.fixable)
    .map((c) => c.requirement);
}
