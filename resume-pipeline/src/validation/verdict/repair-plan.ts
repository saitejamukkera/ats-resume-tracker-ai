// src/validation/verdict/repair-plan.ts
// Turns staged-verdict failures into a prioritized, machine-actionable repair
// plan. The truthfulness gate is central: a keyword is only "fixable" when
// the candidate demonstrably has the skill (tech profile or LLM adjudication);
// otherwise the action is surfaced to the user as not-fixable instead of
// stuffing an unearned keyword into the resume.

import type {
  KnockoutCheck,
  ParseLossIssue,
  RecruiterQueryResult,
  RepairAction,
} from "../../schemas/ats-verdict.js";
import type { CandidateTechProfile } from "../../stages/tech-stack-extractor.js";
import type { AdjudicationResult } from "../knockout/knockout-evaluator.js";
import { getAllSkillVariants } from "../skill-variants.js";

export const PRIORITY = {
  knockout: 3,
  requiredQueryMiss: 2,
  minorQueryMiss: 1,
} as const;

/** Case/variant-insensitive "does the candidate actually have this skill". */
function candidateHasSkill(
  keyword: string,
  candidateTech: CandidateTechProfile,
  adjudicated?: Map<string, AdjudicationResult>,
): boolean {
  const adj = adjudicated?.get(keyword.toLowerCase());
  if (adj?.demonstrated) return true;

  const owned = new Set(
    [...candidateTech.primary, ...candidateTech.secondary].flatMap((t) =>
      getAllSkillVariants(t).map((v) => v.toLowerCase()),
    ),
  );
  return getAllSkillVariants(keyword).some((v) =>
    owned.has(v.toLowerCase()),
  );
}

export function buildRepairPlan(
  checks: KnockoutCheck[],
  queryResults: RecruiterQueryResult[],
  parseIssues: ParseLossIssue[],
  candidateTech: CandidateTechProfile,
  adjudicated?: Map<string, AdjudicationResult>,
): RepairAction[] {
  const actions: RepairAction[] = [];
  const planned = new Set<string>();

  const add = (action: RepairAction) => {
    const key = `${action.type}:${action.keyword.toLowerCase()}`;
    if (planned.has(key)) return;
    planned.add(key);
    actions.push(action);
  };

  // ── Failed knockouts ──────────────────────────────────────────
  for (const check of checks) {
    if (check.passed) continue;

    if (check.kind === "must-have-skill" && check.fixable) {
      if (candidateHasSkill(check.requirement, candidateTech, adjudicated)) {
        // Highest-signal placement first (skills section, deterministic),
        // then reinforce with a bullet so it reads as real experience.
        add({
          type: "insert-skill",
          target: "skills",
          keyword: check.requirement,
          reason: `knockout:must-have-skill-missing`,
          priority: PRIORITY.knockout,
          sourceStage: "knockout",
          fixable: true,
        });
        add({
          type: "weave-bullet",
          target: "experience",
          keyword: check.requirement,
          reason: `knockout:must-have-skill-missing`,
          priority: PRIORITY.knockout,
          sourceStage: "knockout",
          fixable: true,
        });
      } else {
        add({
          type: "not-fixable",
          target: "skills",
          keyword: check.requirement,
          reason:
            "knockout:skill-not-in-candidate-profile — add it to your base resume only if you actually have it",
          priority: PRIORITY.knockout,
          sourceStage: "knockout",
          fixable: false,
        });
      }
      continue;
    }

    // Years / education / certification failures cannot be fixed by rewriting.
    add({
      type: "not-fixable",
      target: "latex",
      keyword: check.requirement,
      reason: `knockout:${check.kind}-unmet`,
      priority: PRIORITY.knockout,
      sourceStage: "knockout",
      fixable: false,
    });
  }

  // ── Missed recruiter queries ──────────────────────────────────
  for (const q of queryResults) {
    if (q.hit) continue;

    if (q.kind === "title") {
      add({
        type: "add-title-alias",
        target: "summary",
        keyword: q.query,
        reason: "recruiter-query-miss:title-not-on-resume",
        priority: PRIORITY.requiredQueryMiss,
        sourceStage: "recruiter-search",
        fixable: true,
      });
      continue;
    }

    const keywords =
      q.kind === "combo"
        ? q.query.split(/\s+AND\s+/i)
        : [q.query];
    const priority =
      q.weight >= 1.0 ? PRIORITY.requiredQueryMiss : PRIORITY.minorQueryMiss;

    for (const keyword of keywords) {
      const reason = `recruiter-query-miss:${q.nearMissTier ? `${q.nearMissTier}-only` : "absent"}`;
      if (candidateHasSkill(keyword, candidateTech, adjudicated)) {
        add({
          type: "weave-bullet",
          target: "experience",
          keyword,
          reason,
          priority,
          sourceStage: "recruiter-search",
          fixable: true,
        });
      } else if (q.weight >= 1.0) {
        add({
          type: "not-fixable",
          target: "experience",
          keyword,
          reason: `${reason};skill-not-in-candidate-profile`,
          priority,
          sourceStage: "recruiter-search",
          fixable: false,
        });
      }
      // Low-weight phrase misses for skills the candidate lacks are dropped —
      // not worth surfacing noise the user cannot act on.
    }
  }

  // ── Parse losses (PDF round-trip) ─────────────────────────────
  for (const issue of parseIssues) {
    if (issue.kind === "compile-failed") continue; // informational
    add({
      type: "fix-parse-loss",
      target: "latex",
      keyword: issue.keyword ?? issue.kind,
      reason: `parse-simulation:${issue.kind} — ${issue.detail}`,
      priority: PRIORITY.knockout,
      sourceStage: "parse-simulation",
      fixable: true,
    });
  }

  return actions.sort((a, b) => b.priority - a.priority);
}

/** Fixable actions the repair loop can act on, best-first. */
export function fixableActions(plan: RepairAction[]): RepairAction[] {
  return plan.filter((a) => a.fixable);
}
