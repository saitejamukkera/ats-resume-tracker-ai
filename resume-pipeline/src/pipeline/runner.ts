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
import { injectVerifiedSkills } from "../stages/skills-injector.js";
import { extractTechProfile } from "../stages/tech-stack-extractor.js";
import { generateCoverLetter } from "../stages/cover-letter.js";
import { parseLatexResume, assembleLatex } from "../stages/latex-assembler.js";
import { extractBoldKeywords } from "../stages/keyword-extractor.js";
import { repairKeywordGaps } from "../stages/keyword-gap-repair.js";
import { generateDocx } from "../stages/docx-generator.js";
import { validateSections } from "../validation/validator.js";
import { repairBullets } from "../validation/repair.js";
import { calculateATSScore, calculateATSScoreWithEmbeddings } from "../validation/ats-scorer.js";
import { profileRoleImpact } from "../impact/detector.js";
import { PipelineTelemetry } from "../observability/trace.js";
import { traceStore } from "../observability/trace-store.js";
import { RateLimitError } from "../observability/llm-wrapper.js";
import { createModels } from "../config/models.js";
import type { ProviderKeyProvider } from "../security/key-provider.js";
import type { LanguageModel } from "ai";
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
  keyProvider?: ProviderKeyProvider,
): Promise<PipelineOutput> {
  const emit = onEvent || (() => {});
  const telemetry = new PipelineTelemetry();
  const snapshotStore = telemetry.snapshotStore;
  let pipelineStatus: "success" | "partial" | "failed" = "success";

  const models = keyProvider ? createModels(keyProvider) : undefined;

  console.log(
    `[pipeline] Starting generation (trace: ${telemetry.getTraceId()})${models ? " [BYOK]" : ""}`,
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

  // Extract UI-declared skills from userInfo if present
  let uiSkills: string[] = [];
  if (input.userInfo) {
    const match = input.userInfo.match(/^Skills:\s*(.*)$/m);
    if (match && match[1]) {
      uiSkills = match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  // ── Stage 1.5: Extract Candidate Tech Profile ─────────────────
  // Deterministic, no LLM cost — extracts primary technologies from the
  // candidate's own resume for downstream tech coverage guidance.
  const candidateTech = extractTechProfile(parsed, uiSkills, 15, 30);
  console.log(
    `[pipeline] Candidate tech profile: primary=[${candidateTech.primary.join(", ")}], secondary=[${candidateTech.secondary.join(", ")}]`,
  );

  // ── Stage 2: JD Parser (LLM Call #1) ──────────────────────────
  emit({ type: "stage-start", stage: "jd-parser" });
  telemetry.startStage("jd-parser");
  let jdResult;
  try {
    jdResult = await parseJD(input.jobDescription, snapshotStore, models);
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
      models,
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
      candidateTech,
      snapshotStore,
      models,
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

  // ── Diagnostic Logging for Experience Result ───────────────────
  console.log(
    `[pipeline] Experience result structure: roles=${experienceResult.roles?.length ?? "undefined"}, expected=${parsed.experience.length}`,
  );
  for (let i = 0; i < Math.min(experienceResult.roles?.length ?? 0, 3); i++) {
    const role = experienceResult.roles[i];
    console.log(
      `[pipeline] Role ${i}: title="${role?.roleTitle}", company="${role?.company}", bullets=${role?.bullets?.length ?? "undefined"}`,
    );
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

      // Ensure the role exists before modifying it
      if (!experienceResult.roles[i]) {
        const bulletsSample = parsed.experience[i].bullets.slice(0, 2).join(" | ");
        console.warn(
          `[pipeline] Role ${i} is missing! Creating fallback with ${expected} original bullets (sample: "${bulletsSample}")`,
        );
        experienceResult.roles[i] = {
          roleTitle: parsed.experience[i].heading.split("\n")[0] || "",
          company: "",
          bullets: [],
        };
      }

      if (actual < expected) {
        // Pad with original bullets the LLM missed
        const padded = [...(experienceResult.roles[i].bullets || [])];
        for (let j = padded.length; j < expected; j++) {
          padded.push(parsed.experience[i].bullets[j]);
        }
        experienceResult.roles[i].bullets = padded;
      } else {
        // Trim excess bullets
        experienceResult.roles[i].bullets = (
          experienceResult.roles[i].bullets || []
        ).slice(0, expected);
      }
    }
  }

  // ── Post-Generation Tech Coverage Check ────────────────────────
  // Deterministic warning only — no LLM cost, no repair.
  // Flags roles where the candidate's primary tech stack is completely absent.
  if (candidateTech.primary.length > 0) {
    for (let i = 0; i < experienceResult.roles.length; i++) {
      const role = experienceResult.roles[i];
      if (!role || !role.bullets) {
        console.debug(`[pipeline] Skipping tech coverage check for role ${i} (no bullets)`);
        continue;
      }
      const roleBullets = role.bullets
        .join(" ")
        .toLowerCase();
      const hasPrimaryTech = candidateTech.primary.some((t) =>
        roleBullets.includes(t.toLowerCase()),
      );
      if (!hasPrimaryTech) {
        console.warn(
          `[pipeline] Tech coverage gap: Role ${i} ("${role.roleTitle || "unknown"}") has no mention of candidate's primary technologies [${candidateTech.primary.join(", ")}]`,
        );
      }
    }
  }

  // Deterministic: reorder skills by JD relevance, then inject required JD
  // skills the candidate legitimately has but didn't list in the skills section
  // (highest-signal ATS placement — see skills-injector).
  const reorderedSkills = reorderSkills(parsed.skills, jd);
  const fullResumeTextForSkills = [
    parsed.summary,
    parsed.skills,
    ...parsed.experience.flatMap((r) => [r.heading, ...r.bullets]),
    parsed.projects,
  ].join(" ");
  const skillInjection = injectVerifiedSkills(
    reorderedSkills,
    jd,
    candidateTech,
    fullResumeTextForSkills,
  );
  if (skillInjection.injected.length > 0) {
    console.log(
      `[pipeline] Injected ${skillInjection.injected.length} verified skill(s) into Skills section: ${skillInjection.injected.join(", ")}`,
    );
  }

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
    skills: skillInjection.skills,
    experience: experienceResult.roles,
    coverLetter: "", // placeholder, merged later
  };

  // ── Stage 4: Validator + Repair ───────────────────────────────
  emit({ type: "stage-start", stage: "validator" });
  telemetry.startStage("validator");

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
        models,
      );

      sections.experience = repairResult.repairedRoles;
      repairAttempts = repairResult.repairAttempts;
      repairTokensIn = repairResult.totalInputTokens;
      repairTokensOut = repairResult.totalOutputTokens;

      // Re-validate after repair
      const postRepairResult = validateSections(sections, jd, config);
      if (!postRepairResult.pass) {
        pipelineStatus = "partial";
        console.log(
          `[pipeline] Post-repair validation: still ${postRepairResult.errors.filter((e) => e.severity === "critical").length} critical issues (using best attempt)`,
        );
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

  const jdKeywords = [...jd.requiredSkills, ...jd.preferredSkills];
  const impactProfiles = sections.experience.map((role, i) =>
    profileRoleImpact(
      `${role.roleTitle || `Role ${i}`}`,
      role.bullets,
      jdKeywords,
      jd.experienceLevel,
    ),
  );

  let atsScore = await calculateATSScoreWithEmbeddings(
    sections,
    jd,
    parsed,
    impactProfiles,
    "", // LaTeX not assembled yet — format dimension degrades gracefully to 0.85
    input.jobDescription,
  );
  console.log(`[pipeline] ATS Score: ${atsScore.overall}/100 (v${atsScore.version})${atsScore.features.semanticScoring ? " [semantic]" : ""}`);
  console.log(`[pipeline] Breakdown:`,
    Object.entries(atsScore.componentBreakdown)
      .map(([k, v]) => `${v.label}: ${v.weighted}/${v.max}`)
      .join(" | "),
  );
  if (!atsScore.features.formatValidated) {
    console.log("[pipeline] Format validation skipped — LaTeX not yet assembled");
  }
  telemetry.endStage("ats-scorer");

  // ── Stage 4.6: Keyword Gap Repair (up to 2 passes if ATS < 85) ─
  const ATS_GAP_REPAIR_THRESHOLD = 85;
  const MAX_GAP_REPAIR_PASSES = 2;
  const attemptedKeywords = new Set<string>();
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
        input.jobDescription,
        atsScore.missingRequired,
        atsScore.missingPreferred,
        attemptedKeywords,
        candidateTech,
        snapshotStore,
        models,
      );
      sections = gapResult.sections;
      gapRepairTotalIn += gapResult.inputTokens;
      gapRepairTotalOut += gapResult.outputTokens;
      gapRepairPasses++;

      // Track attempted keywords so Pass 2 targets different ones
      for (const kw of gapResult.targetedKeywords) {
        attemptedKeywords.add(kw.toLowerCase());
      }
      telemetry.endStage(
        `keyword-gap-repair-${pass}`,
        1,
        gapResult.inputTokens,
        gapResult.outputTokens,
      );

      // Re-score after repair with expanded context
      const prevScore = atsScore.overall;
      atsScore = await calculateATSScoreWithEmbeddings(
        sections,
        jd,
        parsed,
        impactProfiles,
        "",
        input.jobDescription,
      );
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
    const kwResult = await extractBoldKeywords(sections, jd, snapshotStore, models);
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

  // ── Stage 5: LaTeX Assembly ───────────────────────────────────
  emit({ type: "stage-start", stage: "latex-assembler" });
  telemetry.startStage("latex-assembler");
  const validatedSections: ValidatedSections = {
    ...sections,
    status: pipelineStatus as "success" | "partial",
  };

  let finalLatex: string;
  let docxBase64: string | undefined;
  try {
    finalLatex = assembleLatex(parsed, validatedSections, boldKeywords);
    telemetry.endStage("latex-assembler");

    // ── Stage 5.5: DOCX Generation (non-critical) ──────────────────
    try {
      telemetry.startStage("docx-generator");
      const docxBuffer = await generateDocx(parsed, validatedSections, boldKeywords);
      docxBase64 = docxBuffer.toString("base64");
      telemetry.endStage("docx-generator");
      console.log(`[pipeline] DOCX generated: ${docxBuffer.length} bytes`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[pipeline] DOCX generation failed (non-critical): ${msg}`);
      telemetry.failStage("docx-generator", msg);
    }

    // ── Re-score with assembled LaTeX for real format validation ──
    atsScore = await calculateATSScoreWithEmbeddings(
      sections,
      jd,
      parsed,
      impactProfiles,
      finalLatex,
      input.jobDescription,
    );
    console.log(
      `[pipeline] Final ATS Score (post-assembly): ${atsScore.overall}/100`,
    );
    if (atsScore.formatIssues.length > 0) {
      for (const issue of atsScore.formatIssues) {
        console.log(
          `[pipeline] Format ${issue.severity}: ${issue.message}`,
        );
      }
    }
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
      impactScore: atsScore.impactScore,
      componentBreakdown: atsScore.componentBreakdown,
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
        models,
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

  // ── Impact Score (already computed inside atsScore) ────────────
  const impactScore = atsScore.impactScore;
  const metricsRatio = atsScore.metricsRatio / 100; // atsScore stores as 0-100, convert to 0-1

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
    { ats: atsScore.overall, impactScore, componentBreakdown: atsScore.componentBreakdown },
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

  traceStore.persist(trace);

  console.log(
    `[pipeline] Complete in ${trace.durationMs}ms | Status: ${pipelineStatus} | ATS: ${atsScore.overall} | Impact: ${atsScore.impactScore}/${atsScore.metricsRatio} | LLM calls: ${trace.cost.llmCalls}`,
  );

  emit({
    type: "complete",
    data: {
      coverLetter: sections.coverLetter,
      atsScore: atsScore.overall,
      impactScore: atsScore.impactScore,
      metricsRatio: atsScore.metricsRatio,
      componentBreakdown: atsScore.componentBreakdown,
      durationMs: trace.durationMs,
      docxBase64,
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
    atsScoreDetails: atsScore,
    jdAnalysis: jd,
    trace,
    docxBase64,
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
