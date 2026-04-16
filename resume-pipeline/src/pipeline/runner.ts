// src/pipeline/runner.ts
// Main pipeline orchestrator — ties all stages together.
// JD Parser → Section Generators (parallel) → Validator + Repair → ATS Scorer → LaTeX Assembler

import { parseJD } from "../stages/jd-parser.js";
import {
  generateSummary,
  generateExperience,
  generateExperiencePerRole,
  targetedBulletRewrite,
  detectDeviations,
} from "../stages/section-generators.js";
import { reorderSkills } from "../stages/skills-reorderer.js";
import { generateCoverLetter } from "../stages/cover-letter.js";
import { parseLatexResume, assembleLatex } from "../stages/latex-assembler.js";
import { extractBoldKeywords } from "../stages/keyword-extractor.js";
import { repairKeywordGaps } from "../stages/keyword-gap-repair.js";
import { validateSections } from "../validation/validator.js";
import { repairBullets } from "../validation/repair.js";
import { calculateATSScore } from "../validation/ats-scorer.js";
import {
  scoreHumanVoice,
  estimateAIDetectionRisk,
  humanizePass,
  fixVerbCollisions,
} from "../validation/human-voice.js";
import type {
  HumanVoiceScore,
  AIDetectionResult,
} from "../validation/human-voice.js";
import { profileRoleImpact } from "../impact/detector.js";
import { PipelineTelemetry } from "../observability/trace.js";
import { RateLimitError } from "../observability/llm-wrapper.js";
import { buildCandidateProfile } from "../stages/candidate-profile.js";
import { categorizeJdSkills } from "../stages/implicit-skills.js";
import { buildRoleBriefs } from "../stages/bullet-brief.js";
import { buildPlans } from "../stages/bullet-plan.js";
import {
  rankAndTrim,
  buildRankingTrace,
  allocateBulletQuotas,
  type RankAndTrimConstraints,
} from "../stages/bullet-ranker.js";
import { extractDateRange } from "../stages/candidate-profile.js";
import type { ExperienceBullet } from "../schemas/experience.js";
import type {
  PipelineInput,
  PipelineOutput,
  PipelineConfig,
  GeneratedSections,
  ValidatedSections,
  FailedRule,
  InventedMetricEntry,
} from "../schemas/pipeline.js";
import { DEFAULT_CONFIG as defaultConfig } from "../schemas/pipeline.js";

// ── Event callback type for SSE streaming ───────────────────────
export type PipelineEventType =
  | "stage-start"
  | "stage-complete"
  | "jd-parsed"
  | "resume-ready"
  | "complete"
  | "error";

export interface PipelineEvent {
  type: PipelineEventType;
  stage?: string;
  data?: Record<string, unknown>;
}

export type OnPipelineEvent = (event: PipelineEvent) => void;

export async function runPipeline(
  input: PipelineInput,
  config: PipelineConfig = defaultConfig,
  onEvent?: OnPipelineEvent,
): Promise<PipelineOutput> {
  const emit = onEvent || (() => {});
  const telemetry = new PipelineTelemetry();
  const snapshotStore = telemetry.snapshotStore;
  let pipelineStatus: "success" | "partial" | "failed" = "success";

  console.log(
    `[pipeline] Starting generation (trace: ${telemetry.getTraceId()})`,
  );

  // ── Stage 1: Parse LaTeX ──────────────────────────────────────
  emit({ type: "stage-start", stage: "latex-parser" });
  telemetry.startStage("latex-parser");
  let parsed;
  try {
    parsed = parseLatexResume(input.baseResumeLatex);
    console.log(
      `[pipeline] Parsed ${parsed.experience.length} roles, ${parsed.experience.reduce((s, r) => s + r.bullets.length, 0)} total bullets`,
    );
    telemetry.endStage("latex-parser");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    telemetry.failStage("latex-parser", msg);
    throw new Error(`LaTeX parsing failed: ${msg}`);
  }

  // ── Stage 2: JD Parser (LLM Call #1) ──────────────────────────
  emit({ type: "stage-start", stage: "jd-parser" });
  telemetry.startStage("jd-parser");
  let jdResult;
  try {
    jdResult = await parseJD(input.jobDescription, snapshotStore);
    console.log(
      `[pipeline] JD parsed: ${jdResult.jdAnalysis.position} at ${jdResult.jdAnalysis.company}`,
    );
    telemetry.endStage(
      "jd-parser",
      1,
      jdResult.inputTokens,
      jdResult.outputTokens,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    telemetry.failStage("jd-parser", msg);
    throw new Error(`JD parsing failed: ${msg}`);
  }

  const jd = jdResult.jdAnalysis;

  // Emit JD parsed event with extracted metadata
  emit({
    type: "jd-parsed",
    stage: "jd-parser",
    data: {
      position: jd.position,
      company: jd.company,
      jobId: jd.jobId,
      location: jd.location,
    },
  });

  // ── Stage 2.5: Candidate Profile (deterministic, 0 LLM calls) ──
  const candidateProfile = buildCandidateProfile({
    parsed,
    yearsOfExperienceOverride: input.yearsOfExperienceOverride,
  });
  console.log(
    `[pipeline] Candidate profile: YoE=${candidateProfile.yearsOfExperience.toFixed(1)} (${candidateProfile.yoeSource}), tier=${candidateProfile.seniorityTier}, tech=${candidateProfile.technologiesUsed.length}, domains=[${candidateProfile.domainCategories.join(", ")}]`,
  );
  telemetry.recordCandidateProfile({
    yearsOfExperience: candidateProfile.yearsOfExperience,
    yoeSource: candidateProfile.yoeSource,
    seniorityTier: candidateProfile.seniorityTier,
    technologiesUsed: candidateProfile.technologiesUsed,
    domainCategories: candidateProfile.domainCategories,
  });

  // Bucket each JD skill into: explicit (in base resume literally),
  // implicit (backed by an explicit skill via adjacency rules, e.g.
  // Spring Boot → J2EE / REST API development / Mockito), or truly
  // missing (would be fabrication to claim). The summary and experience
  // generators treat implicit skills as honest — naming J2EE next to
  // Spring Boot is NOT fabrication.
  const jdSkillBuckets = categorizeJdSkills(
    [...jd.requiredSkills, ...jd.preferredSkills],
    candidateProfile.technologiesUsed,
  );
  if (jdSkillBuckets.implicit.length > 0) {
    const withSources = jdSkillBuckets.implicit
      .map(
        (s) =>
          `${s} (via ${jdSkillBuckets.implicitSources[s]?.join(" + ") || "inferred"})`,
      )
      .join(", ");
    console.log(
      `[pipeline] JD skills implicitly backed by base resume (safe to claim): ${withSources}`,
    );
  }
  if (jdSkillBuckets.missing.length > 0) {
    console.log(
      `[pipeline] JD skills truly missing from base resume (will NOT be claimed to avoid fabrication): ${jdSkillBuckets.missing.join(", ")}`,
    );
  }

  // ── Stage 3: Section Generators (sequential to stay within rate limits) ──
  emit({ type: "stage-start", stage: "generators" });
  telemetry.startStage("generators");

  // Extract current summary text from parsed resume
  const currentSummary = extractSummaryText(parsed.summary);

  // Run summary and experience generation in parallel. Primary mode is
  // per-role structured generation; the batch generator is the fallback
  // used when usePerRoleGeneration=false (followed by a targeted rewrite).
  const experienceGenerator = config.modules.usePerRoleGeneration
    ? generateExperiencePerRole
    : generateExperience;

  const [summaryResult, experienceResult] = await Promise.all([
    generateSummary(
      currentSummary,
      jd,
      jd.experienceLevel,
      candidateProfile,
      snapshotStore,
    ).catch((err) => {
      if (err instanceof RateLimitError) throw err; // propagate rate limit up
      console.error(
        "[pipeline] Summary generation failed, using original:",
        err,
      );
      telemetry.recordError("summary-generator", err.message);
      return {
        summary: currentSummary,
        inputTokens: 0,
        outputTokens: 0,
        rewroteForBuzzwords: false,
      };
    }),
    experienceGenerator(
      parsed.experience,
      jd,
      jd.experienceLevel,
      candidateProfile,
      snapshotStore,
    ).catch((err) => {
      if (err instanceof RateLimitError) throw err; // propagate rate limit up
      console.error(
        "[pipeline] Experience generation failed, using original:",
        err,
      );
      telemetry.recordError("experience-generator", err.message);
      const fallbackBullets: ExperienceBullet[][] = parsed.experience.map(
        (r) =>
          r.bullets.map((t) => ({
            text: t,
            technologies: [],
            keywordsUsed: [],
            invented: null,
          })),
      );
      return {
        roles: parsed.experience.map((r) => ({
          roleTitle: "",
          company: "",
          bullets: r.bullets,
        })),
        bullets: fallbackBullets,
        inputTokens: 0,
        outputTokens: 0,
      };
    }),
  ]);

  // ── Stage 3.5: Hybrid Fallback — targeted rewrite of bad bullets ──
  // Only runs when usePerRoleGeneration=false. Detects bullets that failed
  // their plan (wrong length, missing verb, buzzword, lost tech...) and
  // rewrites ONLY those in a single extra LLM call.
  let hybridInputTokens = 0;
  let hybridOutputTokens = 0;
  let hybridRewriteCount = 0;
  if (
    !config.modules.usePerRoleGeneration &&
    experienceResult.inputTokens > 0
  ) {
    try {
      const rolesBriefs = parsed.experience.map((role, ri) =>
        buildRoleBriefs(
          role.bullets,
          ri,
          [...jd.requiredSkills, ...jd.preferredSkills],
        ),
      );
      const plans = buildPlans({
        rolesBriefs,
        jobIdSeed: `${jd.company}|${jd.position}|${jd.jobId || "nojob"}`,
      });
      const targets = detectDeviations(
        experienceResult.bullets,
        rolesBriefs,
        plans,
        jd,
      );
      if (targets.length > 0) {
        console.log(
          `[pipeline] Hybrid fallback: ${targets.length} bullets failed their plan, triggering targeted rewrite`,
        );
        const enriched = targets.map((t) => ({
          ...t,
          plan: plans[t.roleIndex][t.bulletIndex],
          brief: rolesBriefs[t.roleIndex][t.bulletIndex],
        }));
        telemetry.startStage("targeted-bullet-rewrite");
        const rewriteResult = await targetedBulletRewrite(
          enriched,
          jd,
          candidateProfile,
          snapshotStore,
        );
        telemetry.endStage(
          "targeted-bullet-rewrite",
          1,
          rewriteResult.inputTokens,
          rewriteResult.outputTokens,
        );
        hybridInputTokens = rewriteResult.inputTokens;
        hybridOutputTokens = rewriteResult.outputTokens;

        for (const t of targets) {
          const key = `${t.roleIndex}-${t.bulletIndex}`;
          const fix = rewriteResult.rewrites.get(key);
          if (!fix) continue;
          experienceResult.roles[t.roleIndex].bullets[t.bulletIndex] = fix.text;
          experienceResult.bullets[t.roleIndex][t.bulletIndex] = {
            text: fix.text,
            technologies:
              experienceResult.bullets[t.roleIndex][t.bulletIndex]
                ?.technologies || [],
            keywordsUsed: fix.keywordsUsed,
            invented: fix.invented,
          };
          hybridRewriteCount++;
        }
        console.log(
          `[pipeline] Hybrid fallback: ${hybridRewriteCount} bullets rewritten`,
        );
      } else {
        telemetry.skipStage(
          "targeted-bullet-rewrite",
          "no bullets deviated from plan",
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[pipeline] Hybrid fallback failed: ${msg}`);
      telemetry.failStage("targeted-bullet-rewrite", msg);
    }
  }

  // ── Bullet Count Preservation ─────────────────────────────────
  // Design §5.3: The LLM MUST return the same number of bullets per role.
  // If it doesn't, pad with originals or trim to preserve structure.
  for (let i = 0; i < parsed.experience.length; i++) {
    const expected = parsed.experience[i].bullets.length;
    const actual = experienceResult.roles[i]?.bullets.length ?? 0;

    if (actual !== expected) {
      console.warn(
        `[pipeline] Bullet count mismatch for role ${i}: expected ${expected}, got ${actual}. Correcting.`,
      );

      if (actual < expected) {
        // Pad with original bullets the LLM missed
        const padded = [...experienceResult.roles[i].bullets];
        for (let j = actual; j < expected; j++) {
          padded.push(parsed.experience[i].bullets[j]);
        }
        experienceResult.roles[i].bullets = padded;
      } else {
        // Trim excess bullets
        experienceResult.roles[i].bullets = experienceResult.roles[
          i
        ].bullets.slice(0, expected);
      }
    }
  }

  // ── Stage 3.6: Bullet Relevance Ranking + Trimming ────────────
  // Deterministic, 0 LLM calls. Two-step design:
  //
  //  1. Tenure-weighted quota allocation: the resume-wide budget
  //     (maxBulletsTotal) is split across roles proportional to each
  //     role's tenure using sqrt(months) weighting. A 3-year role
  //     gets materially more space than a 4-month contract while
  //     short roles are still protected by minBulletsPerRole.
  //  2. Within each role, every rewritten bullet is scored against
  //     the JD (required/preferred skills, key phrases,
  //     responsibilities, LLM-reported keywords, metric, IDS impact),
  //     reordered by descending relevance, and trimmed down to the
  //     role's quota.
  //
  // Runs BEFORE gap repair / humanize so those LLM stages only polish
  // bullets we're actually keeping. Chronological order across roles
  // is preserved — only in-role order changes.
  telemetry.startStage("bullet-ranking");
  const smallestRoleSize = Math.min(
    ...parsed.experience.map((r) => r.bullets.length),
  );
  const roleTenureInputs = experienceResult.roles.map((r, i) => {
    const range = extractDateRange(parsed.experience[i].heading);
    const months = range
      ? Math.max(1, Math.round((range.endYear - range.startYear) * 12))
      : null;
    return {
      originalCount: r.bullets.length,
      months,
    };
  });
  const allocation = allocateBulletQuotas({
    roles: roleTenureInputs,
    minPerRole: Math.min(config.constraints.minBulletsPerRole, smallestRoleSize),
    maxPerRole: config.constraints.maxBulletsPerRole,
    maxTotal: config.constraints.maxBulletsTotal,
  });
  const rankConstraints: RankAndTrimConstraints = {
    minBulletsPerRole: Math.min(
      config.constraints.minBulletsPerRole,
      smallestRoleSize,
    ),
    maxBulletsPerRole: config.constraints.maxBulletsPerRole,
    maxBulletsTotal: config.constraints.maxBulletsTotal,
    perRoleTargets: allocation.perRole,
  };
  const rankResult = rankAndTrim(
    experienceResult.roles,
    experienceResult.bullets,
    jd,
    rankConstraints,
  );
  const rankingTrace = buildRankingTrace(rankResult, rankConstraints, allocation);
  telemetry.recordBulletRanking(rankingTrace);
  // Swap in the trimmed + reordered roles/structured bullets so that
  // ALL downstream stages — invented-metric collection, validator,
  // ATS scorer, gap repair, humanize, assembler — operate on the
  // final bullet set. Because the structured bullets are reordered
  // in lockstep, inventedMetrics indexes collected below are already
  // correct for the final resume (no remap needed).
  experienceResult.roles = rankResult.roles;
  experienceResult.bullets = rankResult.structuredBullets;
  telemetry.endStage("bullet-ranking");

  const allocSummary = rankingTrace.roles
    .map((r) => {
      const label = r.company || r.roleTitle || `role-${r.roleIndex}`;
      const tenure = r.tenureMonths != null ? `${r.tenureMonths}mo` : "?mo";
      return `${label} [${tenure}, quota=${r.quotaTarget ?? "-"}]: ${r.originalBulletCount}→${r.keptBulletCount}`;
    })
    .join(", ");
  console.log(
    `[pipeline] Bullet ranking: ${allocSummary} ` +
      `(dropped by role-cap=${rankResult.droppedByRoleCap}, ` +
      `total-cap=${rankResult.droppedByTotalCap}, total=${rankingTrace.totals.keptBullets}/${rankingTrace.totals.originalBullets})`,
  );

  // Deterministic: reorder skills by JD relevance
  const reorderedSkills = reorderSkills(parsed.skills, jd);

  const totalGenTokensIn =
    summaryResult.inputTokens +
    experienceResult.inputTokens +
    hybridInputTokens;
  const totalGenTokensOut =
    summaryResult.outputTokens +
    experienceResult.outputTokens +
    hybridOutputTokens;
  const totalGenCalls =
    (summaryResult.inputTokens > 0 ? 1 : 0) +
    (experienceResult.inputTokens > 0 ? 1 : 0) +
    (hybridRewriteCount > 0 ? 1 : 0) +
    (summaryResult.rewroteForBuzzwords ? 1 : 0);

  telemetry.endStage(
    "generators",
    totalGenCalls,
    totalGenTokensIn,
    totalGenTokensOut,
  );

  // Collect invented metrics from the structured bullet output. These are
  // surfaced in the trace so the frontend can render a "Review these
  // invented numbers" banner. Populated regardless of generator mode.
  const inventedMetrics: InventedMetricEntry[] = [];
  for (let ri = 0; ri < experienceResult.bullets.length; ri++) {
    const roleBullets = experienceResult.bullets[ri] || [];
    for (let bi = 0; bi < roleBullets.length; bi++) {
      const b = roleBullets[bi];
      const inv = b?.invented;
      if (!inv) continue;
      if (inv.metric) {
        inventedMetrics.push({
          roleIndex: ri,
          bulletIndex: bi,
          field: "metric",
          value: inv.metric,
          bullet: b.text,
        });
      }
      if (inv.scope) {
        inventedMetrics.push({
          roleIndex: ri,
          bulletIndex: bi,
          field: "scope",
          value: inv.scope,
          bullet: b.text,
        });
      }
      if (inv.context) {
        inventedMetrics.push({
          roleIndex: ri,
          bulletIndex: bi,
          field: "context",
          value: inv.context,
          bullet: b.text,
        });
      }
    }
  }
  telemetry.recordInventedMetrics(inventedMetrics);
  if (inventedMetrics.length > 0) {
    console.log(
      `[pipeline] Invented ${inventedMetrics.length} items (${inventedMetrics.filter((i) => i.field === "metric").length} metrics, ${inventedMetrics.filter((i) => i.field === "scope").length} scopes, ${inventedMetrics.filter((i) => i.field === "context").length} contexts)`,
    );
  }

  // Build generated sections
  let sections: GeneratedSections = {
    summary: summaryResult.summary,
    skills: reorderedSkills,
    experience: experienceResult.roles,
    coverLetter: "", // placeholder, merged later
  };

  // ── Stage 4: Validator + Repair ───────────────────────────────
  emit({ type: "stage-start", stage: "validator" });
  telemetry.startStage("validator");

  // Cap minBulletsPerRole at the smallest original role count.
  // We can't require the LLM to generate 8 bullets when the base resume
  // only had 6 for a role — that would fabricate work experience.
  const smallestOriginalRoleCount = Math.min(
    ...parsed.experience.map((r) => r.bullets.length),
  );
  if (smallestOriginalRoleCount < config.constraints.minBulletsPerRole) {
    console.log(
      `[pipeline] Adjusting minBulletsPerRole: ${config.constraints.minBulletsPerRole} → ${smallestOriginalRoleCount} (capped at smallest original role)`,
    );
    config = {
      ...config,
      constraints: {
        ...config.constraints,
        minBulletsPerRole: smallestOriginalRoleCount,
      },
    };
  }

  const validationResult = validateSections(sections, jd, config);
  let repairAttempts = 0;
  let repairTokensIn = 0;
  let repairTokensOut = 0;

  console.log(
    `[pipeline] Validation: ${validationResult.pass ? "PASS" : "FAIL"} (${validationResult.errors.filter((e) => e.severity === "critical").length} critical, ${validationResult.errors.filter((e) => e.severity === "warning").length} warnings)`,
  );

  if (!validationResult.pass) {
    // Attempt per-bullet repair
    const criticalErrors = validationResult.errors.filter(
      (e) => e.severity === "critical",
    );
    const jdKeywords = [...jd.requiredSkills, ...jd.preferredSkills];

    try {
      const repairResult = await repairBullets(
        sections.experience,
        criticalErrors,
        jdKeywords,
        config.constraints.maxRepairAttempts,
        snapshotStore,
      );

      sections.experience = repairResult.repairedRoles;
      repairAttempts = repairResult.repairAttempts;
      repairTokensIn = repairResult.totalInputTokens;
      repairTokensOut = repairResult.totalOutputTokens;

      // Re-validate after repair
      const postRepairResult = validateSections(sections, jd, config);
      if (!postRepairResult.pass) {
        pipelineStatus = "partial";
        const criticals = postRepairResult.errors.filter(
          (e) => e.severity === "critical",
        );
        console.log(
          `[pipeline] Post-repair validation: still ${criticals.length} critical issues (using best attempt)`,
        );
        // Log each remaining critical for diagnosis
        for (const err of criticals) {
          console.log(
            `[pipeline]   ❌ ${err.rule}: ${err.message.substring(0, 120)}`,
          );
        }
      }
    } catch (error) {
      if (error instanceof RateLimitError) throw error; // propagate rate limit up
      console.error("[pipeline] Repair failed, using original:", error);
      pipelineStatus = "partial";
    }
  }

  const repairCalls = repairAttempts > 0 ? repairAttempts : 0;
  telemetry.endStage("validator", repairCalls, repairTokensIn, repairTokensOut);

  // ── Stage 4.5: ATS Score ──────────────────────────────────────
  telemetry.startStage("ats-scorer");
  let atsScore = calculateATSScore(sections, jd);
  console.log(`[pipeline] ATS Score: ${atsScore.overall}/100`);
  telemetry.endStage("ats-scorer");

  // ── Stage 4.6: Keyword Gap Repair (up to 2 passes if ATS < 85) ─
  const ATS_GAP_REPAIR_THRESHOLD = 85;
  const MAX_GAP_REPAIR_PASSES = 2;
  let gapRepairTotalIn = 0;
  let gapRepairTotalOut = 0;
  let gapRepairPasses = 0;

  for (let pass = 1; pass <= MAX_GAP_REPAIR_PASSES; pass++) {
    if (
      atsScore.overall >= ATS_GAP_REPAIR_THRESHOLD ||
      (atsScore.missingRequired.length === 0 &&
        atsScore.missingPreferred.length === 0)
    ) {
      break;
    }

    try {
      console.log(
        `[pipeline] ATS ${atsScore.overall} < ${ATS_GAP_REPAIR_THRESHOLD}, keyword gap repair pass ${pass}/${MAX_GAP_REPAIR_PASSES} (${atsScore.missingRequired.length} required, ${atsScore.missingPreferred.length} preferred missing)`,
      );
      telemetry.startStage(`keyword-gap-repair-${pass}`);
      const gapResult = await repairKeywordGaps(
        sections,
        jd,
        atsScore.missingRequired,
        atsScore.missingPreferred,
        snapshotStore,
      );
      sections = gapResult.sections;
      gapRepairTotalIn += gapResult.inputTokens;
      gapRepairTotalOut += gapResult.outputTokens;
      gapRepairPasses++;
      telemetry.endStage(
        `keyword-gap-repair-${pass}`,
        1,
        gapResult.inputTokens,
        gapResult.outputTokens,
      );

      // Re-score after repair
      const prevScore = atsScore.overall;
      atsScore = calculateATSScore(sections, jd);
      console.log(
        `[pipeline] ATS after gap repair pass ${pass}: ${prevScore} → ${atsScore.overall}`,
      );

      // Stop if no improvement (avoid wasting tokens)
      if (atsScore.overall <= prevScore) {
        console.log(
          `[pipeline] No ATS improvement on pass ${pass}, stopping gap repair`,
        );
        break;
      }
    } catch (error) {
      // Non-critical — keep current sections
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[pipeline] Keyword gap repair pass ${pass} failed: ${msg}`);
      telemetry.failStage(`keyword-gap-repair-${pass}`, msg);
      break;
    }
  }

  // ── Stage 4.7: Keyword Extraction for Bolding ────────────────
  let boldKeywords = [
    ...jd.requiredSkills,
    ...jd.preferredSkills,
    ...jd.keyPhrases,
  ];
  try {
    telemetry.startStage("keyword-extractor");
    const kwResult = await extractBoldKeywords(sections, jd, snapshotStore);
    // Merge LLM-identified phrases with JD skills (deduplicated in boldifyKeywords)
    boldKeywords = [...boldKeywords, ...kwResult.boldPhrases];
    telemetry.endStage(
      "keyword-extractor",
      1,
      kwResult.inputTokens,
      kwResult.outputTokens,
    );
  } catch (error) {
    // Non-critical — fall back to JD skills only
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(
      `[pipeline] Keyword extraction failed, using JD skills only: ${msg}`,
    );
    telemetry.failStage("keyword-extractor", msg);
  }

  // ── Stage 4.8: Human Voice + Anti-AI Scoring ──────────────────
  let humanVoiceResult: HumanVoiceScore | undefined;
  let aiDetectionResult: AIDetectionResult | undefined;

  const allExperienceBullets = sections.experience.flatMap((r) => r.bullets);

  if (config.modules.useHumanVoiceScoring) {
    telemetry.startStage("human-voice");
    humanVoiceResult = scoreHumanVoice(allExperienceBullets);
    console.log(
      `[pipeline] Human Voice Score: ${humanVoiceResult.overall}/100 ` +
        `(verb=${humanVoiceResult.verbDiversity}, length=${humanVoiceResult.lengthVariance}, ` +
        `metrics=${humanVoiceResult.metricsBalance}, buzzwords=${humanVoiceResult.buzzwordDensity}, ` +
        `patterns=${humanVoiceResult.sentencePatterns})`,
    );
    telemetry.endStage("human-voice");
  } else {
    telemetry.skipStage(
      "human-voice",
      "Module disabled (useHumanVoiceScoring=false)",
    );
  }

  if (config.modules.useAntiAIDetection) {
    telemetry.startStage("anti-ai-detection");
    aiDetectionResult = estimateAIDetectionRisk(allExperienceBullets);
    console.log(
      `[pipeline] AI Detection Risk: ${aiDetectionResult.risk.toUpperCase()}` +
        (aiDetectionResult.signals.length > 0
          ? ` — ${aiDetectionResult.signals.join("; ")}`
          : ""),
    );
    if (aiDetectionResult.risk === "high") {
      pipelineStatus = "partial";
      console.warn(
        "[pipeline] HIGH AI detection risk — resume may be flagged by recruiters",
      );
    }
    telemetry.endStage("anti-ai-detection");
  } else {
    telemetry.skipStage(
      "anti-ai-detection",
      "Module disabled (useAntiAIDetection=false)",
    );
  }

  // ── Stage 4.9: Humanize Pass (reactive — score too low OR AI risk detected) ──
  // Threshold now config-driven. Default 70 (was 60). We also gate on an
  // explicit burstiness hard-check: if bullet-length stdDev falls below
  // burstinessMinStdDev (default 4), humanize runs regardless of the
  // composite score — flat bullet lengths are the single strongest AI signal.
  const HUMANIZE_THRESHOLD = config.constraints.humanVoiceThreshold;
  const MAX_HUMANIZE_PASSES = 2;
  const humanizeJdKeywords = [...jd.requiredSkills, ...jd.preferredSkills];
  let humanizePassCount = 0;

  const lengthStdDev = (bs: string[]): number => {
    if (bs.length === 0) return 0;
    const words = bs.map((b) => b.split(/\s+/).length);
    const mean = words.reduce((a, b) => a + b, 0) / words.length;
    const variance =
      words.reduce((a, c) => a + Math.pow(c - mean, 2), 0) / words.length;
    return Math.sqrt(variance);
  };

  for (let hPass = 1; hPass <= MAX_HUMANIZE_PASSES; hPass++) {
    const currentBullets = sections.experience.flatMap((r) => r.bullets);
    const currentVoice = hPass === 1 ? humanVoiceResult : scoreHumanVoice(currentBullets);
    const currentAI = hPass === 1 ? aiDetectionResult : estimateAIDetectionRisk(currentBullets);
    const stdDev = lengthStdDev(currentBullets);
    const burstinessFailed = stdDev < config.constraints.burstinessMinStdDev;

    const needsHumanize =
      currentVoice &&
      (
        (config.modules.useHumanVoiceScoring && currentVoice.overall < HUMANIZE_THRESHOLD) ||
        (config.modules.useAntiAIDetection && currentAI && currentAI.risk !== "low") ||
        burstinessFailed
      );

    if (!needsHumanize || !currentVoice) break;

    const reason =
      currentVoice.overall < HUMANIZE_THRESHOLD
        ? `Human Voice ${currentVoice.overall} < ${HUMANIZE_THRESHOLD}`
        : burstinessFailed
          ? `Burstiness stdDev ${stdDev.toFixed(1)} < ${config.constraints.burstinessMinStdDev}`
          : `AI Detection Risk: ${currentAI!.risk.toUpperCase()}`;

    try {
      console.log(
        `[pipeline] ${reason}, triggering humanize pass ${hPass}/${MAX_HUMANIZE_PASSES}...`,
      );
      telemetry.startStage(`humanize-pass-${hPass}`);
      const humanizeResult = await humanizePass(
        sections,
        currentVoice,
        currentAI?.signals || [],
        jd.experienceLevel,
        humanizeJdKeywords,
        snapshotStore,
      );
      sections = humanizeResult.sections;
      humanizePassCount++;
      telemetry.endStage(
        `humanize-pass-${hPass}`,
        1,
        humanizeResult.inputTokens,
        humanizeResult.outputTokens,
      );

      // Re-score after humanize pass
      const updatedBullets = sections.experience.flatMap((r) => r.bullets);
      const prevScore = currentVoice.overall;
      humanVoiceResult = scoreHumanVoice(updatedBullets);
      aiDetectionResult = estimateAIDetectionRisk(updatedBullets);
      console.log(
        `[pipeline] Human Voice after humanize pass ${hPass}: ${prevScore} → ${humanVoiceResult.overall}/100 | AI Risk: ${aiDetectionResult.risk}`,
      );

      // Re-check ATS score after humanize — guard against keyword loss
      const preHumanizeAts = atsScore.overall;
      atsScore = calculateATSScore(sections, jd);
      if (atsScore.overall < preHumanizeAts - 5) {
        console.warn(
          `[pipeline] ATS regression after humanize: ${preHumanizeAts} -> ${atsScore.overall}. ` +
            `Triggering keyword gap repair to recover.`,
        );
        try {
          const recoveryResult = await repairKeywordGaps(
            sections, jd, atsScore.missingRequired, atsScore.missingPreferred, snapshotStore,
          );
          sections = recoveryResult.sections;
          atsScore = calculateATSScore(sections, jd);
          console.log(`[pipeline] ATS after recovery: ${atsScore.overall}`);
        } catch (err) {
          console.warn(`[pipeline] ATS recovery failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      const postStdDev = lengthStdDev(updatedBullets);
      if (
        humanVoiceResult.overall >= HUMANIZE_THRESHOLD &&
        (!aiDetectionResult || aiDetectionResult.risk === "low") &&
        postStdDev >= config.constraints.burstinessMinStdDev
      ) {
        break;
      }
    } catch (error) {
      // Non-critical — keep current bullets
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[pipeline] Humanize pass ${hPass} failed: ${msg}`);
      telemetry.failStage(`humanize-pass-${hPass}`, msg);
      break;
    }
  }

  if (humanizePassCount === 0 && humanVoiceResult) {
    const finalStdDev = lengthStdDev(
      sections.experience.flatMap((r) => r.bullets),
    );
    telemetry.skipStage(
      "humanize-pass",
      `Human Voice ${humanVoiceResult.overall} >= ${HUMANIZE_THRESHOLD}, AI risk ${aiDetectionResult?.risk ?? "not checked"}, stdDev ${finalStdDev.toFixed(1)} >= ${config.constraints.burstinessMinStdDev}`,
    );
  }

  // ── Stage 4.95: Surgical Verb Dedup (fixes collisions introduced by humanize) ──
  if (humanizePassCount > 0) {
    const postBullets = sections.experience.flatMap((r) => r.bullets);
    const postVerbs = postBullets.map((b) => b.trim().split(/\s+/)[0].toLowerCase());
    const postVerbCounts = new Map<string, number>();
    postVerbs.forEach((v) => postVerbCounts.set(v, (postVerbCounts.get(v) || 0) + 1));
    const hasCollisions = [...postVerbCounts.values()].some((c) => c > 2);

    if (hasCollisions) {
      try {
        telemetry.startStage("verb-dedup");
        const dedupResult = await fixVerbCollisions(
          sections,
          humanizeJdKeywords,
          jd.experienceLevel,
          snapshotStore,
        );
        if (dedupResult.fixed > 0) {
          sections = dedupResult.sections;
          aiDetectionResult = estimateAIDetectionRisk(
            sections.experience.flatMap((r) => r.bullets),
          );
          console.log(
            `[pipeline] AI Risk after verb dedup: ${aiDetectionResult.risk}`,
          );
        }
        telemetry.endStage(
          "verb-dedup",
          dedupResult.fixed > 0 ? 1 : 0,
          dedupResult.inputTokens,
          dedupResult.outputTokens,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[pipeline] Verb dedup failed: ${msg}`);
        telemetry.failStage("verb-dedup", msg);
      }
    } else {
      telemetry.skipStage("verb-dedup", "No verb collisions detected after humanize");
    }
  }

  // ── Final ATS recalculation (accounts for all humanize + verb-dedup changes) ──
  atsScore = calculateATSScore(sections, jd);

  // ── Stage 5: LaTeX Assembly ───────────────────────────────────
  emit({ type: "stage-start", stage: "latex-assembler" });
  telemetry.startStage("latex-assembler");
  const validatedSections: ValidatedSections = {
    ...sections,
    status: pipelineStatus as "success" | "partial",
  };

  let finalLatex: string;
  try {
    finalLatex = assembleLatex(parsed, validatedSections, boldKeywords);
    telemetry.endStage("latex-assembler");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    telemetry.failStage("latex-assembler", msg);
    // Fallback: return original LaTeX
    finalLatex = input.baseResumeLatex;
    pipelineStatus = "partial";
    console.error("[pipeline] Assembly failed, returning original LaTeX:", msg);
  }

  // ── Emit resume-ready event (resume is viewable now) ──────────
  emit({
    type: "resume-ready",
    data: {
      latex: finalLatex,
      position: jd.position,
      company: jd.company,
      jobId: jd.jobId,
      location: jd.location,
      atsScore: atsScore.overall,
    },
  });

  // ── Cover Letter Generation (runs AFTER resume is shown) ──────
  if (config.modules.useCoverLetter) {
    telemetry.startStage("cover-letter");
    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    try {
      const clResult = await generateCoverLetter(
        jd,
        input.userInfo || "",
        input.masterSubjects || "",
        currentDate,
        snapshotStore,
      );
      sections.coverLetter = clResult.coverLetter;
      if (clResult.inputTokens > 0) {
        telemetry.endStage(
          "cover-letter",
          1,
          clResult.inputTokens,
          clResult.outputTokens,
        );
      } else {
        telemetry.failStage("cover-letter", "No tokens returned");
      }
    } catch (err) {
      // Cover letter is non-critical — rate limit here is OK, just skip it
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[pipeline] Cover letter generation failed:", msg);
      sections.coverLetter = "";
      telemetry.failStage("cover-letter", msg);
    }
  } else {
    telemetry.skipStage(
      "cover-letter",
      "Module disabled (useCoverLetter=false)",
    );
    sections.coverLetter = "";
  }

  // ── Compute Impact Score ──────────────────────────────────────
  const allBullets = sections.experience.flatMap((r) => r.bullets);
  const jdKeywords = [...jd.requiredSkills, ...jd.preferredSkills];
  let impactScore = 0;
  let metricsRatio = 0;
  if (allBullets.length > 0) {
    const profile = profileRoleImpact(
      "all-roles",
      allBullets,
      jdKeywords,
      jd.experienceLevel,
    );
    impactScore = profile.overallScore;
    const withMetrics = allBullets.filter((b) => /\d/.test(b)).length;
    metricsRatio = withMetrics / allBullets.length;
  }

  // ── Record failed rules for trace ─────────────────────────────
  const ruleCountMap = new Map<
    string,
    {
      rule: string;
      section: string;
      severity: "critical" | "warning";
      count: number;
    }
  >();
  for (const err of validationResult.errors) {
    const key = `${err.section}:${err.rule}`;
    const existing = ruleCountMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      ruleCountMap.set(key, {
        rule: err.rule,
        section: err.section,
        severity: err.severity,
        count: 1,
      });
    }
  }
  telemetry.recordFailedRules([...ruleCountMap.values()]);

  // ── Finalize Trace ────────────────────────────────────────────
  const trace = telemetry.finalize(
    pipelineStatus,
    {
      ats: atsScore.overall,
      impactScore,
      humanVoice: humanVoiceResult?.overall,
      aiDetectionRisk: aiDetectionResult?.risk,
    },
    {
      totalChecks: validationResult.errors.length,
      passed:
        validationResult.errors.length -
        validationResult.errors.filter((e) => e.severity === "critical").length,
      failed: validationResult.errors.filter((e) => e.severity === "critical")
        .length,
      repairAttempts,
    },
    {
      config,
      input: {
        jdLength: input.jobDescription.length,
        rolesCount: parsed.experience.length,
        totalBullets: parsed.experience.reduce(
          (s, r) => s + r.bullets.length,
          0,
        ),
      },
      impactProfile: {
        overallScore: impactScore,
        metricsRatio,
      },
    },
  );

  console.log(
    `[pipeline] Complete in ${trace.durationMs}ms | Status: ${pipelineStatus} | ATS: ${atsScore.overall} | Impact: ${impactScore}` +
      (humanVoiceResult ? ` | HumanVoice: ${humanVoiceResult.overall}` : "") +
      (aiDetectionResult ? ` | AI-Risk: ${aiDetectionResult.risk}` : "") +
      ` | LLM calls: ${trace.cost.llmCalls}`,
  );

  emit({
    type: "complete",
    data: {
      coverLetter: sections.coverLetter,
      atsScore: atsScore.overall,
      impactScore,
      durationMs: trace.durationMs,
    },
  });

  return {
    latex: finalLatex,
    coverLetter: sections.coverLetter,
    position: jd.position,
    company: jd.company,
    jobId: jd.jobId,
    location: jd.location,
    atsScore: atsScore.overall,
    jdAnalysis: jd,
    trace,
  };
}

/**
 * Extract plain text summary from the parsed summary section.
 */
function extractSummaryText(summarySection: string): string {
  // Try to extract from \resumeItem{...}
  const match = summarySection.match(/\\resumeItem\{((?:[^{}]|\{[^{}]*\})*)\}/);
  if (match) return match[1].trim();

  // Try to extract from \small{...}
  const smallMatch = summarySection.match(/\\small\{((?:[^{}]|\{[^{}]*\})*)\}/);
  if (smallMatch) return smallMatch[1].trim();

  // Fallback: strip LaTeX commands and return raw text
  return summarySection
    .replace(/\\section\{[^}]*\}/g, "")
    .replace(/\\resumeSubHeadingListStart/g, "")
    .replace(/\\resumeSubHeadingListEnd/g, "")
    .replace(/\\resumeItemListStart/g, "")
    .replace(/\\resumeItemListEnd/g, "")
    .trim();
}
