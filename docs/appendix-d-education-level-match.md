## Appendix D: Education-Level-Match Dimension (New)

### Motivation

During production testing, a resume with a "Master of Science, Computer Science" was penalized because the jd-parser did not extract "Master's degree preferred" from the JD's `preferredSkills` array. Education requirements are structural credentials, not technical skills — they belong in their own field with dedicated matching logic.

### Architecture

```
JD jd-parser prompt update → extracts "educationLevel" enum
                                     ↓
Resume ParsedResume.education string → regex degree detection
                                     ↓
    educationLevelMatchDimension.evaluate() → 0-1 score
```

### Files to Change (6)

| # | File | Change |
|---|---|---|
| 1 | `resume-pipeline/src/schemas/jd-analysis.ts` | Add `educationLevel` field to Zod schema |
| 2 | `resume-pipeline/src/stages/jd-parser.ts` | Add extraction rule in the system prompt |
| 3 | `resume-pipeline/src/validation/dimensions/education-level-match.ts` | **New** — degree detection + comparison |
| 4 | `resume-pipeline/src/validation/dimensions/index.ts` | Import, export, register in both dimension arrays |
| 5 | `resume-pipeline/src/validation/scorer-factory.ts` | Weight entry, label, variable, switch case, return field |
| 6 | `resume-pipeline/src/schemas/pipeline.ts` | Add `educationLevelMatch: number` to `ATSScore` |

### 1. Schema Update (`schemas/jd-analysis.ts`)

Add to the Zod schema:

```ts
educationLevel: z
  .enum(["none", "high-school", "associate", "bachelors", "masters", "phd"])
  .describe('Minimum education level required by the JD. Use "none" if not specified.'),
```

### 2. jd-parser Prompt Update (`stages/jd-parser.ts`)

Add to the system prompt:

```
- "educationLevel": the minimum education required by the JD
  - "none": no education requirement mentioned
  - "high-school", "associate", "bachelors", "masters", "phd" as appropriate
  - If the JD lists a degree in preferred/nice-to-have section, still extract it
```

### 3. New Dimension (`dimensions/education-level-match.ts`)

```ts
// src/validation/dimensions/education-level-match.ts
// Compares JD's minimum education requirement against the candidate's
// actual degree level detected from the resume education section.

import type { ScorerDimension } from "../scorer-dimension.js";

const DEGREE_PATTERNS: Array<{ level: string; pattern: RegExp }> = [
  { level: "phd",       pattern: /\bph\.?d\b|doctorate|doctoral/i },
  { level: "masters",   pattern: /\bm\.?s\.?\b|\bm\.?a\.?\b|master|mba/i },
  { level: "bachelors", pattern: /\bb\.?s\.?\b|\bb\.?a\.?\b|bachelor|undergrad/i },
  { level: "associate", pattern: /\ba\.?s\.?\b|\ba\.?a\.?\b|associate/i },
  { level: "high-school", pattern: /\bhigh\s+school\b|ged|secondary/i },
];

function detectResumeDegreeLevel(educationText: string): string | null {
  const text = educationText.toLowerCase();
  for (const entry of DEGREE_PATTERNS) {
    if (entry.pattern.test(text)) return entry.level;
  }
  return null;
}

const DEGREE_RANK: Record<string, number> = {
  none: 0, "high-school": 1, associate: 2, bachelors: 3, masters: 4, phd: 5,
};

export const educationLevelMatchDimension: ScorerDimension = {
  key: "educationLevelMatch",
  label: "Education Level",

  evaluate(ctx): number {
    const required = ctx.jd.educationLevel || "none";
    if (required === "none") return 1.0;

    const candidateDegree = detectResumeDegreeLevel(ctx.parsedResume.education);
    if (!candidateDegree) return 0.3;

    const requiredRank = DEGREE_RANK[required] ?? 0;
    const candidateRank = DEGREE_RANK[candidateDegree] ?? 0;

    if (candidateRank >= requiredRank) return 1.0;
    if (candidateRank === requiredRank - 1) return 0.7;
    return 0.3;
  },
};
```

### 4. Register in Dimension Registry (`dimensions/index.ts`)

```diff
+ import { educationLevelMatchDimension } from "./education-level-match.js";
+ export { educationLevelMatchDimension } from "./education-level-match.js";

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
+   educationLevelMatchDimension,
  ];
```

### 5. Weight Allocation (`scorer-factory.ts`)

Weight: **4 points** in both Phase 2 and Phase 3. To keep totals at 105, redistribute:

| Dimension | Phase 2 Before | Phase 2 After | Phase 3 Before | Phase 3 After |
|---|---|---|---|---|
| `experienceLevelMatch` | 5 | 4 | 5 | 4 |
| `keywordPlacement` | 8 | 7 | 7 | 6 |
| `educationLevelMatch` | — | **4** | — | **4** |
| **Total** | 105 | 105 | 105 | 105 |

Also add:
- Label: `"educationLevelMatch": "Education Level"`
- Variable: `let educationLevelMatch = 0;` in `composeFinalScore`
- Switch case + return field in the dimension loop

### 6. ATSScore Interface (`schemas/pipeline.ts`)

Add:
```ts
educationLevelMatch: number;
```

### Scoring Logic

| Scenario | Score |
|---|---|
| JD has no education requirement (`"none"`) | 1.0 (no penalty) |
| Candidate degree >= JD requirement (e.g., Masters for Bachelors role) | 1.0 |
| Candidate degree = one level below requirement | 0.7 |
| Candidate degree = two+ levels below | 0.3 |
| Candidate has no detectable degree in education section | 0.3 |

### Expected Impact

For the Honeywell test case:
- JD: "Master's degree preferred" → LLM extracts `educationLevel: "masters"`
- Resume: "Master of Science, Computer Science (GPA: 4.0)" → detected as `masters`
- Score: `masters >= masters` → 1.0 → **+4 points** (ATS 82 → ~86)

### Design Rationale

**Why not extract education as a `preferredSkill`?** The jd-parser prompt tells the LLM to extract "technical skills" — "Master's degree" doesn't fit. A dedicated field is:
- More reliable (deterministic regex vs LLM hallucination for degree names)
- Future-proof (works even if LLM extracts differently next time)
- Extensible (can add field-of-study matching later)
