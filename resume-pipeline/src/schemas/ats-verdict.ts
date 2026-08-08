// src/schemas/ats-verdict.ts
// Staged ATS verdict — models how real ATS screening works:
//   Stage A: knockout gate (binary must-haves, like application-form questions)
//   Stage B: recruiter-search simulation (exact boolean queries a recruiter runs)
//   Stage C: ranking/quality score (the existing ATSScore machinery)
// Each stage emits structured, machine-actionable failures that the repair
// loops consume directly, instead of optimizing a blended 0-100 number.

import { z } from "zod";
import type { ATSScore } from "./pipeline.js";

export const MatchTierSchema = z.enum([
  "exact",
  "implied",
  "semantic",
  "adjudicated",
  "none",
]);
export type VerdictMatchTier = z.infer<typeof MatchTierSchema>;

// ── Stage A: knockout checks ────────────────────────────────────

export const KnockoutCheckSchema = z.object({
  /** Stable id, e.g. "skill:kubernetes" | "experience-years" | "education". */
  id: z.string(),
  kind: z.enum([
    "must-have-skill",
    "experience-years",
    "education",
    "certification",
    "work-auth",
  ]),
  /** Human-readable requirement, phrased from the JD. */
  requirement: z.string(),
  passed: z.boolean(),
  /** Cited resume line or extracted value ("3.2 years across 2 roles"). */
  evidence: z.string().nullable(),
  matchTier: MatchTierSchema.optional(),
  /** Adjudicated evidence is medium/low; lexical evidence is high. */
  confidence: z.enum(["high", "medium", "low"]),
  /** Missing keyword = fixable by rewriting; insufficient years/degree = not. */
  fixable: z.boolean(),
  detail: z.string().optional(),
});
export type KnockoutCheck = z.infer<typeof KnockoutCheckSchema>;

// ── Stage B: recruiter-search simulation ────────────────────────

export const ResumeSectionSchema = z.enum([
  "header",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
]);
export type ResumeSection = z.infer<typeof ResumeSectionSchema>;

export const RecruiterQueryResultSchema = z.object({
  /** The literal string a recruiter would type into ATS search. */
  query: z.string(),
  kind: z.enum(["skill", "title", "combo", "phrase"]),
  hit: z.boolean(),
  /** The alias/variant that actually matched, when hit. */
  matchedVariant: z.string().nullable(),
  locations: z.array(ResumeSectionSchema),
  /** Why a miss missed: the skill only matched at a non-literal tier. */
  nearMissTier: MatchTierSchema.optional(),
  /** 1.0 required skill, 0.7 title, 0.5 combo, 0.4 phrase. */
  weight: z.number(),
});
export type RecruiterQueryResult = z.infer<typeof RecruiterQueryResultSchema>;

// ── Parse simulation (PDF round-trip) ───────────────────────────

export const ParseLossIssueSchema = z.object({
  kind: z.enum([
    "keyword-lost",
    "contact-lost",
    "date-mangled",
    "section-lost",
    "compile-failed",
  ]),
  detail: z.string(),
  keyword: z.string().optional(),
  severity: z.enum(["critical", "warning"]),
});
export type ParseLossIssue = z.infer<typeof ParseLossIssueSchema>;

// ── Repair plan ─────────────────────────────────────────────────

export const RepairActionSchema = z.object({
  type: z.enum([
    "insert-skill",
    "weave-bullet",
    "add-title-alias",
    "fix-parse-loss",
    "not-fixable",
  ]),
  target: z.enum(["skills", "summary", "experience", "latex"]),
  keyword: z.string(),
  /** Machine-readable cause, e.g. "recruiter-query-miss:semantic-only". */
  reason: z.string(),
  /** knockout=3, required-query-miss=2, combo/phrase=1. */
  priority: z.number(),
  sourceStage: z.enum(["knockout", "recruiter-search", "parse-simulation"]),
  /** false = requires new facts from the user, not a rewrite. */
  fixable: z.boolean(),
});
export type RepairAction = z.infer<typeof RepairActionSchema>;

// ── Verdict ─────────────────────────────────────────────────────

export type VerdictStatus = "REJECT" | "LOW_VISIBILITY" | "PASS";

export interface ATSVerdict {
  version: 2;
  status: VerdictStatus;
  knockout: {
    passed: boolean;
    checks: KnockoutCheck[];
    /** Requirements failing that a resume rewrite cannot fix. */
    unfixableFailures: string[];
  };
  recruiterSearch: {
    queries: RecruiterQueryResult[];
    /** Weighted fraction of queries that hit (0..1). */
    weightedHitRate: number;
    missCount: number;
  };
  /** Stage C — the existing ranking/quality score, unchanged. */
  quality: ATSScore;
  parseSimulation: {
    performed: boolean;
    method: "pdf-roundtrip" | "latex-text-fallback";
    issues: ParseLossIssue[];
  };
  repairPlan: RepairAction[];
}

// ── Status mapping ──────────────────────────────────────────────

/** Any weight-1.0 query miss or weighted hit rate below this ⇒ LOW_VISIBILITY. */
export const LOW_VISIBILITY_HIT_RATE = 0.8;

export function deriveVerdictStatus(
  knockoutPassed: boolean,
  queries: RecruiterQueryResult[],
): VerdictStatus {
  if (!knockoutPassed) return "REJECT";
  const totalWeight = queries.reduce((s, q) => s + q.weight, 0);
  const hitWeight = queries.reduce((s, q) => s + (q.hit ? q.weight : 0), 0);
  const hitRate = totalWeight > 0 ? hitWeight / totalWeight : 1;
  const missedMustSearch = queries.some((q) => q.weight >= 1.0 && !q.hit);
  if (missedMustSearch || hitRate < LOW_VISIBILITY_HIT_RATE) {
    return "LOW_VISIBILITY";
  }
  return "PASS";
}

export function weightedHitRate(queries: RecruiterQueryResult[]): number {
  const totalWeight = queries.reduce((s, q) => s + q.weight, 0);
  if (totalWeight === 0) return 1;
  const hitWeight = queries.reduce((s, q) => s + (q.hit ? q.weight : 0), 0);
  return hitWeight / totalWeight;
}
