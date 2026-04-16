// src/pipeline/runner.ts
// Main pipeline orchestrator — ties all stages together.
// JD Parser → Section Generators (parallel) → Validator + Repair → ATS Scorer → LaTeX Assembler

import { parseJD } from "../stages/jd-parser.js";
import {
  generateSummary,
  generateExperience,
  generateExperiencePerRole,
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
} from "../validation/human-voice.js";
import type {
  HumanVoiceScore,
  AIDetectionResult,
} from "../validation/human-voice.js";
import { profileRoleImpact } from "../impact/detector.js";
import { PipelineTelemetry } from "../observability/trace.js";
import { RateLimitError } from "../observability/llm-wrapper.js";
import type {
  PipelineInput,
  PipelineOutput,
  PipelineConfig,
  GeneratedSections,
  ValidatedSections,
  FailedRule,
  DEFAULT_CONFIG,
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

  // ── Stage 3: Section Generators (sequential to stay within rate limits) ──
  emit({ type: "stage-start", stage: "generators" });
  telemetry.startStage("generators");

  // Extract current summary text from parsed resume
  const currentSummary = extractSummaryText(parsed.summary);

  // Run summary and experience generation in parallel
  const experienceGenerator = config.modules.usePerRoleGeneration
    ? generateExperiencePerRole
    : generateExperience;

  const [summaryResult, experienceResult] = await Promise.all([
    generateSummary(
      currentSummary,
      jd,
      jd.experienceLevel,
      snapshotStore,
    ).catch((err) => {
      if (err instanceof RateLimitError) throw err; // propagate rate limit up
      console.error(
        "[pipeline] Summary generation failed, using original:",
        err,
      );
      telemetry.recordError("summary-generator", err.message);
      return { summary: currentSummary, inputTokens: 0, outputTokens: 0 };
    }),
    experienceGenerator(
      parsed.experience,
      jd,
      jd.experienceLevel,
      input.userInfo,
      snapshotStore,
    ).catch((err) => {
      if (err instanceof RateLimitError) throw err; // propagate rate limit up
      console.error(
        "[pipeline] Experience generation failed, using original:",
        err,
      );
      telemetry.recordError("experience-generator", err.message);
      return {
        roles: parsed.experience.map((r) => ({
          roleTitle: "",
          company: "",
          bullets: r.bullets,
        })),
        inputTokens: 0,
        outputTokens: 0,
      };
    }),
  ]);

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

  // Deterministic: reorder skills by JD relevance
  const reorderedSkills = reorderSkills(parsed.skills, jd);

  const totalGenTokensIn =
    summaryResult.inputTokens + experienceResult.inputTokens;
  const totalGenTokensOut =
    summaryResult.outputTokens + experienceResult.outputTokens;
  const totalGenCalls =
    (summaryResult.inputTokens > 0 ? 1 : 0) +
    (experienceResult.inputTokens > 0 ? 1 : 0);

  telemetry.endStage(
    "generators",
    totalGenCalls,
    totalGenTokensIn,
    totalGenTokensOut,
  );

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

  // ── Stage 4.9: Humanize Pass (reactive — only if score too low) ──
  const HUMANIZE_THRESHOLD = 60;
  if (
    config.modules.useAntiAIDetection &&
    humanVoiceResult &&
    humanVoiceResult.overall < HUMANIZE_THRESHOLD
  ) {
    try {
      console.log(
        `[pipeline] Human Voice ${humanVoiceResult.overall} < ${HUMANIZE_THRESHOLD}, triggering humanize pass...`,
      );
      telemetry.startStage("humanize-pass");
      const humanizeResult = await humanizePass(
        sections,
        humanVoiceResult,
        aiDetectionResult?.signals || [],
        jd.experienceLevel,
        snapshotStore,
      );
      sections = humanizeResult.sections;
      telemetry.endStage(
        "humanize-pass",
        1,
        humanizeResult.inputTokens,
        humanizeResult.outputTokens,
      );

      // Re-score after humanize pass
      const updatedBullets = sections.experience.flatMap((r) => r.bullets);
      const prevScore = humanVoiceResult.overall;
      humanVoiceResult = scoreHumanVoice(updatedBullets);
      aiDetectionResult = estimateAIDetectionRisk(updatedBullets);
      console.log(
        `[pipeline] Human Voice after humanize: ${prevScore} → ${humanVoiceResult.overall}/100 | AI Risk: ${aiDetectionResult.risk}`,
      );
    } catch (error) {
      // Non-critical — keep current bullets
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[pipeline] Humanize pass failed: ${msg}`);
      telemetry.failStage("humanize-pass", msg);
    }
  } else if (
    config.modules.useAntiAIDetection &&
    humanVoiceResult &&
    humanVoiceResult.overall >= HUMANIZE_THRESHOLD
  ) {
    telemetry.skipStage(
      "humanize-pass",
      `Human Voice score ${humanVoiceResult.overall} >= ${HUMANIZE_THRESHOLD} threshold`,
    );
  }

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
