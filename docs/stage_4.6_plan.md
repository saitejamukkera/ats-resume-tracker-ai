# Stage 4.6 — ATS Gap Repair & Anti-Stuffing Optimization

This document outlines the complete plan for optimizing Stage 4.6 (Keyword Gap Repair) to prevent keyword stuffing while maximizing ATS relevance scores and human readability.

---

## 1. Problem Analysis & Research Summary

### The Root Cause
Since Stage 2 (JD Parser) was updated to perform exhaustive skill extraction, it regularly extracts **15-20 skills** for complex job descriptions (e.g. 19 skills for the EA JD).
Stage 4.6 (Keyword Gap Repair) was originally calibrated for a lazy parser that only found 3-5 missing skills. Currently, it tries to physically force **all 15-20 missing skills** into the candidate's ~18 experience bullets in a single LLM call.

### The Consequences
1. **Keyword Stuffing:** Bullets end up with 4-6 technologies listed in a single run-on sentence, making the resume look unprofessional and highly suspicious to recruiters.
2. **Scoring Penalty:** The ATS scorer applies a **Density Penalty multiplier** (down to `0.6`) in `density-penalty.ts` when keywords occur in excess. Squeezing keywords too frequently triggers this penalty, working *against* the score.
3. **Bullet Quality Degradation:** Overloaded bullets lose focus on action verbs and measurable metrics, lowering the `impactScore` (12-14% weight) and `actionVerbRatio` (6-7% weight) dimensions.

### Industry Research on Optimal Keyword Strategy

| Source | Recommendation |
|---|---|
| **Jobscan (2025)** | 2-3% keyword density. 10-15 keywords total per resume. Stuffing triggers spam filters |
| **HireFlow (2026)** | No more than 2-3 keywords per section. 5-7 high-impact keywords prioritized |
| **LinkedIn (2025)** | 75% of recruiters reject stuffed/"over-optimized" resumes |
| **JobShinobi (2026)** | "1x in Skills + 1-2x in Experience + optional 1x in Summary" is the optimal pattern |
| **ATS TF-IDF behavior** | Real ATS uses TF-IDF — repeating a keyword beyond 2-3 occurrences adds ZERO marginal benefit and can trigger spam detection |

---

## 2. The Ultimate Plan: 3-Layer Defense

We synthesize our findings into a robust, recruiter-approved, and ATS-optimized plan.

### Layer 1: Intelligent Keyword Selection & Prioritization (Cap at 8)

Instead of sending all 20+ missing keywords to the LLM, we select at most **8 keywords** per repair pass using a strict hierarchy:

1. **Defensive Density Filter:** Skip any keyword already present 2+ times in the resume text — additional occurrences yield zero marginal ATS benefit and only increase density penalty risk.
2. **Score-Impact Prioritization:** Sort by impact on ATS score, not just JD frequency. Formula: `(JD frequency count) x (1 - current resume occurrences / density threshold)`. A keyword mentioned heavily in the JD that is completely absent from the resume gets highest priority. A keyword already partially present (e.g., in Skills but not Experience) gets lower priority.
3. **Required-First Cap:** Prioritize required skills first, filling remaining 8-keyword slots with preferred skills only if space permits.
4. **Pass-Aware Skipping:** Accept a `skipKeywords: Set<string>` parameter so Pass 2 can skip the 8 keywords already targeted in Pass 1 and target the next 8 instead. This distributes up to 16 keywords across the 2-pass loop.

### Layer 2: Strict Anti-Stuffing Prompt Constraints

We add strict constraints to the gap repair prompt:
- **Bullet Keyword Limit:** Limit each modified bullet to **at most 1 (max 2) target keywords**.
- **Context Preservation:** The original bullet's action verb, metric, and project detail structure must be preserved. Technology serves only as context/tool to achieve the outcome.
- **Honest Skipping:** Instruct the LLM to skip any keyword that cannot be truthfully and naturally integrated.

### Layer 3: Multi-Pass Distribution (Iterative Refinement)

The pipeline runner (`runner.ts`) is already configured for up to **2 passes** if ATS score < 85:
- **Pass 1:** Targets top 8 most impactful missing keywords. Calculates updated ATS score.
- **Pass 2:** Skips Pass 1's 8 keywords via `skipKeywords`, targets the next 8. Distributes up to 16 keywords across 2 passes for a natural, clean layout.

### Layer 4: Post-Repair Verification

After the LLM returns repaired bullets, count how many target keywords actually ended up in the resume text. Log the placement ratio. If <50% of targeted keywords were placed, the prompt needs tuning — the LLM is skipping too many.

---

## 3. Proposed Code Changes

### 3.1 Helper: `selectRepairKeywords()`

**File:** `resume-pipeline/src/stages/keyword-gap-repair.ts`

Add imports:
```ts
import { countKeywordOccurrences } from "../validation/utils/word-boundary.js";
```

```ts
const MAX_REPAIR_KEYWORDS = 8;

function selectRepairKeywords(
  missingRequired: string[],
  missingPreferred: string[],
  fullResumeText: string,      // Pre-computed full resume text (passed from caller)
  jdText: string,               // Raw JD text for frequency analysis
  skipKeywords: Set<string>,    // Keywords already attempted in prior passes
): string[] {
  const loweredJd = jdText.toLowerCase();
  const loweredResume = fullResumeText.toLowerCase();

  // Combine required first, then preferred
  const allCandidates = [...missingRequired, ...missingPreferred];

  // 1. Filter: skip already-attempted keywords + density threshold (>=2 in resume)
  const filtered = allCandidates.filter((skill) => {
    const lower = skill.toLowerCase();
    if (skipKeywords.has(lower)) return false;
    return countKeywordOccurrences(skill, loweredResume) < 2;
  });

  if (filtered.length === 0) return [];

  // 2. Compute score-impact for each candidate:
  //    impact = JD_frequency x (1 - resume_presence / 2)
  //    Skills completely absent get full weight; partially present get less.
  const maxJdFreq = Math.max(
    ...filtered.map((s) => countKeywordOccurrences(s, loweredJd)),
    1,
  );

  const scored = filtered.map((skill) => {
    const jdFreq = countKeywordOccurrences(skill, loweredJd);
    const resumeCount = countKeywordOccurrences(skill, loweredResume);
    const jdScore = maxJdFreq > 0 ? jdFreq / maxJdFreq : 0;
    const resumeGap = Math.max(0, (2 - resumeCount) / 2); // 1.0 if absent, 0.5 if present once
    return { skill, impact: jdScore * resumeGap };
  });

  // 3. Sort by impact score descending, then cap
  scored.sort((a, b) => b.impact - a.impact);
  return scored.slice(0, MAX_REPAIR_KEYWORDS).map((s) => s.skill);
}
```

### 3.2 Update `repairKeywordGaps()` Signature

Add `rawJdText` and `skipKeywords` parameters. Return `keywordsTargeted` for logging.

```ts
export async function repairKeywordGaps(
  sections: GeneratedSections,
  jd: JDAnalysis,
  rawJdText: string,
  missingRequired: string[],
  missingPreferred: string[],
  skipKeywords: Set<string>,
  snapshotStore?: SnapshotStore,
  models?: Record<string, LanguageModel>,
): Promise<{
  sections: GeneratedSections;
  inputTokens: number;
  outputTokens: number;
  keywordsTargeted: number;
  keywordsPlaced: number;      // NEW: post-repair verification count
}> {
  // Pre-compute full resume text once (passed from caller)
  const fullText = [
    sections.summary,
    sections.skills,
    ...sections.experience.flatMap((r) => [r.roleTitle, r.company, ...r.bullets]),
  ].join(" ");

  const targetKeywords = selectRepairKeywords(
    missingRequired,
    missingPreferred,
    fullText,
    rawJdText,
    skipKeywords,
  );

  if (targetKeywords.length === 0) {
    return {
      sections,
      inputTokens: 0,
      outputTokens: 0,
      keywordsTargeted: 0,
      keywordsPlaced: 0,
    };
  }

  // Build bullet map for the LLM
  const bulletMap = sections.experience
    .map((role, ri) => role.bullets.map((b, bi) => `  [${ri}-${bi}] ${b}`).join("\n"))
    .join("\n");

  const prompt = `You are an ATS optimization expert. The resume below is MISSING these keywords that appear in the job description. Your job is to weave them into existing experience bullets naturally.

TARGET MISSING SKILLS:
${targetKeywords.map((k) => `- ${k}`).join("\n")}

CURRENT BULLETS:
${bulletMap}

JD CONTEXT:
- Position: ${jd.position} at ${jd.company}
- Domain: ${jd.domainFocus}

RULES:
- ONLY modify experience bullets. Do NOT touch or return a summary.
- ANTI-STUFFING: Limit each modified bullet to at most 1 (max 2) target keywords. Do NOT create overloaded run-on sentences.
- CONTEXT PRESERVATION: Do NOT change the core meaning, project details, metrics, or achievements of any bullet. Only append/insert the tool or technology where it fits naturally.
- TRUTHFULNESS: If a keyword cannot be naturally integrated into any current experience bullet, skip it.
- Bullet style: Keep consistent (action verb + tech + outcome).
- Return: repairedBullets array of {roleIndex, bulletIndex, text} for ONLY the bullets you changed.`;

  // ... Execute callLLM, apply repairs to sections ...

  // Post-repair verification: count how many targeted keywords ended up in the resume
  const repairedFullText = [
    sections.summary,
    sections.skills,
    ...sections.experience.flatMap((r) => [r.roleTitle, r.company, ...r.bullets]),
  ].join(" ").toLowerCase();

  let keywordsPlaced = 0;
  for (const kw of targetKeywords) {
    if (countKeywordOccurrences(kw, repairedFullText) > 0) {
      keywordsPlaced++;
    }
  }

  const placementRatio = Math.round((keywordsPlaced / targetKeywords.length) * 100);
  console.log(
    `[keyword-gap-repair] Targeted ${targetKeywords.length} keywords, placed ${keywordsPlaced} (${placementRatio}%)`,
  );
  if (placementRatio < 50) {
    console.warn(
      `[keyword-gap-repair] Low placement ratio — prompt may need tuning.`,
    );
  }

  return {
    sections,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    keywordsTargeted: targetKeywords.length,
    keywordsPlaced,
  };
}
```

### 3.3 Update Pipeline Runner

**File:** `resume-pipeline/src/pipeline/runner.ts`

Track already-attempted keywords across repair passes:

```ts
const ATS_GAP_REPAIR_THRESHOLD = 85;
const MAX_GAP_REPAIR_PASSES = 2;
const attemptedKeywords = new Set<string>();

for (let pass = 1; pass <= MAX_GAP_REPAIR_PASSES; pass++) {
  if (
    atsScore.overall >= ATS_GAP_REPAIR_THRESHOLD ||
    (atsScore.missingRequired.length === 0 &&
      atsScore.missingPreferred.length === 0)
  ) {
    break;
  }

  try {
    const gapResult = await repairKeywordGaps(
      sections,
      jd,
      input.jobDescription,
      atsScore.missingRequired,
      atsScore.missingPreferred,
      attemptedKeywords,
      snapshotStore,
      models,
    );

    // Track which keywords were attempted so Pass 2 targets different ones
    // (The function returns `keywordsTargeted` and `keywordsPlaced` for logging)
    for (const kw of atsScore.missingRequired.slice(0, gapResult.keywordsTargeted)) {
      attemptedKeywords.add(kw.toLowerCase());
    }

    sections = gapResult.sections;
    // ... rest of loop unchanged ...
  }
}
```

---

## 4. Expected Impact Comparison

| Metric | Before | After |
|---|---|---|
| Keywords sent to LLM per pass | 17-20 | **Max 8** |
| Pass 2 behavior | Retries same 8 keywords | **Targets next 8 (up to 16 total)** |
| Max keywords per experience bullet | 4-6 (Unreadable) | **1-2 (Natural & clean)** |
| ATS Score improvement | +15 (69 → 84) | **+10-12 (69 → 79-81)** |
| Density penalty multiplier triggered | Yes (0.6x-0.8x penalty) | **No (1.0x - clean)** |
| Post-repair verification | None | **Placement ratio logged + warning** |
| Recruiter and spam-filter safety | High risk | **Safe (reads like a human wrote it)** |

## 5. Files to Change

| # | File | Change |
|---|---|---|
| 1 | `resume-pipeline/src/stages/keyword-gap-repair.ts` | Add `selectRepairKeywords()` + `skipKeywords` param + anti-stuffing prompt + post-repair verification |
| 2 | `resume-pipeline/src/pipeline/runner.ts` | Track `attemptedKeywords` Set across passes, pass to `repairKeywordGaps()` |
