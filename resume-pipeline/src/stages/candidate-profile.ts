// src/stages/candidate-profile.ts
// Deterministic candidate profile extractor. 0 LLM calls.
// Reads the parsed base resume and produces a CandidateProfile used by the
// generator for:
//   - continuous YoE-based invention bands (no tier-boundary anchoring)
//   - technology grounding (so generators cannot drift into unknown tools)
//   - domain categories (so category-aware metrics are possible)
//
// YoE is computed as a float by parsing role date ranges from the heading
// lines and merging overlaps so concurrent roles do not double count. A
// manual override may be supplied via PipelineInput.yearsOfExperienceOverride
// (typically set by the user in Settings).

import type { ParsedResume, ParsedRole } from "../schemas/pipeline.js";
import {
  detectCategory,
  type ImpactCategory,
} from "../impact/detector.js";

// ── Types ──────────────────────────────────────────────────────

export type SeniorityTier = "entry" | "mid" | "senior";

export interface InventionBands {
  /** Per-bullet improvement % floor (e.g. "reduced X by N%"). */
  improvementPctMin: number;
  /** Per-bullet improvement % HARD CEILING — LLM must never exceed. */
  improvementPctMax: number;
  /** Min team size the candidate could credibly have led/mentored/paired with. */
  teamSizeMin: number;
  /** HARD CEILING on team size the candidate could credibly have led. */
  teamSizeMax: number;
}

export interface CandidateProfile {
  /** Total years of experience as a float (e.g. 4.25). Always >= 0. */
  yearsOfExperience: number;
  /** "entry" | "mid" | "senior" — labeling aid only, NOT used for invention math. */
  seniorityTier: SeniorityTier;
  /** Union of all technologies mentioned across experience + skills section. */
  technologiesUsed: string[];
  /** Dominant impact categories across all roles. */
  domainCategories: ImpactCategory[];
  /** Per-role inferred years (float). Same order as parsed.experience. */
  perRoleYears: number[];
  /** True if yearsOfExperience came from manual override, false if auto-derived. */
  yoeSource: "override" | "auto";
}

// ── Continuous Invention Bands ─────────────────────────────────
// IMPORTANT DESIGN NOTE:
// These bands cover ONLY "IC-owned impact" metrics — things the candidate
// personally caused (improvement %, team size led). They deliberately do
// NOT include system/employer scale (transactions/day, users, data volume,
// monthly active users, etc). Those are properties of the PRODUCT/EMPLOYER,
// not the IC, so a 2-year candidate at a big bank touches bank-scale
// systems, and a 10-year senior at a small startup touches startup scale.
// Bounding "scale" by the candidate's YoE would systematically undersell
// engineers at high-volume employers. Scale metrics are therefore
// PRESERVE-ONLY in the generator (never invented).
//
// The formulas below are continuous (not tiered) so that 4.2-year and
// 2.0-year candidates never share a floor — LLMs anchor to tier labels.
export function inventionBands(yoe: number): InventionBands {
  const y = Math.max(0, Math.min(yoe, 12)); // clamp 0..12 for stability
  return {
    // Per-BULLET improvement %. A single targeted refactor or optimization
    // can realistically yield 60-80% improvement even for a mid-level
    // engineer (it's bullet scope, not career average). Formula widened
    // accordingly — 4y caps at 80%, 8y+ caps at 90%.
    improvementPctMin: Math.round(15 + y * 2.5), //  0y=15, 4y=25, 8y=35
    improvementPctMax: Math.round(Math.min(40 + y * 10, 90)), //  0y=40, 4y=80, 8y+=90
    // Team size (peers paired with, mentored, or led). Bounded by YoE
    // because credibility of "led 15 engineers" depends on the candidate.
    teamSizeMin: Math.max(1, Math.floor(1 + y * 0.6)), //  0y=1, 4y=3, 8y=5
    teamSizeMax: Math.min(20, Math.round(3 + y * 1.8)), //  0y=3, 4y=10, 8y=17
  };
}

// ── Date Range Extraction ──────────────────────────────────────

interface DateRange {
  /** Fractional year, e.g. 2023.5 for July 2023 */
  startYear: number;
  endYear: number;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function parseMonthYear(token: string, currentYear: number, currentMonth: number): number | null {
  const trimmed = token.trim().toLowerCase();
  if (!trimmed) return null;

  // "present", "current", "now"
  if (/^(present|current|now|ongoing)$/i.test(trimmed)) {
    return currentYear + currentMonth / 12;
  }

  // "Jan 2023", "January 2023"
  const monthYearMatch = trimmed.match(/^([a-z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const m = MONTH_MAP[monthYearMatch[1]];
    const y = parseInt(monthYearMatch[2], 10);
    if (m !== undefined && !Number.isNaN(y)) return y + m / 12;
  }

  // "2023" or "2023 -"
  const yearOnlyMatch = trimmed.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    return parseInt(yearOnlyMatch[1], 10);
  }

  // "01/2023", "1/2023"
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const m = parseInt(slashMatch[1], 10) - 1;
    const y = parseInt(slashMatch[2], 10);
    if (m >= 0 && m <= 11) return y + m / 12;
  }

  // "2023-01" ISO
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    if (m >= 0 && m <= 11) return y + m / 12;
  }

  return null;
}

/**
 * Extract a date range from a role heading string. Returns null if we cannot
 * confidently parse one. Supports many common formats found in \resumeSubheading
 * lines, e.g.
 *    Jan 2021 -- Present
 *    2020 - 2022
 *    March 2023 -- Aug 2024
 *    06/2021 - 09/2023
 */
export function extractDateRange(heading: string): DateRange | null {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Normalize fancy dashes to hyphen-minus and collapse whitespace
  const normalized = heading
    .replace(/–|—|−/g, "-")
    .replace(/\s+/g, " ");

  // Look for "X -- Y", "X - Y", "X to Y"
  const rangeRegex = /([A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}-\d{1,2}|\d{4})\s*(?:-{1,2}|to)\s*([A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}-\d{1,2}|\d{4}|Present|Current|Now|Ongoing)/i;

  const match = normalized.match(rangeRegex);
  if (!match) return null;

  const start = parseMonthYear(match[1], currentYear, currentMonth);
  const end = parseMonthYear(match[2], currentYear, currentMonth);

  if (start === null || end === null) return null;
  if (end < start) return null; // malformed

  return { startYear: start, endYear: end };
}

/**
 * Given multiple date ranges, compute total years covered with overlaps merged.
 * So two concurrent roles (Jan-Dec 2022 and Mar-Aug 2022) count as 1 year total.
 */
export function totalYearsWithMergedOverlaps(ranges: DateRange[]): number {
  if (ranges.length === 0) return 0;

  // Sort by start
  const sorted = [...ranges].sort((a, b) => a.startYear - b.startYear);
  const merged: DateRange[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.startYear <= last.endYear) {
      // Overlap — extend last
      last.endYear = Math.max(last.endYear, cur.endYear);
    } else {
      merged.push({ ...cur });
    }
  }

  return merged.reduce((sum, r) => sum + (r.endYear - r.startYear), 0);
}

// ── Technology & Domain Extraction ─────────────────────────────

const BASE_TECH = [
  "Redis", "Kafka", "Kubernetes", "Docker", "Terraform", "AWS", "GCP", "Azure",
  "PostgreSQL", "MongoDB", "React", "Spring", "Spring Boot", "Jenkins",
  "GitHub Actions", "CircleCI", "Datadog", "Grafana", "Elasticsearch",
  "RabbitMQ", "GraphQL", "TypeScript", "Python", "Java", "Go", "Rust",
  "Node.js", "Next.js", "REST", "SQL", "NoSQL", "MySQL", "DynamoDB",
  "S3", "Lambda", "EC2", "Microservices", "CI/CD", "Nginx", "Express",
  "Flask", "Django", "FastAPI", "Kotlin", "Swift", "Scala", "Ruby",
  "Rails", "Angular", "Vue", "Svelte", "Redux", "Webpack", "Vite",
  "Jest", "Cypress", "Playwright", "JUnit", "pytest", "Selenium",
  "Kinesis", "SNS", "SQS", "CloudFormation", "Helm", "Prometheus",
  "OpenTelemetry", "OAuth", "JWT", "gRPC", "Protobuf", "WebSocket",
  "Tailwind", "Chakra", "Material UI", "shadcn",
];

function extractTechFromText(text: string, extras: string[] = []): string[] {
  const all = [...new Set([...BASE_TECH, ...extras])];
  const found = new Set<string>();

  for (const tech of all) {
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
      found.add(tech);
    }
  }

  return [...found];
}

function stripLatexCommands(s: string): string {
  return s
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\textit\{([^}]*)\}/g, "$1")
    .replace(/\\emph\{([^}]*)\}/g, "$1")
    .replace(/\\resumeItem\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDomainCategories(roles: ParsedRole[]): ImpactCategory[] {
  const counts = new Map<ImpactCategory, number>();
  for (const role of roles) {
    for (const bullet of role.bullets) {
      const c = detectCategory(bullet);
      if (c === "uncategorized") continue;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
}

// ── Seniority Tier (labeling aid only) ─────────────────────────

export function tierFromYoE(yoe: number): SeniorityTier {
  if (yoe < 2) return "entry";
  if (yoe < 5) return "mid";
  return "senior";
}

// ── Public API ─────────────────────────────────────────────────

export interface BuildCandidateProfileArgs {
  parsed: ParsedResume;
  /** Manual YoE override from UserProfile settings. Wins over auto-derivation. */
  yearsOfExperienceOverride?: number;
}

export function buildCandidateProfile(
  args: BuildCandidateProfileArgs,
): CandidateProfile {
  const { parsed, yearsOfExperienceOverride } = args;

  // 1. Per-role date ranges (for context + YoE)
  const perRoleRanges: (DateRange | null)[] = parsed.experience.map((r) =>
    extractDateRange(r.heading),
  );
  const perRoleYears = perRoleRanges.map((r) =>
    r ? Math.max(0, r.endYear - r.startYear) : 0,
  );

  // 2. Derive YoE with overlap merge
  const validRanges = perRoleRanges.filter((r): r is DateRange => r !== null);
  const derivedYoE = totalYearsWithMergedOverlaps(validRanges);

  // 3. Manual override wins
  const yoeSource: "override" | "auto" =
    yearsOfExperienceOverride !== undefined &&
    yearsOfExperienceOverride !== null &&
    !Number.isNaN(yearsOfExperienceOverride) &&
    yearsOfExperienceOverride >= 0
      ? "override"
      : "auto";

  const yearsOfExperience =
    yoeSource === "override"
      ? (yearsOfExperienceOverride as number)
      : derivedYoE;

  // 4. Tier for labeling / credibility checks (NOT invention math)
  const seniorityTier = tierFromYoE(yearsOfExperience);

  // 5. Technologies the candidate has actually touched
  const experienceText = parsed.experience
    .map((r) => r.bullets.join(" "))
    .join(" ");
  const skillsText = stripLatexCommands(parsed.skills || "");
  const technologiesUsed = extractTechFromText(
    `${experienceText} ${skillsText}`,
  );

  // 6. Domain categories across bullets
  const domainCategories = extractDomainCategories(parsed.experience);

  return {
    yearsOfExperience,
    seniorityTier,
    technologiesUsed,
    domainCategories,
    perRoleYears,
    yoeSource,
  };
}
