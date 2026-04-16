// src/stages/bullet-ranker.ts
//
// Stage 3.6: Deterministic bullet relevance ranking + trimming.
// 0 LLM calls — pure lexical scoring against the parsed JD plus the
// Impact Detection System's bullet impact score.
//
// Recruiters read a role top-down and form an opinion on the first
// 2-3 bullets. If the most JD-relevant bullet is buried at position
// 6, the recruiter may never reach it. Long roles (15+ bullets) also
// dilute strong signals and actively hurt scannability.
//
// This stage:
//   1) Scores every rewritten bullet against the JD (required skills,
//      preferred skills, key phrases, responsibilities, LLM-reported
//      keywords, metric presence, IDS impact).
//   2) Reorders bullets WITHIN each role by descending score.
//   3) Enforces per-role and resume-wide caps by dropping the
//      lowest-scoring bullets, never falling below minBulletsPerRole.
//   4) Returns an index remap so the caller can rebuild side-channel
//      structures (inventedMetrics, structured bullets) without drift.
//
// Chronological order across roles is preserved — only in-role order
// changes.

import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type {
  GeneratedRole,
  PipelineConfig,
} from "../schemas/pipeline.js";
import type { ExperienceBullet } from "../schemas/experience.js";
import { detectSignals, scoreBulletImpact } from "../impact/detector.js";

// ── Weights ────────────────────────────────────────────────────
// Tuned so that a bullet with strong required-skill coverage beats
// a bullet that only has soft signals (metric + impact) even when
// the soft-signal bullet is well-written.

const WEIGHTS = {
  REQUIRED_PER_HIT: 8,
  REQUIRED_CAP: 40,
  PREFERRED_PER_HIT: 3,
  PREFERRED_CAP: 15,
  KEY_PHRASE_PER_HIT: 2,
  KEY_PHRASE_CAP: 10,
  RESPONSIBILITY_PER_HIT: 0.6,
  RESPONSIBILITY_CAP: 10,
  LLM_KEYWORD_PER_HIT: 2,
  LLM_KEYWORD_CAP: 10,
  METRIC_BONUS: 5,
  IMPACT_DIVISOR: 10, // IDS score is 0-100; /10 → cap 10
  IMPACT_CAP: 10,
};

// Very common words we never want to count as a "content word match".
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "this", "that", "those",
  "these", "their", "your", "you", "will", "have", "has", "had", "was",
  "were", "been", "being", "are", "is", "not", "but", "or", "so", "as",
  "at", "to", "of", "in", "on", "by", "be", "an", "a", "our", "we",
  "they", "it", "its", "it's", "who", "whom", "which", "what", "when",
  "where", "why", "how",
  "team", "teams", "work", "works", "working", "worked", "role",
  "roles", "use", "uses", "used", "using", "help", "helps", "helping",
  "helped", "across", "such", "like", "also", "both", "each", "any",
  "all", "some", "more", "most", "much", "very", "other", "others",
]);

// ── Types ──────────────────────────────────────────────────────

export interface BulletScoreBreakdown {
  requiredSkills: number;
  preferredSkills: number;
  keyPhrases: number;
  responsibilities: number;
  llmReportedKeywords: number;
  metric: number;
  impact: number;
  total: number;
}

export interface RankedBullet {
  originalIndex: number;
  text: string;
  score: number;
  breakdown: BulletScoreBreakdown;
  matchedRequired: string[];
  matchedPreferred: string[];
  kept: boolean;
  dropReason?: "role-cap" | "total-cap";
}

export interface RoleRanking {
  roleIndex: number;
  roleTitle: string;
  company: string;
  keptIndexes: number[];   // new order of kept bullets (original indexes)
  droppedIndexes: number[];
  bullets: RankedBullet[]; // every bullet with score + breakdown
}

export interface RankAndTrimConstraints {
  minBulletsPerRole: number;
  maxBulletsPerRole: number;
  maxBulletsTotal: number;
}

export interface RankAndTrimResult {
  roles: GeneratedRole[];
  structuredBullets: ExperienceBullet[][];
  /**
   * indexRemap[roleIndex][originalBulletIndex] = newBulletIndex, or
   * -1 if the bullet was dropped. Used to rewrite InventedMetricEntry
   * references after trimming.
   */
  indexRemap: number[][];
  rankings: RoleRanking[];
  droppedByRoleCap: number;
  droppedByTotalCap: number;
}

// ── Lexical helpers ────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTerm(bulletLower: string, term: string): boolean {
  const t = normalize(term);
  if (!t) return false;
  // For multi-word terms use a looser substring match; for single words
  // use word boundaries so "ci" doesn't match "specific".
  if (t.includes(" ")) return bulletLower.includes(t);
  return new RegExp(`\\b${escapeRegex(t)}\\b`, "i").test(bulletLower);
}

function contentWords(phrase: string): string[] {
  return normalize(phrase)
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w));
}

// ── Scoring ────────────────────────────────────────────────────

export interface ScoreContext {
  requiredSkills: string[];
  preferredSkills: string[];
  keyPhrases: string[];
  responsibilityContentWords: Set<string>;
}

export function buildScoreContext(jd: JDAnalysis): ScoreContext {
  const respWords = new Set<string>();
  for (const r of jd.keyResponsibilities || []) {
    for (const w of contentWords(r)) respWords.add(w);
  }
  return {
    requiredSkills: dedupe(jd.requiredSkills || []),
    preferredSkills: dedupe(jd.preferredSkills || []),
    keyPhrases: dedupe(jd.keyPhrases || []),
    responsibilityContentWords: respWords,
  };
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const n = normalize(x);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(x);
  }
  return out;
}

export function scoreBulletRelevance(
  bulletText: string,
  structured: ExperienceBullet | undefined,
  ctx: ScoreContext,
  jd: JDAnalysis,
): {
  score: number;
  breakdown: BulletScoreBreakdown;
  matchedRequired: string[];
  matchedPreferred: string[];
} {
  const lower = bulletText.toLowerCase();

  // Required skills.
  const matchedRequired: string[] = [];
  for (const skill of ctx.requiredSkills) {
    if (hasTerm(lower, skill)) matchedRequired.push(skill);
  }
  const requiredRaw = matchedRequired.length * WEIGHTS.REQUIRED_PER_HIT;
  const requiredScore = Math.min(requiredRaw, WEIGHTS.REQUIRED_CAP);

  // Preferred skills.
  const matchedPreferred: string[] = [];
  for (const skill of ctx.preferredSkills) {
    if (hasTerm(lower, skill)) matchedPreferred.push(skill);
  }
  const preferredRaw = matchedPreferred.length * WEIGHTS.PREFERRED_PER_HIT;
  const preferredScore = Math.min(preferredRaw, WEIGHTS.PREFERRED_CAP);

  // Key phrases: count a hit when the bullet contains 2+ consecutive
  // content words from the phrase, or the normalized phrase itself.
  let keyPhraseHits = 0;
  for (const phrase of ctx.keyPhrases) {
    const norm = normalize(phrase);
    if (!norm) continue;
    if (norm.length <= 40 && lower.includes(norm)) {
      keyPhraseHits++;
      continue;
    }
    const words = contentWords(phrase);
    if (words.length < 2) continue;
    // sliding window of 2 consecutive content words
    let hit = false;
    for (let i = 0; i + 1 < words.length && !hit; i++) {
      const pair = `${words[i]} ${words[i + 1]}`;
      if (lower.includes(pair)) hit = true;
    }
    if (hit) keyPhraseHits++;
  }
  const keyPhraseScore = Math.min(
    keyPhraseHits * WEIGHTS.KEY_PHRASE_PER_HIT,
    WEIGHTS.KEY_PHRASE_CAP,
  );

  // Responsibility content-word overlap.
  let respHits = 0;
  const seenRespWord = new Set<string>();
  for (const w of ctx.responsibilityContentWords) {
    if (seenRespWord.has(w)) continue;
    if (hasTerm(lower, w)) {
      seenRespWord.add(w);
      respHits++;
    }
  }
  const responsibilityScore = Math.min(
    respHits * WEIGHTS.RESPONSIBILITY_PER_HIT,
    WEIGHTS.RESPONSIBILITY_CAP,
  );

  // LLM-reported `keywordsUsed` — the generator told us which JD skills
  // it intentionally wove into this bullet. Credit those that actually
  // appear in the text (guard against hallucinated self-reports).
  const reported = structured?.keywordsUsed || [];
  let reportedHits = 0;
  const seenReported = new Set<string>();
  for (const k of reported) {
    const n = normalize(k);
    if (!n || seenReported.has(n)) continue;
    if (hasTerm(lower, k)) {
      seenReported.add(n);
      reportedHits++;
    }
  }
  const reportedScore = Math.min(
    reportedHits * WEIGHTS.LLM_KEYWORD_PER_HIT,
    WEIGHTS.LLM_KEYWORD_CAP,
  );

  // Metric presence + IDS impact — reuse the existing detector so we
  // don't re-implement regex patterns here.
  const jdKeywords = [...ctx.requiredSkills, ...ctx.preferredSkills];
  const signals = detectSignals(bulletText, jdKeywords);
  const metricScore = signals.hasPercentage || signals.hasScaleIndicator
    ? WEIGHTS.METRIC_BONUS
    : signals.hasNumber
      ? WEIGHTS.METRIC_BONUS * 0.6
      : 0;
  const impactRaw = scoreBulletImpact(signals) / WEIGHTS.IMPACT_DIVISOR;
  const impactScore = Math.min(impactRaw, WEIGHTS.IMPACT_CAP);

  const total =
    requiredScore +
    preferredScore +
    keyPhraseScore +
    responsibilityScore +
    reportedScore +
    metricScore +
    impactScore;

  // Reference jd to keep future extensions linkable (e.g. domainFocus).
  void jd;

  return {
    score: round2(total),
    breakdown: {
      requiredSkills: round2(requiredScore),
      preferredSkills: round2(preferredScore),
      keyPhrases: round2(keyPhraseScore),
      responsibilities: round2(responsibilityScore),
      llmReportedKeywords: round2(reportedScore),
      metric: round2(metricScore),
      impact: round2(impactScore),
      total: round2(total),
    },
    matchedRequired,
    matchedPreferred,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Per-role ranking + trimming ────────────────────────────────

/**
 * Score every bullet in the role, sort by descending score (stable on
 * ties → original order wins), and enforce the per-role cap. Never
 * drops below minBulletsPerRole.
 */
export function rankAndTrimRole(
  roleIndex: number,
  role: GeneratedRole,
  structured: ExperienceBullet[] | undefined,
  ctx: ScoreContext,
  jd: JDAnalysis,
  constraints: RankAndTrimConstraints,
): RoleRanking {
  const scored: RankedBullet[] = role.bullets.map((text, i) => {
    const s = scoreBulletRelevance(text, structured?.[i], ctx, jd);
    return {
      originalIndex: i,
      text,
      score: s.score,
      breakdown: s.breakdown,
      matchedRequired: s.matchedRequired,
      matchedPreferred: s.matchedPreferred,
      kept: true,
    };
  });

  // Stable sort: primary key = score desc, tiebreaker = original order.
  const sorted = [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.originalIndex - b.originalIndex;
  });

  // Per-role cap: keep top maxBulletsPerRole, but never drop below
  // minBulletsPerRole. If the role already has <= maxBulletsPerRole,
  // nothing is dropped (just reordered).
  const total = sorted.length;
  const effectiveFloor = Math.min(constraints.minBulletsPerRole, total);
  const keepCount = Math.max(
    effectiveFloor,
    Math.min(total, constraints.maxBulletsPerRole),
  );

  const keptList: RankedBullet[] = sorted.slice(0, keepCount);
  const droppedList: RankedBullet[] = sorted.slice(keepCount).map((b) => ({
    ...b,
    kept: false,
    dropReason: "role-cap" as const,
  }));

  // Merge back into a single bullets array with the kept-first order.
  const bullets = [...keptList, ...droppedList];

  return {
    roleIndex,
    roleTitle: role.roleTitle,
    company: role.company,
    keptIndexes: keptList.map((b) => b.originalIndex),
    droppedIndexes: droppedList.map((b) => b.originalIndex),
    bullets,
  };
}

// ── Resume-wide cap ────────────────────────────────────────────

/**
 * After per-role trimming, if total bullets across all roles still
 * exceeds maxBulletsTotal, drop the lowest-scoring kept bullets
 * iteratively. A bullet is only eligible to be dropped if its role
 * would still have > minBulletsPerRole bullets afterwards.
 */
function applyTotalCap(
  rankings: RoleRanking[],
  constraints: RankAndTrimConstraints,
): number {
  let dropped = 0;
  while (true) {
    const keptTotal = rankings.reduce((s, r) => s + r.keptIndexes.length, 0);
    if (keptTotal <= constraints.maxBulletsTotal) break;

    // Find the role with the lowest-scoring kept bullet that still
    // has headroom above minBulletsPerRole.
    let victimRole = -1;
    let victimBullet: RankedBullet | undefined;
    let victimScore = Infinity;

    for (const r of rankings) {
      if (r.keptIndexes.length <= constraints.minBulletsPerRole) continue;
      const lastKeptIdx = r.keptIndexes[r.keptIndexes.length - 1];
      const lastKept = r.bullets.find(
        (b) => b.originalIndex === lastKeptIdx && b.kept,
      );
      if (!lastKept) continue;
      if (lastKept.score < victimScore) {
        victimScore = lastKept.score;
        victimRole = r.roleIndex;
        victimBullet = lastKept;
      }
    }

    if (victimRole === -1 || !victimBullet) break; // every role at floor

    // Drop the victim bullet.
    const r = rankings.find((x) => x.roleIndex === victimRole)!;
    r.keptIndexes = r.keptIndexes.filter((i) => i !== victimBullet!.originalIndex);
    r.droppedIndexes = [victimBullet.originalIndex, ...r.droppedIndexes];
    victimBullet.kept = false;
    victimBullet.dropReason = "total-cap";
    dropped++;
  }
  return dropped;
}

// ── Top-level entry point ──────────────────────────────────────

/**
 * Full pipeline: score, reorder, per-role trim, resume-wide trim.
 * Returns the reordered roles + structured bullets and the index
 * remap needed to fix up inventedMetrics references.
 */
export function rankAndTrim(
  roles: GeneratedRole[],
  structuredBullets: ExperienceBullet[][],
  jd: JDAnalysis,
  constraints: RankAndTrimConstraints,
): RankAndTrimResult {
  const ctx = buildScoreContext(jd);

  const rankings: RoleRanking[] = roles.map((role, i) =>
    rankAndTrimRole(i, role, structuredBullets[i], ctx, jd, constraints),
  );

  const droppedByRoleCap = rankings.reduce(
    (s, r) => s + r.droppedIndexes.length,
    0,
  );
  const droppedByTotalCap = applyTotalCap(rankings, constraints);

  // Build outputs.
  const newRoles: GeneratedRole[] = [];
  const newStructured: ExperienceBullet[][] = [];
  const indexRemap: number[][] = [];

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const ranking = rankings[i];
    const structured = structuredBullets[i] || [];
    const originalCount = role.bullets.length;

    const keptOriginalIndexes = ranking.keptIndexes;
    const keptBullets = keptOriginalIndexes.map((oi) => role.bullets[oi]);
    const keptStructured = keptOriginalIndexes.map(
      (oi) =>
        structured[oi] ?? {
          text: role.bullets[oi],
          technologies: [],
          keywordsUsed: [],
          invented: null,
        },
    );

    newRoles.push({
      roleTitle: role.roleTitle,
      company: role.company,
      bullets: keptBullets,
    });
    newStructured.push(keptStructured);

    const remapRow: number[] = new Array(originalCount).fill(-1);
    keptOriginalIndexes.forEach((oi, newIdx) => {
      remapRow[oi] = newIdx;
    });
    indexRemap.push(remapRow);
  }

  return {
    roles: newRoles,
    structuredBullets: newStructured,
    indexRemap,
    rankings,
    droppedByRoleCap,
    droppedByTotalCap,
  };
}

// ── Auditable summary for trace ────────────────────────────────

export interface BulletRankingTrace {
  roles: Array<{
    roleIndex: number;
    roleTitle: string;
    company: string;
    originalBulletCount: number;
    keptBulletCount: number;
    droppedBulletCount: number;
    kept: Array<{
      originalIndex: number;
      newIndex: number;
      score: number;
      breakdown: BulletScoreBreakdown;
      matchedRequired: string[];
      matchedPreferred: string[];
      text: string;
    }>;
    dropped: Array<{
      originalIndex: number;
      score: number;
      breakdown: BulletScoreBreakdown;
      matchedRequired: string[];
      matchedPreferred: string[];
      dropReason: "role-cap" | "total-cap";
      text: string;
    }>;
  }>;
  totals: {
    originalBullets: number;
    keptBullets: number;
    droppedByRoleCap: number;
    droppedByTotalCap: number;
  };
  constraints: RankAndTrimConstraints;
}

export function buildRankingTrace(
  result: RankAndTrimResult,
  constraints: RankAndTrimConstraints,
): BulletRankingTrace {
  const roles = result.rankings.map((r) => {
    const newIndexByOriginal = new Map<number, number>();
    r.keptIndexes.forEach((oi, ni) => newIndexByOriginal.set(oi, ni));

    const kept = r.bullets
      .filter((b) => b.kept)
      .map((b) => ({
        originalIndex: b.originalIndex,
        newIndex: newIndexByOriginal.get(b.originalIndex) ?? -1,
        score: b.score,
        breakdown: b.breakdown,
        matchedRequired: b.matchedRequired,
        matchedPreferred: b.matchedPreferred,
        text: b.text,
      }));

    const dropped = r.bullets
      .filter((b) => !b.kept)
      .map((b) => ({
        originalIndex: b.originalIndex,
        score: b.score,
        breakdown: b.breakdown,
        matchedRequired: b.matchedRequired,
        matchedPreferred: b.matchedPreferred,
        dropReason: (b.dropReason || "role-cap") as "role-cap" | "total-cap",
        text: b.text,
      }));

    return {
      roleIndex: r.roleIndex,
      roleTitle: r.roleTitle,
      company: r.company,
      originalBulletCount: r.bullets.length,
      keptBulletCount: kept.length,
      droppedBulletCount: dropped.length,
      kept,
      dropped,
    };
  });

  const originalBullets = roles.reduce((s, r) => s + r.originalBulletCount, 0);
  const keptBullets = roles.reduce((s, r) => s + r.keptBulletCount, 0);

  return {
    roles,
    totals: {
      originalBullets,
      keptBullets,
      droppedByRoleCap: result.droppedByRoleCap,
      droppedByTotalCap: result.droppedByTotalCap,
    },
    constraints,
  };
}

/**
 * Remap inventedMetrics references after trimming. Drops entries for
 * dropped bullets and rewrites bulletIndex to the new position for
 * kept bullets.
 */
export function remapInventedMetrics<
  T extends { roleIndex: number; bulletIndex: number },
>(entries: T[], indexRemap: number[][]): T[] {
  const out: T[] = [];
  for (const e of entries) {
    const remapRow = indexRemap[e.roleIndex];
    if (!remapRow) continue;
    const newIdx = remapRow[e.bulletIndex];
    if (newIdx < 0) continue; // dropped
    out.push({ ...e, bulletIndex: newIdx });
  }
  return out;
}

// Re-export `PipelineConfig` for caller convenience.
export type { PipelineConfig };
