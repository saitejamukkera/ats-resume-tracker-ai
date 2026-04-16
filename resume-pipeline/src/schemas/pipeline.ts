// src/schemas/pipeline.ts
// Core pipeline types — input, output, config.

import type { JDAnalysis } from "./jd-analysis.js";

// ── Optional Module Flags ───────────────────────────────────────
export interface PipelineModules {
  usePlanner: boolean;
  useHumanVoiceScoring: boolean;
  useAntiAIDetection: boolean;
  useRecruiterScoring: boolean;
  useCareerVault: boolean;
  useRAG: boolean;
  useCoverLetter: boolean;
  usePerRoleGeneration: boolean;
}

// ── Pipeline Configuration ──────────────────────────────────────
export interface PipelineConfig {
  modules: PipelineModules;
  constraints: {
    minBulletsPerRole: number;
    maxBulletsPerRole: number;
    metricMinRatio: number;
    metricMaxRatio: number;
    jdRelevanceMinRatio: number;
    jdKeywordCoverage: number;
    maxRepairAttempts: number;
    atsScoreThreshold: number;
    /**
     * Minimum Human Voice composite score. When the scorer falls below
     * this, a humanize pass is triggered. Default 70.
     */
    humanVoiceThreshold: number;
    /**
     * Minimum bullet-length standard deviation (in words) that must be
     * present post-generation. Values below this trip a burstiness
     * repair pass regardless of the Human Voice composite score.
     * Default 4.
     */
    burstinessMinStdDev: number;
    /**
     * Whether the generator is allowed to invent metrics for bullets
     * that lack them when the plan marks them "metric: REQUIRED".
     * Global off-switch. Default true.
     */
    inventionEnabled: boolean;
  };
}

export const DEFAULT_MODULES: PipelineModules = {
  usePlanner: false,
  useHumanVoiceScoring: true,
  useAntiAIDetection: true,
  useRecruiterScoring: false,
  useCareerVault: false,
  useRAG: false,
  useCoverLetter: true,
  // Structured per-role generation is now the primary mode. The legacy
  // batch generator still exists as the hybrid fallback.
  usePerRoleGeneration: true,
};

export const DEFAULT_CONFIG: PipelineConfig = {
  modules: { ...DEFAULT_MODULES },
  constraints: {
    minBulletsPerRole: 8,
    maxBulletsPerRole: 12,
    metricMinRatio: 0.6,
    metricMaxRatio: 0.85,
    jdRelevanceMinRatio: 0.5,
    jdKeywordCoverage: 0.7,
    maxRepairAttempts: 2,
    atsScoreThreshold: 70,
    humanVoiceThreshold: 70,
    burstinessMinStdDev: 4,
    inventionEnabled: true,
  },
};

// ── Pipeline Input (from Spring Boot) ───────────────────────────
export interface PipelineInput {
  baseResumeLatex: string;
  jobDescription: string;
  userInfo?: string;
  masterSubjects?: string;
  customPrompt?: string;
  /**
   * Optional manual YoE override. When set (non-negative number), this
   * wins over date-range derivation in the candidate profile. Intended to
   * be supplied from the user's Settings when auto-derivation is wrong
   * (gaps, internships, concurrent roles, contract work).
   */
  yearsOfExperienceOverride?: number;
}

// ── Parsed Resume Sections (from LaTeX parser) ─────────────────
export interface ParsedResume {
  preamble: string; // everything before \begin{document}
  header: string; // name/contact section
  summary: string; // summary lines
  skills: string; // skills section
  experience: ParsedRole[]; // each role with raw bullets
  projects: string; // projects section (UNTOUCHED)
  education: string; // education section (UNTOUCHED)
  postamble: string; // everything after last section
  rawLatex: string; // original full LaTeX
  sectionOrder: string[]; // correct order of sections found in the file
}

export interface ParsedRole {
  heading: string; // \resumeSubheading line(s)
  bullets: string[]; // \resumeItem lines (raw text, no \resumeItem prefix)
  rawBlock: string; // full raw block for this role
}

// ── Generated Sections (output of generators) ──────────────────
export interface GeneratedSections {
  summary: string;
  skills: string;
  experience: GeneratedRole[];
  coverLetter: string;
}

export interface GeneratedRole {
  roleTitle: string;
  company: string;
  bullets: string[];
}

// ── Validated Result ────────────────────────────────────────────
export interface ValidatedSections extends GeneratedSections {
  status: "success" | "partial";
  unresolvedIssues?: ValidationError[];
}

export interface ValidationError {
  section: string;
  rule: string;
  severity: "critical" | "warning";
  message: string;
  offendingContent?: string;
  suggestion?: string;
}

// ── ATS Score ──────────────────────────────────────────────────
export interface ATSScore {
  overall: number;
  keywordMatch: number;
  preferredMatch: number;
  sectionCompleteness: number;
  formatScore: number;
  keywordPlacement: number;
  missingRequired: string[];
  missingPreferred: string[];
}

// ── Pipeline Output (returned to Spring Boot) ──────────────────
export interface PipelineOutput {
  latex: string;
  coverLetter: string;
  position: string;
  company: string;
  jobId: string;
  location: string;
  atsScore: number;
  jdAnalysis: JDAnalysis;
  trace: GenerationTrace;
}

// ── Observability ──────────────────────────────────────────────
export interface FailedRule {
  rule: string;
  section: string;
  severity: "critical" | "warning";
  count: number;
}

export interface RepairResult {
  roleIndex: number;
  bulletIndex: number;
  original: string;
  repaired: string;
  rulesFixed: string[];
}

export interface GenerationTrace {
  traceId: string;
  timestamp: string;
  durationMs: number;
  stages: StageTiming[];
  scores: {
    ats: number;
    impactScore: number;
    humanVoice?: number;
    aiDetectionRisk?: "low" | "medium" | "high";
  };
  validation: {
    totalChecks: number;
    passed: number;
    failed: number;
    repairAttempts: number;
  };
  cost: {
    llmCalls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUSD?: number;
    provider?: string;
    modelsUsed?: string[];
  };
  input?: {
    jdLength: number;
    rolesCount: number;
    totalBullets: number;
  };
  impactProfile?: {
    overallScore: number;
    metricsRatio: number;
  };
  configSnapshot?: PipelineConfig;
  failedRules?: FailedRule[];
  repairResults?: RepairResult[];
  /**
   * Numbers / team sizes / context added by the generator that were NOT
   * in the original base resume. Populated from the per-bullet "invented"
   * field. The frontend can render a "Review these invented numbers"
   * banner from this list before the user submits.
   */
  inventedMetrics?: InventedMetricEntry[];
  /** Derived candidate profile snapshot. Useful for UI + audit. */
  candidateProfile?: {
    yearsOfExperience: number;
    yoeSource: "override" | "auto";
    seniorityTier: "entry" | "mid" | "senior";
    technologiesUsed: string[];
    domainCategories: string[];
  };
  status: "success" | "partial" | "failed";
  errors: Array<{ stage: string; message: string }>;
}

export interface InventedMetricEntry {
  roleIndex: number;
  bulletIndex: number;
  field: "metric" | "scope" | "context";
  value: string;
  bullet: string;
}

export interface StageTiming {
  name: string;
  durationMs: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  status: "success" | "skipped" | "failed";
  skippedReason?: string;
}
