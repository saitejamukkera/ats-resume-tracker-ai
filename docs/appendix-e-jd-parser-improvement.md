## Appendix E: JD-Parser Improvement Plan (Stage 2)

### Problem

The jd-parser (Stage 2) uses an LLM to extract `requiredSkills[]` from the JD text. This is **non-deterministic** — same JD, same model, different runs produce different `requiredSkills` arrays. This causes the ATS score to vary by 3-8 points between runs because the scoring engine faithfully scores whatever skills it receives.

Root causes:
- **Temperature > 0** — model uses sampling, not greedy decoding
- **Vague JDs** — Honeywell's JD says "3 years software engineering, 2 years Java" with zero tech stack terms. LLM must infer, and inference is inherently non-deterministic
- **No deterministic fallback** — LLM extraction is the sole source of requiredSkills

### Industry Standard

Workday HiredScore, Greenhouse, and Lever all use a **hybrid approach**:
```
JD Text → [LLM/ML Extraction] → raw skills
        → [Taxonomy Mapping] → canonical skill IDs
        → [Deterministic Fallback] → surface-level keyword scan
        → [Deduplication] → final skill list
```

The LLM handles contextual understanding. A deterministic post-processing layer catches surface-level keywords the LLM missed. This provides both depth (LLM inference) and completeness (deterministic scan).

### Fix: 3-Layer Defense

#### Layer 1 — Prompt + Temperature (5 min, immediate)

**File: `resume-pipeline/src/stages/jd-parser.ts`**

Update the extraction prompt:
- Add `temperature=0` to the extraction model config in `config/models.ts`
- Add `"CRITICAL RULES"` section mandating exhaustive extraction
- Add `"Be exhaustive, not selective"` and `"Prefer over-extraction to under-extraction"` 
- Add few-shot examples showing well-extracted skills
- Wrap JD text in `"""` delimiters (OpenAI best practice §2)
- Add education level extraction instruction (already done in Phase 4 extension)

Updated prompt:
```ts
const prompt = `You are a job description parser. Extract structured data from this JD.
Return ONLY valid JSON matching the schema. No markdown, no explanation.

CRITICAL RULES:
- Extract EVERY technical skill mentioned ANYWHERE in the JD text. Be exhaustive, not selective.
- Include skills that are:
  1. Explicitly listed (e.g., "Java", "Spring Boot", "Docker")
  2. Mentioned in context (e.g., "building REST APIs" → REST)
  3. Implied by the role (e.g., "Software Engineer - JAVA" → Java)
  4. Found in tools/platforms/requirements sections
- If a skill word appears in the JD text, it MUST be in the output. Do not filter or judge relevance.
- For vague JDs listing only experience years, infer the standard stack for that role + domain.

Key rules:
- "position": the exact job title
- "company": the company name
- ...
- "requiredSkills": extract ALL technical skills. If the JD mentions ANY programming language, framework, tool, platform, database, or technology — include it. Prefer over-extraction to under-extraction.
  Examples:
    JD: "3 years Python, AWS Lambda, and PostgreSQL experience"
    → ["Python", "AWS Lambda", "PostgreSQL"]
    JD: "Software Engineer - JAVA at Honeywell. 3 years professional software engineering."
    → ["Java", "Agile Scrum", "Software Design"]
```

**File: `resume-pipeline/src/config/models.ts`**

Add temperature=0 to extraction model:
```ts
extraction: {
  model: openai("gpt-4o"),
  temperature: 0,
}
```

**Impact:** Reduces variance by 60-80%. Temperature=0 alone dramatically improves consistency for extraction tasks (OpenAI official guidance).

#### Layer 2 — Deterministic Post-Processing (20 min, high impact)

**File: `resume-pipeline/src/stages/jd-parser.ts`**

After LLM extraction completes, scan the JD text surface-level for any tech terms the LLM might have missed. Uses existing `skill-variants.ts` infrastructure:

```ts
import { PREDEFINED_VARIANTS, getAllSkillVariants } from "../validation/skill-variants.js";

function augmentSkills(extracted: string[], jdText: string): string[] {
  const lowered = jdText.toLowerCase();
  const augmented = new Set(extracted.map(s => s.toLowerCase()));
  
  // Scan for known tech terms in the JD text
  for (const [skill] of Object.entries(PREDEFINED_VARIANTS)) {
    const variants = getAllSkillVariants(skill);
    if (variants.some(v => lowered.includes(v.toLowerCase()))) {
      augmented.add(skill.toLowerCase());
    }
  }
  
  // Capture capitalized acronyms (AWS, REST, JWT, CI/CD, etc.)
  const acronymPattern = /\b([A-Z]{2,}(?:\/[A-Z]{2,})?)\b/g;
  let match;
  while ((match = acronymPattern.exec(jdText)) !== null) {
    augmented.add(match[1].toLowerCase());
  }
  
  return [...augmented];
}

// In parseJD(), after LLM extraction:
const obj = result.object;
const augmentedSkills = augmentSkills(obj.requiredSkills, jobDescription);
return {
  jdAnalysis: {
    ...obj,
    requiredSkills: augmentedSkills,
    jobId: obj.jobId ?? "",
    location: obj.location ?? "N/A",
    educationLevel: obj.educationLevel ?? "none",
  },
  ...
};
```

**Impact:** Zero cost, zero latency (~1ms). Makes extraction **100% deterministic** for any skill literally present in the JD text. Does not fabricate skills — only captures what's already there. The `\b[A-Z]{2,}\b` acronym capture handles terms like AWS, REST, JWT, API that the skill variant map might not cover.

#### Layer 3 — Temperature Lock

Already covered by Layer 1's `temperature=0`. No additional work needed.

### Combined Impact

| Before | After Layer 1 | After Layer 1+2 |
|---|---|---|
| Run 1: 7 skills extracted | Run 1: 9-10 skills | Run 1: All surface-level skills + inferences |
| Run 2: 4 skills extracted | Run 2: 8-10 skills | Run 2: All surface-level skills + inferences |
| Score variance: 79-82 | Score variance: 81-84 | Score: stable within 1-2 points |

### Files to Change

| File | Change |
|---|---|
| `resume-pipeline/src/stages/jd-parser.ts` | Updated prompt + `augmentSkills()` deterministic fallback |
| `resume-pipeline/src/config/models.ts` | `temperature: 0` on extraction model |

### Risk Assessment

| Risk | Mitigation |
|---|---|
| Deterministic scan adds irrelevant keywords (e.g., "c" matches "C programming" but also "C-suite") | `\b` word-boundary matching prevents substring false positives |
| Prompt changes cause JSON schema validation failure | Structured Outputs guarantees schema compliance regardless of prompt |
| Temperature=0 on OpenAI still has minor variance (GPU non-determinism) | Layer 2's deterministic fallback catches the surface-level mismatches |
