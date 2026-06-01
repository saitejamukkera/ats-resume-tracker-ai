# ATS Scoring Engine — Complete Improvement Plan

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Research Findings](#2-research-findings)
3. [Gap Analysis](#3-gap-analysis)
4. [Architecture Decisions](#4-architecture-decisions)
5. [Implementation Plan](#5-implementation-plan)
6. [File Change Summary](#6-file-change-summary)
7. [Execution Order & Dependency Chain](#7-execution-order--dependency-chain)
8. [Test Strategy](#8-test-strategy)
9. [Effort Estimates](#9-effort-estimates)

---

## 1. Current State Analysis

### 1.1 Architecture

```
JD → LLM Parser → (requiredSkills, preferredSkills, keyPhrases)
                                                              ↓
LaTeX Resume → Generated Sections → string.includes() matching → 5-dim weighted score
                                                              ↓
                         Impact Detector (separate, unused in ATS composite)
```

All scoring logic lives in `resume-pipeline/src/validation/ats-scorer.ts`. The engine is deterministic (0 LLM calls at scoring time) and produces a 0-100 score from five weighted dimensions.

The backend (Spring Boot) acts purely as a score consumer — it logs and forwards scores via SSE but never persists them. The frontend has no score display components.

### 1.2 Current Weights & Methods

| Dimension | Weight | Method | Issue |
|---|---|---|---|
| `keywordMatch` | 40% | `fullText.includes(skill.toLowerCase())` with 40-entry hardcoded alias map | Naive substring, no word-boundary, no semantics |
| `preferredMatch` | 15% | Same `includes()` on preferred skills | Same issue |
| `sectionCompleteness` | 15% | Binary: `summary.length > 0`, `skills.length > 0`, `experience.length > 0` | Any non-empty text gets full credit |
| `formatScore` | 15% | **Hardcoded `1.0`** — always 100% | Wastes 15% of score budget |
| `keywordPlacement` | 15% | Same `includes()` on summary + first 2 bullets | Same substring collision problem |

### 1.3 Score Usage in Pipeline

```
Stage 4.5: Calculate ATS Score
    ↓
Stage 4.6: Keyword Gap Repair (if score < 85 and missing keywords exist)
    ↓  Up to 2 repair passes, re-scores after each
    ↓  Stops if no improvement
    ↓
Stage 5:  LaTeX Assembly
    ↓
Impact Score computed separately (not composited into ATS score)
    ↓
SSE Events: emit `atsScore` + `impactScore`
    ↓
Pipeline Output: return `atsScore`, `impactScore`, `trace`
```

### 1.4 Files Involved

| File | Role |
|---|---|
| `resume-pipeline/src/validation/ats-scorer.ts` | Core ATS score calculator |
| `resume-pipeline/src/impact/detector.ts` | Impact scoring engine (separate from ATS) |
| `resume-pipeline/src/schemas/pipeline.ts` | Score type definitions & config thresholds |
| `resume-pipeline/src/schemas/jd-analysis.ts` | JD analysis schema (scoring inputs) |
| `resume-pipeline/src/validation/validator.ts` | Validator (uses impact scoring, JD relevance) |
| `resume-pipeline/src/pipeline/runner.ts` | Orchestrator (runs scoring, emits events) |
| `resume-pipeline/src/stages/keyword-gap-repair.ts` | Triggered by low ATS score |
| `backend/.../service/ResumePipelineClient.java` | Deserializes `atsScore` from pipeline |
| `backend/.../service/ResumeService.java` | Logs scores, forwards in SSE |
| `backend/.../dto/GenerateFromJdResponse.java` | Response DTO (no score fields) |

---

## 2. Research Findings

### 2.1 Commercial ATS Tools (What They Actually Measure)

**Sources:** Jobscan, ResumeWorded, CVCraft, HireFlow, Scale.jobs

| Tool | Key Dimensions | Notable Detail |
|---|---|---|
| **Jobscan** | Keyword alignment, hard skills prioritization, formatting checks, job title matching, keyword density awareness | Reports 10.6x higher interview rate when job title matches target role. Recommends 75-80% target. Explicitly warns against keyword stuffing. |
| **ResumeWorded** | Impact (action verbs + quantified results), soft skills, word choice, formatting | Weights criteria differently based on importance. Not a simple average. |
| **CVCraft** | Keyword match (30-40%), formatting compatibility (25-35%), section completeness (20-30%), file format (5-10%) | Most transparent about weight breakdown. |
| **Workday (HiredScore AI)** | Skills-to-JD matching, inferred skills (semantic), Skills Cloud taxonomy, questionnaire-based filtering | Acquired HiredScore for AI candidate grading. Has "inferred skills" — semantic understanding beyond exact keyword match. |
| **Greenhouse** | Flexible parsing, keyword extraction from skill sections, better mixed-format handling | Excels at skill-to-JD keyword mapping. |
| **Lever** | Hyperlink recognition, tech/skills keyword parsing | Strong for tech-industry resumes. |

**Key Industry Statistics (from research):**

- 98.4% of Fortune 500 companies use ATS (Jobscan 2024 report)
- 75% of resumes filtered before human review (multiple sources)
- ~3% applicant-to-interview ratio (CareerPlug 2024 benchmark)
- Recruiters spend 6-8 seconds on initial resume scan (Tufts Career Center)
- DOCX preferred over PDF for maximum ATS compatibility (HireFlow comparison)
- Single-column, standard headings, no tables/graphics (UIC Career Services, MIT CAPD)

### 2.2 Academic Research (ML-Based ATS Scoring)

**Sources:** ConFit (Yu et al. 2024), Özlü et al. 2022, InEXIT (Shao et al.), Balmes & Ballera 2026, Wilson & Caliskan 2024

| Finding | Source | Impact |
|---|---|---|
| BERT-based contrastive training improves NDCG by 20-30% over keyword-only | ConFit (Yu et al. 2024) | Semantic matching is transformative |
| Triplet-loss BERT improved Precision@K by ~12% | Özlü et al. 2022 | Even basic fine-tuned BERT beats keyword approaches |
| Transformers consistently beat TF-IDF and word2vec baselines | Balmes & Ballera 2026 | ML approach is proven superior |
| Skill normalization via taxonomies (ESCO/O*NET/Lightcast) is industry standard | Affinda docs | Static alias maps are insufficient |
| Field-level hierarchical attention (InEXIT) captures inter-section relationships | Shao et al. | Skills in skills section + experience section = higher weight |
| Embedding-based matchers biased toward white male names | Wilson & Caliskan 2024 | Fairness auditing is essential |
| Two-stage retrieval+reranking is production standard | Multiple sources | BM25/embedding retrieval → cross-encoder reranker |
| Dual-encoder with FAISS handles 10K documents in milliseconds | ConFit | Scalable even for large candidate pools |

### 2.3 Best Practice Pipeline (Academic Consensus)

```
Resume/JD → Parse → Normalize → Feature/Embed → Retrieve → Rerank → Output
                                     │
                                     ├── BM25/TF-IDF (fast baseline)
                                     ├── Dense embeddings (SBERT/E5)
                                     ├── Structured features (skill overlap, years, location)
                                     └── Cross-encoder (fine-grained pair scoring)
```

---

## 3. Gap Analysis

### Gap 1: No Semantic Matching

**Current:** `string.includes()` only. `"Java"` matches `"JavaScript"`, `"C"` matches `"C++"`, `"Go"` matches `"MongoDB"`. Cannot match "built REST APIs in Node.js" to "backend development" or "distributed systems" to "Kafka, microservices."

**Industry standard:** Jobscan uses keyword extraction algorithms + comparison. Workday Skills Cloud infers unlisted skills from context. Academic: ConFit showed 20-30% NDCG boost with BERT-based semantic matching.

### Gap 2: Format Score Always 100%

**Current:** `formatScore = 1.0` — "We're using template-based assembly, so format is always clean."

**Industry standard:** CVCraft assigns 25-35% weight to format compatibility. Academic research treats parsing/canonicalization as the critical first pipeline stage. Real ATS (Workday, Greenhouse, Lever) each parse differently and struggle with complex layouts.

### Gap 3: Impact Score Is Silos

**Current:** Impact detector (`detector.ts`) has excellent bullet-level analysis: 9-signal detection, strength classification, category detection, credibility checks, context-aware suggestions — but none of this feeds into the ATS composite.

**Industry standard:** ResumeWorded explicitly weights impact + action verbs as part of overall score.

### Gap 4: No Keyword Density/Stuffing Penalty

**Current:** More occurrences = higher score. No diminishing returns.

**Industry standard:** Jobscan explicitly warns against keyword stuffing. Academic: TF-IDF weighting specifically prevents over-indexing common terms.

### Gap 5: 40-Entry Alias Map Is Too Small

**Current:** Covers ~40 software engineering terms only. Zero coverage for marketing, healthcare, finance, mechanical engineering, or any non-software role.

**Industry standard:** Taxonomy integration (ESCO/O*NET/Lightcast) with thousands of skills, mapped by canonical ID. Dynamic keyword extraction from JD text.

### Gap 6: No Skill-to-Experience Coherence

**Current:** All resume text is flattened into one search space via `extractAllText()`.

**Industry standard:** Academic: InEXIT model performs field-level attention — skills get higher weight when they appear in both skills section AND experience bullets.

### Gap 7: No Title, Experience, or Location Matching

**Current:** None of these are factored into the score.

**Industry standard:** Jobscan: 10.6x higher interview rate with matching job title. Academic: experience fit and location match are standard features in XGBoost-based ATS systems.

### Gap 8: Scores Not Persisted or Displayed

**Current:** Scores exist only in pipeline response and logs. No database column. No frontend display.

**Industry standard:** Any ATS optimization tool (Jobscan, ResumeWorded, Rezi) shows scores prominently.

### Gap 9: No Explainability

**Current:** Users get a single number with no breakdown.

**Industry standard:** Jobscan shows keyword gaps explicitly. Academic: Shapley values, feature importance, attention visualization.

---

## 4. Architecture Decisions

### 4.1 Embedding Library: `@huggingface/transformers` (v3), NOT `@xenova/transformers`

**Verified:** GitHub issue [#1291](https://github.com/huggingface/transformers.js/issues/1291) — maintainer xenova (May 2025):

- `@huggingface/transformers` (v3) = forward-looking package with WebGPU/GPU + WASM/CPU support. New models and features go here. Currently at v3.8.1 stable.
- `@xenova/transformers` (v2) = WASM/CPU-only legacy. Still works (~100k weekly downloads), but won't get new features. Fine for BERT embeddings if you're already using it, but no reason to adopt it for new development.
- **API is largely compatible** — migration is a 1-line import change.

**Decision:** Use `@huggingface/transformers` v3 for all new development.

### 4.2 Pure Function + Async Wrapper Architecture

Instead of making `calculateATSScore` async (which makes it hard to test), split into:

```ts
// Pure, synchronous, unit-testable without mocking
function calculateATSScore(params: ATSScoringInput): ATSScore { ... }

// Async wrapper for pipeline integration (calls embedding model externally)
async function calculateATSScoreWithEmbeddings(
  sections, jd, parsed, impactProfiles, latex, jdText
): Promise<ATSScore> {
  const semanticSimilarity = await computeResumeJDSimilarity(
    prepareTextForEmbedding(sections), jdText
  );
  return calculateATSScore({ ...otherParams, semanticSimilarity });
}
```

**Benefits:** Core scoring logic is deterministic, synchronous, and testable. Embedding is an optional wrapper.

### 4.3 Dual Weight Tables (Phase 2 Without Embeddings, Phase 3 With)

During Phase 2, `semanticSimilarity` returns 0 (embedding module doesn't exist yet). Without a fallback, 15% of the score budget is wasted and max score is capped at ~85.

**Decision:** Ship two weight tables, selected at runtime:

```ts
const WEIGHTS_PHASE2 = {
  keywordRelevance: 30, preferredRelevance: 10, impactScore: 14,
  metricsRatio: 9, keywordPlacement: 8, sectionCompleteness: 8,
  formatScore: 8, actionVerbRatio: 7, keywordDensity: 6,
  skillExperienceCoherence: 5, experienceLevelMatch: 5,
};
// Total: 110 (title bonus adds up to 3 more, overall clamped to 100)

const WEIGHTS_PHASE3 = {
  keywordRelevance: 25, semanticSimilarity: 15, impactScore: 12,
  metricsRatio: 8, preferredRelevance: 8, keywordPlacement: 7,
  sectionCompleteness: 7, formatScore: 7, actionVerbRatio: 6,
  keywordDensity: 5, skillExperienceCoherence: 5, experienceLevelMatch: 5,
};
// Total: 110
```

### 4.4 `JSONB` for Score Breakdown Storage

PostgreSQL `JSONB` allows querying individual score dimensions (e.g., `WHERE score_breakdown->>'keywordRelevance' < '50'`). `TEXT` requires full table scans with string parsing. Since the project uses PostgreSQL (per docker-compose), use `JSONB`.

### 4.5 Feature-Flag Semantic Scoring

Embedding model download (~80MB) may fail in restricted environments (Docker without internet, corporate firewalls). The scorer must not break when this happens.

**Decision:** Environment variable `ENABLE_SEMANTIC_SCORING` (default: `true`). When disabled, or when model fails to load, the scorer uses Phase 2 weights and returns `semanticScoringAvailable: false` in the output so the UI can indicate it.

### 4.6 Score Version Field

When weights or dimensions change, old scores become incomparable. Add `scoreVersion: number` to `ATSScore`:

```ts
interface ATSScore {
  version: 1; // increment when WEIGHTS change
  // ...
}
```

And `score_version INTEGER` column in the database migration.

### 4.7 `all-MiniLM-L6-v2` Token Limit Handling

**Verified:** Model card says 256 tokens default truncation; `sentence_bert_config.json` has `max_seq_length: 512`. The safe approach is to assume ~256 WordPiece tokens (roughly 1,200 characters) and use structured section extraction instead of blind character truncation.

### 4.8 SOLID Design Principles

The scoring engine is designed for extensibility from day one. New scoring dimensions, new validators, or new matching algorithms should be addable without modifying the core scorer.

#### Single Responsibility Principle (SRP)

| Module | Single Responsibility |
|---|---|
| `ats-scorer.ts` | Compute final score from pre-computed inputs. Pure function. |
| `format-validator.ts` | Validate LaTeX output for ATS compatibility issues |
| `skill-variants.ts` | Generate canonical skill variants from raw strings |
| `embedding-matcher.ts` | Compute semantic similarity via SBERT embeddings |
| `dimensions/*.ts` | Each dimension computes ONE sub-score (see below) |
| `runner.ts` | Orchestrate pipeline stages, call scorer with assembled inputs |

#### Open/Closed Principle (OCP)

Each scoring dimension is a **pluggable strategy** implementing a common interface. Adding a new dimension (e.g., "certification match") requires:
1. Create a new dimension file
2. Register it in the dimension registry
3. Add its weight to the weight table

Zero changes to `calculateATSScore`.

```ts
// ── Dimension Interface ────────────────────────────────────────

/**
 * Every scoring dimension must implement this interface.
 * `ctx` provides read-only access to all input data the dimension
 * might need — sections, JD analysis, parsed resume, impact profiles.
 */
export interface ScorerDimension {
  /** Unique key used in componentBreakdown output */
  readonly key: string;
  /** Human-readable label for UI display */
  readonly label: string;
  /**
   * Compute a score in [0, 1] range.
   * Throwing is allowed — caller catches and returns 0 with a warning.
   */
  evaluate(ctx: ScoringContext): number;
}

// ── Context (read-only, all inputs available) ──────────────────

export interface ScoringContext {
  sections: GeneratedSections;
  jd: JDAnalysis;
  parsedResume: ParsedResume;
  impactProfiles: RoleImpactProfile[];
  fullLatexText: string;
  // Pre-computed values that may be shared across dimensions:
  fullText: string;
  skillsText: string;
  experienceText: string;
  highWeightText: string;
}

// ── Dimension Registry ─────────────────────────────────────────

/**
 * Ordered list of dimensions. Order matters — dimensions can depend
 * on pre-computed values in ctx that earlier dimensions set.
 * To add a new dimension, just push it into this array. No other
 * code needs to change (except weight allocation).
 */
export const defaultDimensions: ScorerDimension[] = [
  keywordRelevanceDimension,
  preferredRelevanceDimension,
  impactScoreDimension,
  metricsRatioDimension,
  actionVerbRatioDimension,
  keywordPlacementDimension,
  sectionCompletenessDimension,
  formatScoreDimension,
  skillExperienceCoherenceDimension,
  experienceLevelMatchDimension,
];

// When semantic scoring is available, prepend it:
// dimensions.unshift(semanticSimilarityDimension);
```

#### Dependency Inversion Principle (DIP)

The core scorer depends on abstractions (the `ScorerDimension` interface), not concrete implementations. The pipeline runner composes dimensions and injects them:

```ts
// ── Scorer Factory ─────────────────────────────────────────────

export function createScorer(dimensions: ScorerDimension[]): ATSScorer {
  return {
    calculate: (ctx: ScoringContext): ATSScore => {
      // Evaluate each dimension, catching errors individually
      const results = new Map<string, number>();
      const errors: string[] = [];
      
      for (const dim of dimensions) {
        try {
          results.set(dim.key, dim.evaluate(ctx));
        } catch (e) {
          console.warn(`[scorer] Dimension "${dim.key}" failed:`, e);
          results.set(dim.key, 0);
          errors.push(dim.key);
        }
      }
      
      return composeFinalScore(dimensions, results, errors, ctx);
    },
  };
}

// ── Usage in Pipeline Runner ───────────────────────────────────

// Phase 2 (no embeddings):
const scorer = createScorer(defaultDimensions);

// Phase 3 (with embeddings):
const scorer = createScorer([
  semanticSimilarityDimension,
  ...defaultDimensions,
]);

const ctx = buildScoringContext(sections, jd, parsedResume, impactProfiles, latex);
const atsScore = scorer.calculate(ctx);
```

#### Interface Segregation Principle (ISP)

Dimensions only depend on the parts of `ScoringContext` they actually need. The context is a flat object — dimensions access only what they require:

```ts
// Example: metricsRatioDimension only reads impactProfiles
const metricsRatioDimension: ScorerDimension = {
  key: 'metricsRatio',
  label: 'Metrics Usage',
  evaluate(ctx: ScoringContext): number {
    const allAnalyses = ctx.impactProfiles.flatMap(p => p.bullets);
    if (allAnalyses.length === 0) return 0;
    const withMetrics = allAnalyses.filter(a => a.signals.hasNumber).length;
    return withMetrics / allAnalyses.length;
  },
};
```

#### File Structure (Final)

```
resume-pipeline/src/validation/
├── ats-scorer.ts              # Pure core scorer + async wrapper
├── scoring-context.ts          # ScoringContext builder
├── scorer-factory.ts           # createScorer() + composeFinalScore()
├── scorer-dimension.ts         # ScorerDimension interface
├── format-validator.ts         # Format validation
├── skill-variants.ts           # Skill alias map + dynamic variants
├── embedding-matcher.ts        # SBERT embeddings (local model)
├── dimensions/
│   ├── index.ts                # Re-exports all dimensions + defaultDimensions array
│   ├── keyword-relevance.ts
│   ├── preferred-relevance.ts
│   ├── impact-score.ts
│   ├── metrics-ratio.ts
│   ├── action-verb-ratio.ts
│   ├── keyword-placement.ts
│   ├── section-completeness.ts
│   ├── format-score.ts
│   ├── skill-experience-coherence.ts
│   ├── experience-level-match.ts
│   └── semantic-similarity.ts  # Phase 3
└── utils/
    ├── word-boundary.ts        # keywordExistsInText, escapeRegex
    ├── density-penalty.ts      # calculateDensityPenalty
    ├── latex-stripper.ts       # stripLatexCommands, stripAllLatex
    └── cosine-similarity.ts    # Shared math utility
```

**The `utils/latex-stripper.ts` implements `stripAllLatex`**, which is used by `format-validator.ts`. This utility extends the existing `stripLatexCommands` in the current `ats-scorer.ts` to handle full LaTeX document stripping:

```ts
// resume-pipeline/src/validation/utils/latex-stripper.ts

/**
 * Strip all LaTeX formatting from a complete .tex document,
 * leaving only plain text suitable for format validation.
 * Extends the simpler stripLatexCommands() used for keyword matching.
 */
export function stripAllLatex(text: string): string {
  return text
    // Remove preamble (everything before \begin{document})
    .replace(/^[\s\S]*?\\begin\{document\}/i, '')
    .replace(/\\end\{document\}[\s\S]*$/i, '')
    // Strip section commands, keeping the title text
    .replace(/\\section\*?\{([^}]*)\}/g, '\n$1\n')
    .replace(/\\subsection\*?\{([^}]*)\}/g, '\n$1\n')
    // Strip formatting commands
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\textit\{([^}]*)\}/g, '$1')
    .replace(/\\emph\{([^}]*)\}/g, '$1')
    .replace(/\\underline\{([^}]*)\}/g, '$1')
    .replace(/\\small\{([^}]*)\}/g, '$1')
    .replace(/\\large\{([^}]*)\}/g, '$1')
    // Strip resume-specific commands
    .replace(/\\resumeItem\{([^}]*)\}/g, '• $1')
    .replace(/\\resumeSubheading\{([^}]*)}\{([^}]*)}\{([^}]*)}\{([^}]*)\}/g, '$1 — $2 | $3 $4')
    .replace(/\\resumeSubheading\s*\[[^\]]*\]\s*\{([^}]*)}\{([^}]*)}\{([^}]*)}\{([^}]*)\}/g, '$1 — $2 | $3 $4')
    // Strip list environments
    .replace(/\\resumeSubHeadingListStart|\\resumeSubHeadingListEnd/g, '')
    .replace(/\\resumeItemListStart|\\resumeItemListEnd/g, '')
    .replace(/\\begin\{itemize\}|\\end\{itemize\}/g, '')
    .replace(/\\item\s/g, '• ')
    // Strip remaining LaTeX commands
    .replace(/\\[a-zA-Z]+(\{[^}]*\})*/g, ' ')
    // Clean up
    .replace(/[{}&$#%~]/g, ' ')
    .replace(/\\\\/g, '\n')
    .replace(/\\\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}
```

#### Why This Design Scales

| Scenario | What You Change |
|---|---|
| Add "certification match" dimension | Create `dimensions/certification-match.ts`, add to `defaultDimensions`, adjust weights |
| Change keyword matching from regex to TF-IDF | Replace `dimensions/keyword-relevance.ts`, zero changes to scorer |
| A/B test two weight configs | Create `WEIGHTS_V2`, pass to `createScorer()`, compare in analytics |
| Add GPT-based dimension (costly) | Implement `ScorerDimension`, wrap API call with error handling |
| Remove a broken dimension | Remove from `defaultDimensions` array, redistribute its weight |
| Swap embedding model (MiniLM → E5) | Replace `embedding-matcher.ts`, interface stays the same |

---

## 5. Implementation Plan

### Phase 1: Fix What's Broken

**Goal:** Close the most egregious gaps without adding dependencies.
**Effort:** 2-3 days (regex edge cases + `stripAllLatex` implementation + testing).

#### 1.1 — Rewrite Core ATS Scorer Internals

**File:** `resume-pipeline/src/validation/ats-scorer.ts`

**Changes:**

- Replace all `fullText.includes()` with word-boundary-aware regex matching:

```ts
function keywordExistsInText(skill: string, text: string): boolean {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}
```

> **⚠️ Known limitation:** `\b` fails for skills containing non-word characters (`C++`, `C#`, `F#`, `.NET`, `Node.js`). `+` and `#` are not word characters, so `\bC\+\+\b` never matches. Fix below.

**Edge-case fix** for skills with non-word characters — use lookbehind/lookahead when `\b` won't work:

```ts
function keywordExistsInText(skill: string, text: string): boolean {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Detect if skill ends with a non-word character (C++, C#, F#, etc.)
  const lastChar = skill.charAt(skill.length - 1);
  const isAlphanumeric = /\w/.test(lastChar);
  
  if (!isAlphanumeric) {
    // Use lookbehind/lookahead for non-word-boundary matching
    // "C++" should match in "C++ developer" but NOT match "C" alone
    const boundaryRegex = new RegExp(
      `(^|[^\\w])${escaped}([^\\w]|$)`, 'i'
    );
    return boundaryRegex.test(text);
  }
  
  // Standard word boundary for normal skills (React, Python, Java, etc.)
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}
```

> **Test cases to write (Phase 1):**
> - `"C++"` in `"Used C++ for systems programming"` → `true`
> - `"C++"` in `"C"` → `false`
> - `"C#"` in `"Built APIs with C# and .NET"` → `true`
> - `"C#"` in `"C"` → `false`
> - `"Node.js"` in `"Used Node.js for the backend"` → `true`
> - `".NET"` in `"Built .NET Core applications"` → `true`
> - `"Java"` in `"Java and JavaScript developer"` → matches only `"Java"`, not `"JavaScript"`

- Add keyword density penalty function (document-length-relative, applied as multiplier on `keywordRelevance`):

```ts
function calculateDensityPenalty(skills: string[], text: string): number {
  const wordCount = text.split(/\s+/).length;
  if (wordCount === 0) return 1.0;
  
  let totalExcessOccurrences = 0;
  
  for (const skill of skills) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const count = (text.match(regex) || []).length;
    // Expected max: ~1 occurrence per 150 words (roughly one per paragraph)
    const expectedMax = Math.max(3, Math.ceil(wordCount / 150));
    if (count > expectedMax) {
      totalExcessOccurrences += (count - expectedMax);
    }
  }
  
  // Returns 1.0 (clean) down to 0.6 (heavy stuffing)
  return Math.max(0.6, 1 - (totalExcessOccurrences * 0.05));
}
```

> **Important:** The density penalty is applied as a **multiplier on `keywordRelevance`**, not as a standalone dimension. This prevents the density "score" from wasting budget on a non-differentiating signal (most resumes won't stuff keywords). The weight budget that was allocated to `keywordDensity` is redistributed to `skillExperienceCoherence` and `experienceLevelMatch`.

- Expand `sectionCompleteness` from 3 binary checks to 6 weighted checks:

```ts
function checkSectionCompleteness(
  sections: GeneratedSections,
  preamble: string,
  education: string
): number {
  const checks = [
    { text: sections.summary, weight: 2, name: 'summary' },
    { text: sections.skills, weight: 2, name: 'skills' },
    { text: sections.experience.flatMap(r => r.bullets).join(' '), weight: 3, name: 'experience' },
    { text: education, weight: 1.5, name: 'education' },
    { text: preamble, weight: 1, name: 'contactInfo' },  // email/phone patterns
    { text: [sections.summary, sections.skills, ...sections.experience.flatMap(r => r.bullets)].join(' '), weight: 0.5, name: 'certifications' },
  ];
  
  let score = 0;
  let totalWeight = 0;
  for (const check of checks) {
    totalWeight += check.weight;
    if (check.text.trim().length > 20) score += check.weight;  // meaningful content threshold
  }
  return score / totalWeight;
}
```

#### 1.2 — Create Format Validator

**File:** `resume-pipeline/src/validation/format-validator.ts` (NEW)

> **Note:** `stripAllLatex()` is a utility function that must be implemented (extend existing `stripLatexCommands` in `ats-scorer.ts`). LaTeX stripping is brittle — the caller must wrap format validation in a try/catch. See Phase 2.3 for the error boundary.

```ts
export interface FormatResult {
  score: number;          // 0.0–1.0
  issues: FormatIssue[];
}

export interface FormatIssue {
  severity: 'critical' | 'warning';
  category: 'parsing' | 'headings' | 'contact' | 'dates' | 'bullets';
  message: string;
}

export function validateFormat(
  latexText: string,
  sections: GeneratedSections,
  preamble: string
): FormatResult {
  const issues: FormatIssue[] = [];
  
  // 1. Plain-text extraction readability
  const plainText = stripAllLatex(latexText);
  const unresolvedCommands = plainText.match(/\\[a-zA-Z]+/g);
  if (unresolvedCommands) {
    issues.push({
      severity: 'critical',
      category: 'parsing',
      message: `Unresolved LaTeX commands found: ${unresolvedCommands.slice(0, 5).join(', ')}`,
    });
  }
  
  // 2. Standard section headings
  const hasExperience = /(work\s+)?experience|employment|professional\s+history/i.test(plainText);
  const hasEducation = /education|academic|qualifications/i.test(plainText);
  const hasSkills = /skills?|technologies|proficienc/i.test(plainText);
  if (!hasExperience) {
    issues.push({
      severity: 'critical',
      category: 'headings',
      message: 'No identifiable "Experience" section heading found',
    });
  }
  if (!hasEducation) {
    issues.push({
      severity: 'warning',
      category: 'headings',
      message: 'No identifiable "Education" section heading found',
    });
  }
  
  // 3. Contact info presence
  const hasEmail = /[\w.-]+@[\w.-]+\.\w+/i.test(preamble) || /[\w.-]+@[\w.-]+\.\w+/i.test(plainText);
  const hasPhone = /\+?\d[\d\s().-]{7,}/.test(preamble) || /\+?\d[\d\s().-]{7,}/.test(plainText);
  if (!hasEmail && !hasPhone) {
    issues.push({
      severity: 'critical',
      category: 'contact',
      message: 'No email or phone number detected — ATS may discard anonymous resumes',
    });
  }
  
  // 4. Date format consistency
  const dates = plainText.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{1,2}\/\d{4}\b/gi) || [];
  const formatCounts = new Map<string, number>();
  for (const d of dates) {
    const format = /\d{1,2}\/\d{4}/.test(d) ? 'MM/YYYY' : 'Month YYYY';
    formatCounts.set(format, (formatCounts.get(format) || 0) + 1);
  }
  if (formatCounts.size > 1) {
    issues.push({
      severity: 'warning',
      category: 'dates',
      message: `Inconsistent date formats detected: ${[...formatCounts.keys()].join(' and ')}`,
    });
  }
  
  // 5. Bullet count sanity
  for (const role of sections.experience) {
    if (role.bullets.length === 0) {
      issues.push({
        severity: 'critical',
        category: 'bullets',
        message: `Role "${role.roleTitle}" has 0 bullets`,
      });
    }
    if (role.bullets.length > 15) {
      issues.push({
        severity: 'warning',
        category: 'bullets',
        message: `Role "${role.roleTitle}" has ${role.bullets.length} bullets — may indicate parsing error`,
      });
    }
  }
  
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const score = Math.max(0, 1 - (criticalCount * 0.25 + warningCount * 0.1));
  
  return { score: Math.round(score * 100) / 100, issues };
}
```

#### 1.3 — Expand Skill Variant Map

**File:** `resume-pipeline/src/validation/skill-variants.ts` (NEW — extracted from ats-scorer.ts)

- Expand from 40 hardcoded entries to 200+ entries
- Add categories: programming languages, databases, cloud, DevOps, frontend, backend, data, mobile, AI/ML, soft skills, methodologies
- Add a function to dynamically generate variants from JD analysis:

```ts
export function generateDynamicVariants(term: string): string[] {
  const variants: string[] = [term.toLowerCase()];
  const lower = term.toLowerCase();
  
  // Common abbreviation patterns
  if (lower.includes('.')) {
    variants.push(lower.replace(/\./g, ''));  // "node.js" → "nodejs"
  }
  if (lower.includes('-')) {
    variants.push(lower.replace(/-/g, ' '));  // "ci-cd" → "ci cd"
    variants.push(lower.replace(/-/g, ''));    // "ci-cd" → "cicd"
  }
  if (lower.includes('/')) {
    variants.push(lower.replace(/\//g, ' '));  // "ci/cd" → "ci cd"
    variants.push(lower.replace(/\//g, ''));   // "ci/cd" → "cicd"
  }
  
  // Common suffix/prefix variants
  if (lower.endsWith('js')) {
    variants.push(lower.replace(/js$/, '.js'));
  }
  
  return [...new Set(variants)];
}

export function getAllSkillVariants(skill: string): string[] {
  const dynamic = generateDynamicVariants(skill);
  const fromMap = PREDEFINED_VARIANTS[skill.toLowerCase()];
  return [...new Set(fromMap ? [...dynamic, ...fromMap] : dynamic)];
}
```

---

### Phase 2: Integrate Existing Infrastructure

**Goal:** Merge impact detector output into ATS composite. Add new dimensions from existing code.
**Effort:** 2-3 days. Depends on Phase 1.

#### 2.1 — Expand ATSScore Interface

**File:** `resume-pipeline/src/schemas/pipeline.ts`

```ts
export interface ATSScore {
  version: number;                       // incremented when WEIGHTS change
  overall: number;
  
  // Revised dimensions (from Phase 1)
  keywordRelevance: number;              // was keywordMatch — word-boundary
  preferredRelevance: number;            // was preferredMatch
  sectionCompleteness: number;           // expanded check (6 sections)
  formatScore: number;                   // real validation from Phase 1.2
  keywordPlacement: number;
  
  // New dimensions from existing infrastructure
  impactScore: number;                   // from bullet-level impact detector
  metricsRatio: number;                  // % bullets with quantifiable numbers
  actionVerbRatio: number;               // % bullets starting with strong verbs
  skillExperienceCoherence: number;      // skills in skills section that appear in experience
  experienceLevelMatch: number;          // JD experience level vs resume experience spans
  
  // Density (applied as multiplier on keywordRelevance, NOT standalone)
  densityPenaltyFactor: number;          // 0.6–1.0, multiplies keywordRelevance contribution
  
  // Semantic matching (Phase 3)
  semanticSimilarity: number;            // embedding cosine similarity
  semanticScoringAvailable: boolean;     // true if embeddings loaded successfully
  
  // Diagnostics
  missingRequired: string[];
  missingPreferred: string[];
  
  // Explainability
  componentBreakdown: Record<string, {
    raw: number;
    weighted: number;
    max: number;
    label: string;
  }>;
  
  // Format issues (from Phase 1.2)
  formatIssues: FormatIssue[];
  
  // Feature flags
  features: {
    semanticScoring: boolean;            // whether embeddings were used
    formatValidated: boolean;            // whether format check completed without error
  };
}
```

#### 2.2 — Weight Distributions (Two Tables for Phase 2/Phase 3)

**Phase 2 weights** (no embedding — `semanticSimilarity` returns 0):

```ts
const WEIGHTS_PHASE2 = {
  // Core matching
  keywordRelevance:        30,  // was 40 (keywordMatch), now with word-boundary
  preferredRelevance:      10,  // was 15, now with word-boundary
  
  // Impact & quality (from existing detector)
  impactScore:             14,  // NEW — from impact detector
  metricsRatio:             9,  // NEW — from validator metric check
  actionVerbRatio:          7,  // NEW — % bullets with strong verb starters
  
  // Structure & coherence
  keywordPlacement:         8,  // was 15
  sectionCompleteness:      8,  // was 15, expanded to 6 sections
  formatScore:              8,  // was 15 always-100%, now real checks
  skillExperienceCoherence: 6,  // NEW — skills in both sections
  experienceLevelMatch:     5,  // NEW — JD level vs resume experience spans
};
// Density penalty: applied as multiplier on keywordRelevance (not standalone)
// Title bonus: up to +3 points added after overall computation, clamped to 100
// NOTE: Weight total = 105 is intentional — creates "top-end compression."
//       A perfect 100/100 requires near-perfect scores in ALL dimensions
//       PLUS title alignment bonus. Clamping to 100 prevents display overflow.
// Total base: 105 (title bonus adds up to +3, then Math.min(100, ...))
```

**Phase 3 weights** (with embeddings):

```ts
const WEIGHTS_PHASE3 = {
  // Core matching
  keywordRelevance:        25,  // reduced to make room for semantic
  semanticSimilarity:      15,  // NEW — embedding cosine similarity
  preferredRelevance:       8,  // reduced
  
  // Impact & quality
  impactScore:             12,
  metricsRatio:             8,
  actionVerbRatio:          6,
  
  // Structure & coherence
  keywordPlacement:         7,
  sectionCompleteness:      7,
  formatScore:              7,
  skillExperienceCoherence: 5,
  experienceLevelMatch:     5,
};
// Density penalty: applied as multiplier on keywordRelevance (not standalone)
// Title bonus: up to +3 points added after overall computation, clamped to 100
// Total base: 105
```

**Runtime weight selection:**

```ts
const weights = (semanticSimilarity > 0 || !jdRawText) 
  ? WEIGHTS_PHASE3 
  : WEIGHTS_PHASE2;
```

#### 2.3 — Pure Core Scorer + Async Wrapper

The scorer is split into two layers:

1. **`calculateATSScore(params)`** — pure, synchronous, unit-testable. All values are pre-computed and passed in.
2. **`calculateATSScoreWithEmbeddings(...)`** — async wrapper for pipeline use. Computes embedding similarity, then calls the pure function.

```ts
// ── Input type for pure scorer ──
interface ATSScoringInput {
  sections: GeneratedSections;
  jd: JDAnalysis;
  parsedResume: ParsedResume;
  impactProfiles: RoleImpactProfile[];
  fullLatexText: string;
  
  // Pre-computed similarity (0 if not available)
  semanticSimilarity: number;
  semanticScoringAvailable: boolean;
  formatValidated: boolean;
}

// ── Pure core scorer ──
export function calculateATSScore(input: ATSScoringInput): ATSScore {
  const { sections, jd, parsedResume, impactProfiles, fullLatexText,
          semanticSimilarity, semanticScoringAvailable, formatValidated } = input;
  
  const fullText = extractAllText(sections).toLowerCase();
  const weights = semanticSimilarity > 0 ? WEIGHTS_PHASE3 : WEIGHTS_PHASE2;
  
  // ── Compute sub-scores from impact profiles ──
  const allAnalyses = impactProfiles.flatMap(p => p.bullets);
  
  const impactScore = allAnalyses.length > 0
    ? allAnalyses.reduce((s, b) => s + b.score, 0) / allAnalyses.length / 100
    : 0;
  
  const withMetrics = allAnalyses.filter(a => a.signals.hasNumber).length;
  const metricsRatio = allAnalyses.length > 0 ? withMetrics / allAnalyses.length : 0;
  
  const withStrongVerb = allAnalyses.filter(a => a.signals.hasImpactVerb).length;
  const actionVerbRatio = allAnalyses.length > 0 ? withStrongVerb / allAnalyses.length : 0;
  
  // ── Keyword relevance (word-boundary matching) ──
  const requiredFound = jd.requiredSkills.filter(skill => {
    const variants = getAllSkillVariants(skill);
    return variants.some(v => keywordExistsInText(v, fullText));
  });
  const missingRequired = jd.requiredSkills.filter(skill => {
    const variants = getAllSkillVariants(skill);
    return !variants.some(v => keywordExistsInText(v, fullText));
  });
  const keywordRelevance = jd.requiredSkills.length > 0
    ? requiredFound.length / jd.requiredSkills.length
    : 1;
  
  // ── Density penalty (multiplier on keyword relevance, NOT standalone) ──
  const densityPenaltyFactor = calculateDensityPenalty(
    [...jd.requiredSkills, ...jd.preferredSkills],
    fullText
  );
  
  // ── Preferred relevance (word-boundary) ──
  const preferredFound = jd.preferredSkills.filter(skill => {
    const variants = getAllSkillVariants(skill);
    return variants.some(v => keywordExistsInText(v, fullText));
  });
  const missingPreferred = jd.preferredSkills.filter(skill => {
    const variants = getAllSkillVariants(skill);
    return !variants.some(v => keywordExistsInText(v, fullText));
  });
  const preferredRelevance = jd.preferredSkills.length > 0
    ? preferredFound.length / jd.preferredSkills.length
    : 1;
  
  // ── Section completeness (expanded) ──
  const sectionCompleteness = checkSectionCompleteness(
    sections, parsedResume.preamble, parsedResume.education
  );
  
  // ── Format score (real validation with error boundary) ──
  let formatScore = 0.85; // reasonable default if validation fails
  let formatIssues: FormatIssue[] = [];
  let validated = false;
  try {
    const formatResult = validateFormat(fullLatexText, sections, parsedResume.preamble);
    formatScore = formatResult.score;
    formatIssues = formatResult.issues;
    validated = true;
  } catch (e) {
    console.warn('[ats-scorer] Format validation failed, using default:', e.message);
  }
  
  // ── Keyword placement (word-boundary) ──
  const highWeightTexts = [
    sections.summary,
    ...sections.experience.flatMap(r => r.bullets.slice(0, 2)),
  ];
  const highWeightText = highWeightTexts.join(" ").toLowerCase();
  const highWeightHits = jd.requiredSkills.filter(skill =>
    getAllSkillVariants(skill).some(v => keywordExistsInText(v, highWeightText))
  );
  const keywordPlacement = jd.requiredSkills.length > 0
    ? highWeightHits.length / jd.requiredSkills.length
    : 1;
  
  // ── Skill-experience coherence ──
  const skillsText = sections.skills.toLowerCase();
  const experienceText = sections.experience
    .flatMap(r => r.bullets).join(' ').toLowerCase();
  const skillsInSkillsSection = jd.requiredSkills.filter(s =>
    getAllSkillVariants(s).some(v => keywordExistsInText(v, skillsText))
  );
  const skillsInExperience = skillsInSkillsSection.filter(s =>
    getAllSkillVariants(s).some(v => keywordExistsInText(v, experienceText))
  );
  const skillExperienceCoherence = skillsInSkillsSection.length > 0
    ? skillsInExperience.length / skillsInSkillsSection.length
    : 1;
  
  // ── Experience level match ──
  const experienceLevelMatch = checkExperienceLevelMatch(
    jd.experienceLevel,
    sections.experience.length
  );
  
  // ── Title alignment bonus ──
  const titleBonus = checkTitleAlignment(sections, jd.position);
  
  // ── Apply density penalty to keywordRelevance ──
  const adjustedKeywordRelevance = keywordRelevance * densityPenaltyFactor;
  
  // ── Compute overall ──
  const components: Record<string, { raw: number; weighted: number; max: number; label: string }> = {
    keywordRelevance:       { raw: adjustedKeywordRelevance,  weighted: 0, max: weights.keywordRelevance, label: 'Keyword Match' },
    preferredRelevance:     { raw: preferredRelevance,       weighted: 0, max: weights.preferredRelevance, label: 'Preferred Skills' },
    impactScore:            { raw: impactScore,              weighted: 0, max: weights.impactScore, label: 'Bullet Impact' },
    metricsRatio:           { raw: metricsRatio,             weighted: 0, max: weights.metricsRatio, label: 'Metrics Usage' },
    actionVerbRatio:        { raw: actionVerbRatio,          weighted: 0, max: weights.actionVerbRatio, label: 'Action Verbs' },
    keywordPlacement:       { raw: keywordPlacement,         weighted: 0, max: weights.keywordPlacement, label: 'Keyword Placement' },
    sectionCompleteness:    { raw: sectionCompleteness,      weighted: 0, max: weights.sectionCompleteness, label: 'Sections' },
    formatScore:            { raw: formatScore,              weighted: 0, max: weights.formatScore, label: 'ATS Format' },
    skillExperienceCoherence: { raw: skillExperienceCoherence, weighted: 0, max: weights.skillExperienceCoherence, label: 'Skill Coherence' },
    experienceLevelMatch:   { raw: experienceLevelMatch,     weighted: 0, max: weights.experienceLevelMatch, label: 'Experience Level' },
  };
  
  // Add semantic similarity if available
  if (semanticSimilarity > 0 && weights.semanticSimilarity) {
    components.semanticSimilarity = {
      raw: semanticSimilarity,
      weighted: 0,
      max: weights.semanticSimilarity,
      label: 'Semantic Fit'
    };
  }
  
  for (const comp of Object.values(components)) {
    comp.weighted = Math.round(comp.raw * comp.max);
  }
  
  const baseOverall = Object.values(components).reduce((sum, c) => sum + c.weighted, 0);
  const overall = Math.min(100, Math.round(baseOverall + titleBonus * 3));
  
  return {
    version: 1,
    overall,
    keywordRelevance: Math.round(keywordRelevance * 100),
    preferredRelevance: Math.round(preferredRelevance * 100),
    sectionCompleteness: Math.round(sectionCompleteness * 100),
    formatScore: Math.round(formatScore * 100),
    keywordPlacement: Math.round(keywordPlacement * 100),
    impactScore: Math.round(impactScore * 100),
    metricsRatio: Math.round(metricsRatio * 100),
    actionVerbRatio: Math.round(actionVerbRatio * 100),
    skillExperienceCoherence: Math.round(skillExperienceCoherence * 100),
    experienceLevelMatch: Math.round(experienceLevelMatch * 100),
    densityPenaltyFactor: Math.round(densityPenaltyFactor * 100),
    semanticSimilarity: Math.round(semanticSimilarity * 100),
    semanticScoringAvailable,
    missingRequired,
    missingPreferred,
    componentBreakdown: components,
    formatIssues,
    features: {
      semanticScoring: semanticScoringAvailable,
      formatValidated: validated,
    },
  };
}

// ── Async wrapper for pipeline integration ──
export async function calculateATSScoreWithEmbeddings(
  sections: GeneratedSections,
  jd: JDAnalysis,
  parsedResume: ParsedResume,
  impactProfiles: RoleImpactProfile[],
  fullLatexText: string,
  jdRawText: string,
): Promise<ATSScore> {
  let semanticSimilarity = 0;
  let semanticScoringAvailable = false;
  
  if (process.env.ENABLE_SEMANTIC_SCORING !== 'false' && jdRawText) {
    try {
      const resumeText = prepareTextForEmbedding(sections);
      semanticSimilarity = await computeResumeJDSimilarity(resumeText, jdRawText);
      semanticScoringAvailable = true;
    } catch (e) {
      console.warn('[ats-scorer] Semantic scoring unavailable:', e.message);
    }
  }
  
  return calculateATSScore({
    sections,
    jd,
    parsedResume,
    impactProfiles,
    fullLatexText,
    semanticSimilarity,
    semanticScoringAvailable,
    formatValidated: true,
  });
}

// ── Supporting functions ──

function checkExperienceLevelMatch(
  jdLevel: 'entry' | 'mid' | 'senior' | undefined,  // LLM may return undefined
  experienceRoleCount: number
): number {
  // Defensive: if LLM parsing didn't return a level, assume 'mid'
  const level = jdLevel || 'mid';
  
  // TODO: Replace role count with actual years-of-experience computed
  //       from parsed LaTeX date ranges. Role count is a weak proxy —
  //       a candidate with 2 roles spanning 10 years ≠ a candidate
  //       with 5 roles spanning 2 years. Ship it, improve later.
  const rangeMap: Record<string, { min: number; max: number; ideal: number }> = {
    entry: { min: 0, max: 2, ideal: 1 },
    mid:   { min: 2, max: 5, ideal: 3 },
    senior:{ min: 4, max: Infinity, ideal: 6 },
  };
  const range = rangeMap[level];
  if (experienceRoleCount >= range.min && experienceRoleCount <= range.max) return 1.0;
  if (experienceRoleCount >= range.min - 1 && experienceRoleCount <= range.max + 1) return 0.7;
  return 0.4;
}

function checkTitleAlignment(
  generatedSections: GeneratedSections,
  jdTitle: string
): number {
  // Note: jd.position is the JD title (from JDAnalysis)
  const jdTitleLower = jdTitle.toLowerCase();
  const jdTitleWords = jdTitleLower.split(/\s+/).filter(w => w.length > 2);
  if (jdTitleWords.length === 0) return 0;
  
  // Check summary for the JD title
  const summaryLower = generatedSections.summary.toLowerCase();
  const titleInSummary = jdTitleWords.some(w => summaryLower.includes(w)) ? 0.7 : 0;
  
  // Check most recent role title for full title match
  let titleInRole = 0;
  if (generatedSections.experience.length > 0) {
    const lastRoleTitle = generatedSections.experience[0].roleTitle.toLowerCase();
    titleInRole = jdTitleWords.every(w => lastRoleTitle.includes(w)) ? 1.0 : 0;
  }
  
  return Math.max(titleInSummary, titleInRole);
}
```

#### 2.4 — Update Pipeline Runner

**File:** `resume-pipeline/src/pipeline/runner.ts`

Changes:
- Import `calculateATSScoreWithEmbeddings` (async wrapper), not the pure function directly
- Compute `impactProfiles` via `profileRoleImpact()` before calling scorer
- Pass `parsedResume`, `fullLatex`, `jdRawText`
- Log component breakdown for debugging

```ts
// ── Stage 4.5: ATS Score ──────────────────────────────────────
telemetry.startStage("ats-scorer");

// Compute impact profiles for each role
const jdKeywords = [...jd.requiredSkills, ...jd.preferredSkills];
const impactProfiles = sections.experience.map((role, i) =>
  profileRoleImpact(
    `${role.roleTitle || `Role ${i}`}`,
    role.bullets,
    jdKeywords,
    jd.experienceLevel,
  )
);

let atsScore = await calculateATSScoreWithEmbeddings(
  sections,
  jd,
  parsed,             // parsed resume for education, preamble, etc.
  impactProfiles,
  finalLatex,         // for format validation
  input.jobDescription // raw JD text for embedding similarity
);

console.log(`[pipeline] ATS Score: ${atsScore.overall}/100 (v${atsScore.version})`);
console.log(`[pipeline] Breakdown:`, 
  Object.entries(atsScore.componentBreakdown)
    .map(([k, v]) => `${v.label}: ${v.weighted}/${v.max}`)
    .join(' | ')
);
if (!atsScore.features.semanticScoring) {
  console.log('[pipeline] Semantic scoring unavailable — using Phase 2 weights');
}
if (!atsScore.features.formatValidated) {
  console.log('[pipeline] Format validation degraded — using default score');
}

telemetry.endStage("ats-scorer");
```

---

### Phase 3: Embedding-Based Semantic Matching

**Goal:** Add SBERT embeddings via `@huggingface/transformers` (v3) for true semantic similarity.
**Effort:** 4-5 days (package migration + model testing + chunking strategy + cold-start handling). Depends on Phase 2.

#### 3.1 — Add Dependency

**File:** `resume-pipeline/package.json`

```json
{
  "dependencies": {
    "@huggingface/transformers": "^3.8.1"
  }
}
```

Run: `cd resume-pipeline && npm install`

> **Why `@huggingface/transformers` not `@xenova/transformers`:** Verified via maintainer xenova (GitHub issue #1291, May 2025) — `@huggingface/transformers` (v3) is the forward-looking package with WebGPU/GPU + WASM/CPU support. `@xenova/transformers` (v2) is WASM/CPU-only legacy that won't receive new features. API is largely compatible.

**About the library:**
- Runs Transformer models locally in Node.js — no API calls, no internet after first model download
- all-MiniLM-L6-v2 model is ~80MB (downloads once, cached to HF_HOME)
- Converts ~256 tokens of text to 384-dim embedding in ~50ms on CPU
- Proven: ConFit used E5-small (similar size), achieved 20-30% NDCG boost
- v3 adds WebGPU support for GPU-accelerated inference when available

#### 3.2 — Add ENABLE_SEMANTIC_SCORING to .env.example

**File:** `resume-pipeline/.env.example`

```
# Semantic ATS scoring (requires ~80MB model download on first run)
ENABLE_SEMANTIC_SCORING=true
```

#### 3.3 — Create Embedding Matcher

**File:** `resume-pipeline/src/validation/embedding-matcher.ts` (NEW)

```ts
import { pipeline, env } from '@huggingface/transformers';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';

env.allowRemoteModels = true;

let embedder: FeatureExtractionPipeline | null = null;
let modelLoadAttempted = false;
let modelLoadFailed = false;

/**
 * Get or initialize the embedding model. Returns null if unavailable.
 * The caller (scorer) handles graceful degradation when null is returned.
 */
export async function getEmbedder(): Promise<FeatureExtractionPipeline | null> {
  if (embedder) return embedder;
  if (modelLoadFailed) return null;
  
  try {
    console.log('[embedding-matcher] Loading all-MiniLM-L6-v2 (first run downloads ~80MB)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    modelLoadAttempted = true;
    console.log('[embedding-matcher] Model loaded successfully.');
    return embedder;
  } catch (error) {
    modelLoadFailed = true;
    modelLoadAttempted = true;
    console.warn('[embedding-matcher] Model load failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return Math.max(0, dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)));
}

/**
 * Prepare resume text for embedding by extracting key structured sections.
 * This is better than blind character truncation because:
 * 1. all-MiniLM-L6-v2 has ~256 WordPiece token limit
 * 2. We want to capture the most semantically rich parts
 * 3. Structured extraction ensures no mid-sentence cuts
 */
export function prepareTextForEmbedding(sections: GeneratedSections): string {
  const parts: string[] = [];
  
  // Summary (highest signal — what the candidate does)
  if (sections.summary.trim()) {
    parts.push(sections.summary);
  }
  
  // Skills (dense keyword signal)
  if (sections.skills.trim()) {
    parts.push(sections.skills);
  }
  
  // Top 3 roles, first 2 bullets each (most recent and relevant experience)
  for (const role of sections.experience.slice(0, 3)) {
    const roleText = [
      role.roleTitle,
      ...role.bullets.slice(0, 2),
    ].filter(Boolean).join('. ');
    if (roleText.trim()) {
      parts.push(roleText);
    }
  }
  
  const combined = parts.join(' ').trim();
  // ~256 WordPiece tokens ≈ ~1,200 characters for English text
  return combined.slice(0, 1200);
}

/**
 * Compute semantic similarity between resume text and job description.
 * Returns value in [0, 1] range.
 */
export async function computeResumeJDSimilarity(
  resumeText: string,
  jdText: string,
): Promise<number> {
  try {
    const model = await getEmbedder();
    if (!model) return 0;
    
    // Truncate JD text to ~256 tokens as well
    const jdChunk = jdText.slice(0, 1200);
    
    const [resumeOutput, jdOutput] = await Promise.all([
      model(resumeText, { pooling: 'mean', normalize: true }),
      model(jdChunk, { pooling: 'mean', normalize: true }),
    ]);
    
    return cosineSimilarity(resumeOutput.data, jdOutput.data);
  } catch (error) {
    console.warn('[embedding-matcher] Similarity computation failed:', 
      error instanceof Error ? error.message : error);
    return 0; // Return 0, not 0.5 — signal "unavailable" to the scorer
  }
}

/**
 * Compute skill-to-resume similarity for individual skill matching.
 * Gives partial credit for semantically related skills even without exact match.
 */
export async function computeSkillSimilarity(
  skill: string,
  resumeText: string,
): Promise<number> {
  try {
    const model = await getEmbedder();
    if (!model) return 0;
    
    const [skillOutput, textOutput] = await Promise.all([
      model(skill, { pooling: 'mean', normalize: true }),
      model(resumeText.slice(0, 1200), { pooling: 'mean', normalize: true }),
    ]);
    
    return cosineSimilarity(skillOutput.data, textOutput.data);
  } catch (error) {
    console.warn('[embedding-matcher] Skill similarity failed:', 
      error instanceof Error ? error.message : error);
    return 0;
  }
}

export const SEMANTIC_MATCH_THRESHOLD = 0.45;
```

#### 3.4 — Add Warmup in Server Startup

**File:** `resume-pipeline/src/index.ts`

Add warmup call so the model is loaded before the first request hits (avoids 2-5 second cold-start delay):

```ts
// In server startup:
app.listen(PORT, async () => {
  console.log(`[server] Resume pipeline running on port ${PORT}`);
  
  // Pre-load embedding model in background (non-blocking)
  if (process.env.ENABLE_SEMANTIC_SCORING !== 'false') {
    getEmbedder()
      .then(m => {
        if (m) console.log('[server] Embedding model pre-loaded');
        else console.log('[server] Embedding model unavailable — semantic scoring disabled');
      })
      .catch(e => console.warn('[server] Embedding model pre-load failed:', e.message));
  }
});
```

#### 3.5 — Semantic Fallback in Keyword Matching

> The semantic fallback is integrated into the pure `calculateATSScore` in Phase 2.3 — it uses `semanticSimilarity` if available (>0). The async wrapper `calculateATSScoreWithEmbeddings` computes embeddings externally and passes them in. No changes needed to the keyword matching logic itself.

#### 3.6 — Job Title Matching

Already implemented in `checkTitleAlignment()` in Phase 2.3. Applied as a bonus modifier (up to +3 points, clamped to 100 total).

---

### Phase 4: Persist, Display, and Explain

**Goal:** Store scores in DB, show them in the frontend, provide breakdown explanations.
**Effort:** 3-4 days (full-stack changes across 3 services + SSE updates + frontend integration). Depends on Phase 3.

#### 4.1 — Database Migration

**File:** `backend/src/main/resources/db/migration/V8__add_score_columns.sql` (NEW)

```sql
ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS ats_score INTEGER,
  ADD COLUMN IF NOT EXISTS impact_score INTEGER,
  ADD COLUMN IF NOT EXISTS score_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB; -- queryable, not TEXT

COMMENT ON COLUMN job_applications.score_version IS
  'Incremented when ATS scoring weights/dimensions change. Used to filter analytics by scorer version.';
```

#### 4.2 — Backend Entity Update

**File:** `backend/src/main/java/com/fullstack/ATSJobTracker/model/JobApplication.java`

Add fields:
```java
@Column(name = "ats_score")
private Integer atsScore;

@Column(name = "impact_score")
private Integer impactScore;

@Column(name = "score_version")
private Integer scoreVersion;

@Column(name = "score_breakdown", columnDefinition = "JSONB")
@Type(JsonBinaryType.class)  // from hibernate-types-62 or use JPA AttributeConverter
private Map<String, Object> scoreBreakdown;
```

> **Note:** If `hibernate-types` is not already a dependency, add `io.hypersistence:hypersistence-utils-hibernate-62` or use a custom `AttributeConverter<Map<String,Object>, String>` with an `ObjectMapper`. If you take the latter approach (simpler, fewer dependencies), the column can remain `TEXT` but the Java field should still be `Map<String, Object>`.

(Add corresponding getters/setters or use Lombok.)

#### 4.3 — Backend Pipeline Client Update

**File:** `backend/src/main/java/com/fullstack/ATSJobTracker/service/ResumePipelineClient.java`

Update `PipelineResponse` inner class to include score breakdown:
```java
public static class PipelineResponse {
    public String latex;
    public String coverLetter;
    public String position;
    public String company;
    public String jobId;
    public String location;
    public int atsScore;
    public int impactScore;
    public Map<String, Object> scoreBreakdown;  // NEW
}
```

#### 4.4 — Backend Service Update

**File:** `backend/src/main/java/com/fullstack/ATSJobTracker/service/ResumeService.java`

After receiving pipeline response:
```java
// Store scores on the application
application.setAtsScore(response.atsScore);
application.setImpactScore(response.impactScore);
if (response.scoreBreakdown != null) {
    application.setScoreBreakdown(
        new ObjectMapper().writeValueAsString(response.scoreBreakdown)
    );
}
applicationRepository.save(application);
```

#### 4.5 — Backend DTO Update

**File:** `backend/src/main/java/com/fullstack/ATSJobTracker/dto/GenerateFromJdResponse.java`

Add:
```java
private int atsScore;
private int impactScore;
private Map<String, Object> scoreBreakdown;
```

#### 4.6 — Frontend Score Card Component

**File:** `frontend/src/components/ATSScoreCard.tsx` (NEW)

```tsx
'use client';

interface ScoreComponent {
  raw: number;
  weighted: number;
  max: number;
  label: string;
}

interface ATSScoreCardProps {
  overallScore: number;
  impactScore: number;
  breakdown: Record<string, ScoreComponent>;
  missingRequired?: string[];
  missingPreferred?: string[];
}

export function ATSScoreCard({ overallScore, impactScore, breakdown, missingRequired, missingPreferred }: ATSScoreCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getProgressColor = (ratio: number) => {
    if (ratio >= 0.8) return 'bg-green-500';
    if (ratio >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="rounded-lg border p-6 space-y-4">
      {/* Overall Score */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">ATS Score</h3>
        <span className={`text-3xl font-bold ${getScoreColor(overallScore)}`}>
          {overallScore}/100
        </span>
      </div>

      {/* Impact Score */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Impact Score</span>
        <span className={`font-medium ${getScoreColor(impactScore)}`}>
          {impactScore}/100
        </span>
      </div>

      {/* Component Breakdown */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Score Breakdown</h4>
        {Object.entries(breakdown).map(([key, comp]) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{comp.label}</span>
              <span className="text-muted-foreground">
                {comp.weighted}/{comp.max}
              </span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
className={`h-full rounded-full transition-all ${getProgressColor(comp.weighted / comp.max)}`}
style={{ width: `${comp.max > 0 ? (comp.weighted / comp.max) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Missing Keywords */}
      {(missingRequired?.length > 0 || missingPreferred?.length > 0) && (
        <div className="space-y-1 text-xs">
          {missingRequired?.length > 0 && (
            <p className="text-red-500">
              Missing required: {missingRequired.join(', ')}
            </p>
          )}
          {missingPreferred?.length > 0 && (
            <p className="text-yellow-600">
              Missing preferred: {missingPreferred.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

#### 4.7 — Frontend Integration Points

- Add `ATSScoreCard` to the resume generation result page (after `resume-ready` SSE event)
- Add score summary to the application detail view
- Include in SSE streaming event handler for real-time score display

#### 4.8 — Frontend API Types Update

**File:** `frontend/src/lib/api.ts`

Add TypeScript types for score data in the API response types.

---

### Phase 5: Observability & Analytics

**Goal:** Track score distributions over time, enable A/B testing.
**Effort:** 1 day. Depends on Phase 4.

#### 5.1 — Log Component Breakdown in Telemetry

**File:** `resume-pipeline/src/observability/trace.ts`

Add `componentBreakdown` to `GenerationTrace.scores`:

```ts
scores: {
  ats: number;
  impactScore: number;
  componentBreakdown: Record<string, { raw: number; weighted: number; max: number }>;
};
```

#### 5.2 — Analytics Dashboard Data

**File:** `resume-pipeline/src/observability/analytics.ts`

Track per-dimension averages across multiple generations to identify systemic weaknesses (e.g., "formatScore is always low → fix LaTeX template").

---

## 6. File Change Summary

| # | File | Action | Phase |
|---|---|---|---|
| 1 | `resume-pipeline/src/validation/scorer-dimension.ts` | **Create** — `ScorerDimension` interface + `ScoringContext` type | 1 |
| 2 | `resume-pipeline/src/validation/scorer-factory.ts` | **Create** — `createScorer()`, `composeFinalScore()` | 1 |
| 3 | `resume-pipeline/src/validation/scoring-context.ts` | **Create** — `buildScoringContext()` | 1 |
| 4 | `resume-pipeline/src/validation/ats-scorer.ts` | **Rewrite** — pure core scorer + `calculateATSScoreWithEmbeddings` async wrapper | 1-3 |
| 5 | `resume-pipeline/src/validation/format-validator.ts` | **Create** — real format checks | 1 |
| 6 | `resume-pipeline/src/validation/skill-variants.ts` | **Create** — expanded alias map (200+), dynamic JD variant generation | 1 |
| 7 | `resume-pipeline/src/validation/utils/word-boundary.ts` | **Create** — `keywordExistsInText`, `escapeRegex` | 1 |
| 8 | `resume-pipeline/src/validation/utils/density-penalty.ts` | **Create** — `calculateDensityPenalty` | 1 |
| 9 | `resume-pipeline/src/validation/utils/latex-stripper.ts` | **Create** — `stripLatexCommands`, `stripAllLatex` | 1 |
| 10 | `resume-pipeline/src/validation/utils/cosine-similarity.ts` | **Create** — shared math utility | 3 |
| 11 | `resume-pipeline/src/validation/dimensions/` (11 files) | **Create** — one file per scoring dimension | 1-2 |
| 12 | `resume-pipeline/src/validation/dimensions/semantic-similarity.ts` | **Create** — embedding-based dimension | 3 |
| 13 | `resume-pipeline/src/validation/embedding-matcher.ts` | **Create** — SBERT cosine similarity, skill-level similarity | 3 |
| 14 | `resume-pipeline/src/schemas/pipeline.ts` | **Modify** — expanded ATSScore interface with version, features, componentBreakdown | 2 |
| 15 | `resume-pipeline/src/pipeline/runner.ts` | **Modify** — build context, create scorer, call with assembled params | 2-3 |
| 16 | `resume-pipeline/src/index.ts` | **Modify** — embedding model warmup on server startup | 3 |
| 17 | `resume-pipeline/package.json` | **Modify** — add `@huggingface/transformers` dependency | 3 |
| 18 | `resume-pipeline/.env.example` | **Modify** — add `ENABLE_SEMANTIC_SCORING` | 3 |
| 19 | `resume-pipeline/src/observability/trace.ts` | **Modify** — record component breakdown in trace | 5 |
| 20 | `resume-pipeline/src/observability/analytics.ts` | **Modify** — per-dimension averages | 5 |
| 21 | `backend/src/main/resources/db/migration/V8__add_score_columns.sql` | **Create** — DB schema migration (JSONB + score_version) | 4 |
| 22 | `backend/.../model/JobApplication.java` | **Modify** — add atsScore, impactScore, scoreVersion, scoreBreakdown | 4 |
| 23 | `backend/.../service/ResumePipelineClient.java` | **Modify** — parse scoreBreakdown from pipeline response | 4 |
| 24 | `backend/.../service/ResumeService.java` | **Modify** — store scores on application entity | 4 |
| 25 | `backend/.../dto/GenerateFromJdResponse.java` | **Modify** — add score fields to response DTO | 4 |
| 26 | `frontend/src/components/ATSScoreCard.tsx` | **Create** — score display with gauge, breakdown bars, missing keywords | 4 |
| 27 | `frontend/src/lib/api.ts` | **Modify** — TypeScript types for score data | 4 |
| 28 | (frontend page components) | **Modify** — integrate ATSScoreCard into resume result + app detail pages | 4 |
| 29 | `resume-pipeline/src/__tests__/` | **Create** — unit tests for scorer, dimensions, utils | all |

---

## 7. Execution Order & Dependency Chain

```
Phase 1 (no dependencies — can start immediately):
├── 1.1 Create utils/word-boundary.ts, utils/density-penalty.ts, utils/latex-stripper.ts
├── 1.2 Create scorer-dimension.ts (interface + ScoringContext type)
├── 1.3 Create scoring-context.ts (buildScoringContext)
├── 1.4 Create scorer-factory.ts (createScorer + composeFinalScore)
├── 1.5 Create skill-variants.ts (extract + expand from ats-scorer.ts)
├── 1.6 Create format-validator.ts (standalone, uses latex-stripper)
├── 1.7 Create all dimensions/*.ts files (one per scoring dimension)
├── 1.8 Rewrite ats-scorer.ts as pure function using scorer-factory
├── 1.9 Verify: npm run typecheck (resume-pipeline)
├── 1.10 Run Phase 1 unit tests: npm test
         ↓
Phase 2 (depends on Phase 1):
├── 2.1 Expand ATSScore interface in pipeline.ts (version, features, formatIssues)
├── 2.2 Update composeFinalScore to use new weights + density as multiplier + title bonus
├── 2.3 Update runner.ts: build context, create scorer, call calculateATSScoreWithEmbeddings
│       depends on: 2.2
├── 2.4 Verify: npm run typecheck (resume-pipeline)
├── 2.5 Run Phase 2 unit tests: npm test
         ↓
Phase 3 (depends on Phase 2):
├── 3.1 npm install @huggingface/transformers
├── 3.2 Add ENABLE_SEMANTIC_SCORING to .env.example
├── 3.3 Create utils/cosine-similarity.ts
├── 3.4 Create embedding-matcher.ts (structured extraction, feature flag, graceful degradation)
├── 3.5 Create dimensions/semantic-similarity.ts
├── 3.6 Add warmup in src/index.ts
├── 3.7 Update runner.ts: prepend semanticSimilarityDimension when available
├── 3.8 Verify: npm run typecheck (resume-pipeline)
├── 3.9 Run Phase 3 integration tests
├── 3.10 Manual test: run pipeline, verify semanticSimilarity > 0 in score output
         ↓
Phase 4 (depends on Phase 3 — scores must be finalized):
├── 4.1 Create V8 migration SQL (JSONB + score_version)
├── 4.2 Update JobApplication entity (with JPA AttributeConverter)
├── 4.3 Update ResumePipelineClient.java (parse scoreBreakdown map)
├── 4.4 Update ResumeService.java (persist scores)
├── 4.5 Update GenerateFromJdResponse.java (add score fields)
├── 4.6 Create ATSScoreCard.tsx (with div-by-zero safety)
├── 4.7 Update api.ts types
├── 4.8 Integrate into frontend pages
│       depends on: 4.5 (DTO has score fields)
├── 4.9 Verify: ./mvnw compile (backend), npm run typecheck (frontend)
└── 4.10 Run backend integration test
         ↓
Phase 5 (observability — can run parallel to Phase 4):
├── 5.1 Update trace.ts (componentBreakdown in scores)
├── 5.2 Update analytics.ts (per-dimension averages)
└── 5.3 Verify: npm run typecheck
```

---

## Appendix A: Expected Impact Per Phase

| Phase | Specific Improvement | Expected Score Accuracy Gain | Resume Quality Impact |
|---|---|---|---|
| 1 | Word-boundary matching | Fixes false positives (Java≠JavaScript) — 5-10% more accurate skill detection | Prevents unnecessary gap repairs |
| 1 | Real format validation | Catches LaTeX assembly bugs — prevents garbled resumes | Catches output errors before user sees them |
| 1 | Density penalty | Prevents score inflation from repeated keywords | Discourages keyword stuffing in repair passes |
| 1 | Pluggable dimension architecture | No direct score improvement | Makes future changes O(1) instead of O(n) |
| 2 | Impact score integration | 14% of score reflects actual bullet quality | LLM gets "weak impact" signal → generates stronger bullets |
| 2 | Action verb ratio | Rewards active language in scoring | Encourages stronger bullet generation |
| 2 | Skill-experience coherence | Penalizes "orphan" skills not demonstrated in bullets | LLM weaves demonstrated skills into experience |
| 2 | Experience level match | 5% of score reflects JD-resume level alignment | LLM adjusts language to appropriate seniority |
| 2 | Title alignment bonus | Up to +3 points for role alignment (Jobscan 10.6x stat) | Guides LLM toward role-appropriate language |
| 3 | Embedding similarity | 20-30% better skill relevance detection (per ConFit paper) | Semantic gap detection → identifies REAL gaps → better repairs |
| 4 | Persist + Display | Users can track score trends across applications | Builds user trust; enables A/B testing of improvements |
| 4 | Explainability (breakdown) | Users understand WHY score is what it is | Actionable feedback → user can manually improve |
| 5 | Telemetry aggregation | Per-dimension averages identify systemic weaknesses | Data-driven template and prompt improvements |

## Appendix B: Scaling This Further

### Future Dimensions (Low Effort Once SOLID Architecture is in Place)

| Dimension | Description | Weight Suggestion | Data Source |
|---|---|---|---|
| `certificationMatch` | % of JD-requested certs on resume | 3-5 | Parse certs from education/preamble |
| `educationLevelMatch` | JD's min degree vs resume's highest degree | 3-5 | Compare degree strings |
| `locationMatch` | Resume location vs JD location preference | 2-3 | String distance on location fields |
| `softSkillsMatch` | JD soft skills (leadership, communication) in resume | 3-5 | Pre-defined soft skill list + embedding similarity |
| `bulletLengthHealth` | Average bullet length in optimal range (15-25 words) | 2 | Simple word count per bullet |
| `dateFormatConsistency` | Already in format-validator, could be standalone | 1-2 | Already computed |

To add any of these: create `dimensions/<name>.ts`, implement `ScorerDimension`, add to `defaultDimensions` array, adjust weights. No core scorer changes needed.

### Model Upgrade Path (Phase 3.5+)

| Model | Size | Context | When to Switch |
|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2` (current) | 80MB | 256 tokens | Default |
| `Xenova/all-mpnet-base-v2` | 420MB | 384 tokens | Higher accuracy needed |
| `Xenova/e5-small-v2` | 130MB | 512 tokens | Better cross-domain generalization |
| `Xenova/multilingual-e5-small` | 470MB | 512 tokens | Multi-language support |

The `embedding-matcher.ts` interface (`computeResumeJDSimilarity`, `computeSkillSimilarity`) stays the same — just change the model name string.

### ESCO/O*NET Taxonomy Integration (Future Phase)

The research strongly recommends taxonomy-normalized skills. Implementation approach:

1. At JD parse time (Stage 2 in runner.ts), query [ESCO API](https://esco.ec.europa.eu/en/use-esco/statistical-data) for each extracted skill
2. Cache canonical skill IDs locally (SQLite or JSON file, ~5MB for full tech skill taxonomy)
3. During scoring, match canonical skill IDs instead of raw strings
4. Benefits: cross-language matching ("gestion de projet" = "project management"), synonym resolution, domain-specific skill hierarchies

This is a high-effort, high-value enhancement for non-software-industry support. Not in the current implementation scope.

---

## Appendix C: Migration from Old to New Scorer

### Backward Compatibility

The existing codebase calls `calculateATSScore(sections, jd)` which returns `ATSScore` with `overall`, `keywordMatch`, `preferredMatch`, `sectionCompleteness`, `formatScore`, `keywordPlacement`, `missingRequired`, `missingPreferred`.

The new code provides `calculateATSScore(ATSScoringInput)` and `calculateATSScoreWithEmbeddings(...)`. Old field names are preserved in addition to the new ones:

```ts
// ── Backward compatibility ──
// TypeScript interfaces cannot have getters. During implementation,
// simply duplicate the field values at construction time:
//
//   return {
//     keywordRelevance: Math.round(keywordRelevance * 100),
//     keywordMatch: Math.round(keywordRelevance * 100),  // legacy alias
//     preferredRelevance: Math.round(preferredRelevance * 100),
//     preferredMatch: Math.round(preferredRelevance * 100), // legacy alias
//     ...
//   };
//
// Old consumers calling atsScore.keywordMatch continue working.
// New consumers use atsScore.keywordRelevance.

// Legacy aliases (computed from new fields, not stored)
/** @deprecated Use keywordRelevance */
export type ATSScoreLegacy = ATSScore & {
  keywordMatch: number;
  preferredMatch: number;
};
```

> **Implementation note:** The plan's `get` syntax was illustrative shorthand. In the actual TypeScript code, duplicate the legacy field values at the return point — no getters needed, zero runtime cost, fully compatible. Alternatively, if you need computed-on-access behavior, wrap in a class instead of a plain interface.

### Rollout Strategy

1. **Week 1:** Ship Phase 1-2. Old `atsScore.overall` still works. New dimensions start appearing in `componentBreakdown`.
2. **Week 2:** Ship Phase 3. Semantic scoring adds ~15 points to relevant matches. Monitor for score inflation.
3. **Week 3:** Ship Phase 4-5. Scores start appearing in UI and DB. Monitor user feedback.
4. **Week 4+:** Iterate on weights based on telemetry data from Phase 5.

---

## 8. Test Strategy

> **Minimum viable test plan per phase.** Not optional — at least these tests must pass before considering a phase complete.

### Phase 1 Tests

```ts
// resume-pipeline/src/__tests__/ats-scorer.test.ts

describe('keywordExistsInText', () => {
  it('matches exact skill at word boundary', () => {
    expect(keywordExistsInText('Java', 'I know Java and Python')).toBe(true);
  });
  it('does NOT match "Java" inside "JavaScript"', () => {
    expect(keywordExistsInText('Java', 'I know JavaScript')).toBe(false);
  });
  it('does NOT match "C" inside "C++"', () => {
    expect(keywordExistsInText('C', 'Used C++ for development')).toBe(false);
  });
  it('does NOT match "Go" inside "MongoDB" or "Django"', () => {
    expect(keywordExistsInText('Go', 'Used MongoDB and Django')).toBe(false);
  });
  it('matches "C++" as standalone skill', () => {
    expect(keywordExistsInText('C++', 'Used C++ for systems programming')).toBe(true);
  });
  it('matches "CI/CD" with slash', () => {
    expect(keywordExistsInText('CI/CD', 'Set up CI/CD pipeline')).toBe(true);
  });
});
```

```ts
// resume-pipeline/src/__tests__/ats-scorer.test.ts

describe('calculateDensityPenalty', () => {
  it('returns 1.0 for normal keyword usage', () => {
    const text = 'Python developer with Python skills. Also knows Java.';
    expect(calculateDensityPenalty(['Python', 'Java'], text)).toBe(1.0);
  });
  it('penalizes heavy keyword stuffing', () => {
    const text = 'Python Python Python Python Python Python Python ' + 'word '.repeat(100);
    expect(calculateDensityPenalty(['Python'], text)).toBeLessThan(0.8);
  });
  it('is relative to document length (short doc with few repeats = okay)', () => {
    const text = 'Python Python Python ' + 'word '.repeat(10);
    expect(calculateDensityPenalty(['Python'], text)).toBe(1.0);
  });
});
```

### Phase 2 Tests

```ts
describe('calculateATSScore (pure function)', () => {
  it('returns all dimensions rounded 0-100', () => { /* snapshot test */ });
  it('score is never NaN or negative', () => { /* boundary test */ });
  it('missing all skills = low score but not zero', () => { /* regression */ });
  it('perfect match = high score but not necessarily 100', () => { /* calibration */ });
  it('density penalty reduces score when keywords stuffed', () => { /* integration */ });
  it('format validation failure degrades gracefully', () => { /* error boundary */ });
  it('Phase 2 weights cap at ~100 (no overflow)', () => { /* no 110/100 scores */ });
});
```

### Phase 3 Integration Test

```ts
describe('calculateATSScoreWithEmbeddings', () => {
  it('returns semantic similarity > 0 for related text', async () => {
    const score = await calculateATSScoreWithEmbeddings(
      sections, jd, parsed, profiles,
      'Developer with React experience...',
      'Looking for a frontend engineer with JavaScript framework expertise'
    );
    expect(score.semanticSimilarity).toBeGreaterThan(0);
    expect(score.features.semanticScoring).toBe(true);
  });
  it('handles embedding model unavailable gracefully', async () => {
    // Mock getEmbedder to return null
    const score = await calculateATSScoreWithEmbeddings(...);
    expect(score.features.semanticScoring).toBe(false);
    expect(score.overall).toBeGreaterThan(0); // doesn't break
  });
});
```

### Phase 4 Integration Test (Backend)

```java
@Test
void shouldPersistAtsScoreOnGeneration() {
    // Generate resume, verify application.getAtsScore() != null
    // Verify scoreBreakdown JSON is parseable
}
```

### Bias Audit Test (Add after Phase 3)

```ts
describe('bias audit', () => {
  it('two identical resumes with different names score within 1 point', async () => {
    // PII stripping: embedding should receive same text regardless of name
    const resumeJohn = resumeBase.replace('{NAME}', 'John Smith');
    const resumeJamal = resumeBase.replace('{NAME}', 'Jamal Williams');
    const score1 = await score(resumeJohn, jd);
    const score2 = await score(resumeJamal, jd);
    expect(Math.abs(score1.overall - score2.overall)).toBeLessThanOrEqual(1);
  });
});
```

### Running Tests

Add to `resume-pipeline/package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

---

## 9. Effort Estimates

| Phase | Original Estimate | Revised Estimate | Notes |
|---|---|---|---|
| Phase 1 | 1-2 days | **2-3 days** | Regex edge cases + `stripAllLatex` implementation + testing |
| Phase 2 | 2-3 days | **2-3 days** | Mostly wiring, accurate |
| Phase 3 | 3-4 days | **4-5 days** | Package migration + model testing + chunking + cold-start + feature flag |
| Phase 4 | 2-3 days | **3-4 days** | Full-stack 3 services + SSE + frontend + JSONB type mapping |
| Phase 5 | 1 day | **1 day** | Accurate |
| Testing | 0 days | **2-3 days** | Unit tests + integration tests + bias audit |
| **Total** | **9-13 days** | **14-19 days** | Including testing |

---

## Notes

- **Embedding model download:** `@huggingface/transformers` downloads all-MiniLM-L6-v2 (~80MB) on first run. The server startup warmup (Phase 3.4) pre-loads it so the first request is not delayed.
- **Feature flag:** `ENABLE_SEMANTIC_SCORING=false` completely disables the embedding dependency. Set this in Docker or restricted network environments.
- **No API key needed:** The embedding model runs locally. No internet required after first download. Zero cost per call.
- **Backward compatibility:** The `ATSScore` interface expansion is additive. Old consumers that only read `atsScore.overall` will continue to work.
- **Rate limit resilience:** Embedding computation is CPU-bound (~50ms on modern CPUs). For high-volume use, consider request queuing.
- **Bias audit:** Per Wilson & Caliskan (2024), embedding-based matchers can be biased toward white male names. Concrete mitigations:
  1. **Strip all PII before embedding** — the `prepareTextForEmbedding` function uses only content text, never names
  2. **Run the fairness test** (Section 8) after Phase 3
  3. **Document the limitation** in user-facing UI when semantic scoring is enabled
- **ESCO/O*NET taxonomy integration:** Deferred to future phase. The dynamic variant map (Phase 1.3) provides good coverage for tech roles. Non-software roles (healthcare, finance, mechanical engineering) would benefit from taxonomy integration. Free option: [ESCO REST API](https://esco.ec.europa.eu/en/use-esco/statistical-data).
- **Education-level-match dimension:** ✅ IMPLEMENTED. A new dimension that compares JD education requirements against the resume's degree level via regex detection. Full plan at [`docs/appendix-d-education-level-match.md`](docs/appendix-d-education-level-match.md). 6 files touched, 4 points weight.

- **JD Parser improvement (Stage 2):** The jd-parser LLM step is non-deterministic. Full plan at [`docs/stage_2_plan.md`](docs/stage_2_plan.md). 5 changes across 3 files: (1) temperature=0 in llm-wrapper, (2) rewritten prompt with few-shot examples + `"""` delimiters, (3) deterministic post-processing via `augmentSkills()` + position/company sanity check, (4) export `PREDEFINED_VARIANTS`, (5) SOLID pipeline refactor into 3 composable stages (`LLMExtractionStage` → `DeterministicAugmentationStage` → `SanityCheckStage`). Backward compatible, zero API changes.

- **Gap Repair improvement (Stage 4.6):** Exhaustive JD extraction feeds 15-19 missing keywords to gap repair, causing keyword stuffing (4-6 keywords per bullet). Fix: cap repair to top-8 missing keywords + anti-stuffing LLM prompt instruction. Full plan at [`docs/stage_4.6_plan.md`](docs/stage_4.6_plan.md). 1 file, 2 changes.

---

- **ESCO taxonomy integration:** Free EU database of 15,000+ skills with hierarchical relationships (parent↔child). Reuses Phase 3's existing `all-MiniLM-L6-v2` model. Three-method strategy: deterministic synonym lookup (sub-ms), hierarchy traversal (broader/narrower), and embedding fallback. Follows SOLID: `ITaxonomyProvider` interface, `StaticTaxonomyProvider` + `TaxonomyService` composition, pluggable `taxonomyCoverage` dimension (3/100 weight). 9 files, zero API costs. See full plan at [`docs/appendix-f-taxonomy-integration.md`](docs/appendix-f-taxonomy-integration.md).
