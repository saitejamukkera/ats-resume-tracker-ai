# Stage 2: JD Parser Improvement Plan

This plan details the implementation of deterministic, high-accuracy, and robust job description parsing for the ATS resume tracker.

## Objectives
1. **Reduce Non-Determinism**: Prevent JD parser skill extraction from varying between runs for the same JD.
2. **Preserve Category Boundaries**: Prevent "category collapse" where required skills and preferred skills merge.
3. **Control Noise**: Remove over-aggressive generic acronym scanners that pull in location codes, Roman numerals, and capitalized section headers.
4. **Ensure Robust Field Extraction**: Avoid fragile regex-based company name swapping heuristics that break on titles like "Oracle DBA". Rely on few-shot prompting instead.
5. **Maintain Telemetry**: Ensure token counts from LLM extraction are accurately reported to the telemetry system.
6. **Follow SOLID Principles**: Refactor `parseJD` into a pipeline of three clean, testable, and composable stages.

---

## Proposed Changes

### Component 1: LLM Wrapper (Observability)
#### [MODIFY] [llm-wrapper.ts](file:///c:/Users/mukke/Desktop/Job-Resume-Tracker/resume-pipeline/src/observability/llm-wrapper.ts)
- Add an optional `temperature` parameter to the options interface for `callLLM` and `callLLMText`.
- Pass this `temperature` parameter directly to the Vercel AI SDK `generateObject` / `generateText` functions.
- If not provided, it can be left undefined (which uses the SDK/model default) or default to `0` for structured parsing.

### Component 2: Skill Variants Configuration
#### [MODIFY] [skill-variants.ts](file:///c:/Users/mukke/Desktop/Job-Resume-Tracker/resume-pipeline/src/validation/skill-variants.ts)
- Export `PREDEFINED_VARIANTS` so that it can be accessed by the deterministic post-processing layer.
- Add and refine skill variant mappings if necessary to improve accuracy.

### Component 3: JD Parser Pipeline
#### [MODIFY] [jd-parser.ts](file:///c:/Users/mukke/Desktop/Job-Resume-Tracker/resume-pipeline/src/stages/jd-parser.ts)
Refactor the parsing logic into a stage-based pipeline:
```ts
export interface IJdParseStage {
  execute(ctx: JdParseContext): Promise<JdParseContext>;
}
```
Define a context that tracks the raw job description, the current state of the parsed analysis, and consumed tokens:
```ts
export interface JdParseContext {
  jobDescription: string;
  jdAnalysis: JDAnalysis;
  inputTokens: number;
  outputTokens: number;
}
```

Implement three distinct stages:
1. **`LLMExtractionStage`**:
   - Updates the prompt to include clear guidelines, wrapping the JD text in triple double-quotes `"""` for clear delimitation.
   - Refines few-shot examples illustrating correct parsing of position/company (e.g. `"Software Engineer - JAVA at Honeywell"`) and proper education level extraction.
   - Calls `callLLM` with `temperature: 0` to enforce deterministic extraction.
   - Captures and records `inputTokens` and `outputTokens`.

2. **`DeterministicAugmentationStage`**:
   - Takes the extracted `requiredSkills` and `preferredSkills` and resolves them against canonical skills and synonyms using `skill-variants.ts`.
   - **Prevents category collapse**:
     - Keeps lists separate.
     - For skills extracted by the LLM as required, it expands them with all their variants in a `requiredSet`.
     - For skills extracted by the LLM as preferred, it expands them with all their variants in a `preferredSet`.
     - Scans the raw job description text for any canonical skill in `PREDEFINED_VARIANTS`. If a variant is found in the text and was *not* extracted by the LLM in either list, it defaults to adding it to the `requiredSet` as a fallback, but *only* if it is not already in the `preferredSet`.
   - **No generic acronym matching**: Uses strictly the controlled vocabulary from `PREDEFINED_VARIANTS`. No arbitrary `\b[A-Z]{2,}\b` pattern matching.

3. **`SanityCheckStage`**:
   - Ensures correct defaults are set for all fields (`jobId`, `location`, `educationLevel`).
   - Ensures no company name swapping is performed via fragile regex matches. It relies on the few-shot prompting in Stage 1 to separate company and job title fields correctly.

---

## Verification Plan

### Automated Verification
- Verify that `parseJD` builds and runs correctly in the pipeline runner.
- Create tests or execute the pipeline with sample JDs (e.g., Honeywell's vague JD) to check if:
  1. No category collapse occurs.
  2. Tokens are tracked correctly (`inputTokens > 0` and `outputTokens > 0`).
  3. Skill lists are consistent across multiple runs.