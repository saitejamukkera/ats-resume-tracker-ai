// src/stages/jd-parser.ts
// Stage 1: Parse job description → structured JSON.
// 3-stage pipeline: LLM extraction → deterministic augmentation → sanity checks.

import { models as defaultModels } from "../config/models.js";
import { JDAnalysisSchema, type JDAnalysis } from "../schemas/jd-analysis.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { LanguageModel } from "ai";
import type { SnapshotStore } from "../observability/debug.js";
import { PREDEFINED_VARIANTS, getAllSkillVariants } from "../validation/skill-variants.js";
import { keywordExistsInText } from "../validation/utils/word-boundary.js";

// ── Pipeline Context ────────────────────────────────────────────

interface JdParseContext {
  jobDescription: string;
  jdAnalysis: JDAnalysis;
  inputTokens: number;
  outputTokens: number;
}

// ── Stage Interface ─────────────────────────────────────────────

interface IJdParseStage {
  execute(ctx: JdParseContext): Promise<JdParseContext>;
}

// ── Stage 1: LLM Extraction ─────────────────────────────────────

class LLMExtractionStage implements IJdParseStage {
  constructor(
    private models?: Record<string, LanguageModel>,
    private snapshotStore?: SnapshotStore,
  ) {}

  async execute(ctx: JdParseContext): Promise<JdParseContext> {
    const mdl = this.models ?? defaultModels;
    const prompt = `You are a job description parser. Extract structured data from this JD.
Return ONLY valid JSON matching the schema. No markdown, no explanation.

CRITICAL — PORTABLE SKILLS ONLY:
- requiredSkills and preferredSkills must contain ONLY portable, transferable
  technologies, tools, frameworks, languages, and methodologies.
- A "skill" is something a candidate would list on their LinkedIn skills section.
- Company-specific product names (e.g., "Apache Druid", "Imply Lumi", "Niagara
  Framework"), internal team/product areas (e.g., "Billing", "Identity"), and
  company jargon go into keyPhrases — NEVER into requiredSkills or preferredSkills.
- When the JD describes what the PRODUCT handles (e.g., "areas of Identity, APIs,
  and Billing"), extract the underlying transferable skill (e.g., "API development",
  "REST APIs") — not the domain-area word itself.

EXAMPLES:

  Example 1:
  JD: "Software Engineer - JAVA at Honeywell. Richmond, VA (Hybrid).
       Responsibilities: Design and implement next-gen Niagara software.
       Must Have: Bachelor's degree, 3 years experience, 2 years Java.
       We value: Master's degree, Agile, TDD, framework development."
  →
  "position": "Software Engineer - JAVA"
  "company": "Honeywell"
  "jobId": ""
  "location": "Richmond, VA"
  "requiredSkills": ["Java", "Software Design"]
  "preferredSkills": ["Agile", "Test Driven Design", "Framework Development"]
  "keyResponsibilities": ["Design and implement next-generation Niagara software"]
  "experienceLevel": "mid"
  "educationLevel": "bachelors"
  "domainFocus": "backend"
  "keyPhrases": ["Niagara Framework", "open systems", "globally distributed engineering team"]

  Example 2:
  JD: "Frontend Developer at Stripe. San Francisco (Remote).
       React, TypeScript, and Tailwind CSS required. Nice to have: GraphQL."
  →
  "position": "Frontend Developer"
  "company": "Stripe"
  "requiredSkills": ["React", "TypeScript", "Tailwind CSS"]
  "preferredSkills": ["GraphQL"]
  "experienceLevel": "mid"
  "educationLevel": "none"

Key rules:
- "position": the exact job title. NEVER use the company name here.
  Extract from the first line or job title header.
- "company": the organization name. NEVER use the job title here.
- "jobId": requisition/job ID number if present, empty string if not found
- "location": "City, State" format, "Remote", or "Hybrid". No full addresses. "N/A" if not found.
- "requiredSkills": extract ONLY portable technical skills from the Requirements
  section of the JD. Include languages, frameworks, tools, platforms, methodologies.
  Skip company-specific product names, internal systems, and business domain
  areas — those go in keyPhrases instead. Follow the Example 1 pattern:
  "Niagara Framework" → keyPhrases, not requiredSkills.
  CRITICAL: DECOMPOSE compound skill lists into individual entries.
  "Java, Go, Python, or Node.js" must be extracted as 4 separate skills:
  ["Java", "Go", "Python", "Node.js"]. Never combine multiple technologies
  into a single skills entry. Same for cloud platforms, databases, etc.
- "preferredSkills": nice-to-have skills mentioned as preferred/bonus.
  If the JD says "We value:", "Nice to have:", "Bonus:", extract from there.
- "keyResponsibilities": the main duties/responsibilities listed
- "experienceLevel": infer from years of experience, title, responsibilities
  - "entry": 0-2 years or associate/junior titles
  - "mid": 2-5 years or standard engineer titles
  - "senior": 5+ years or senior/staff/lead titles
- "educationLevel": the minimum education required by the JD
  - "none": no education requirement mentioned
  - "high-school", "associate", "bachelors", "masters", "phd" as appropriate
  - If the JD lists a degree in a preferred section, still extract it here
- "domainFocus": the primary technical domain (backend, frontend, fullstack, data, devops, mobile, etc.)
- "keyPhrases": exact phrases from the JD that would be good to mirror in a resume

JOB DESCRIPTION:
"""${ctx.jobDescription}"""`;

    const result = await callLLM({
      model: mdl.extraction,
      schema: JDAnalysisSchema,
      prompt,
      maxRetries: 2,
      temperature: 0,
      stage: "jd-parser",
      snapshotStore: this.snapshotStore,
    });

    return {
      ...ctx,
      jdAnalysis: result.object,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }
}

// ── Stage 2: Deterministic Augmentation ─────────────────────────

/**
 * Expands a skill list by resolving each extracted skill against PREDEFINED_VARIANTS
 * and scanning the JD text for its variants that the candidate might have.
 * Preserves category boundaries by only augmenting skills already categorized by the LLM.
 */
function augmentSkillList(
  extracted: string[],
  jdText: string,
): string[] {
  const loweredJd = jdText.toLowerCase();
  const result = new Set<string>();

  for (const skill of extracted) {
    const skillLower = skill.toLowerCase();
    result.add(skillLower); // Keep original extraction

    // Search for synonyms of the extracted skill in PREDEFINED_VARIANTS
    for (const [canonical, variants] of Object.entries(PREDEFINED_VARIANTS)) {
      const canonicalLower = canonical.toLowerCase();
      const allVars = getAllSkillVariants(canonical);

      if (skillLower === canonicalLower || allVars.some(v => v.toLowerCase() === skillLower)) {
        result.add(canonicalLower);
        
        // Add variants of this canonical skill if they are physically present in the JD text
        for (const variant of allVars) {
          if (keywordExistsInText(variant, loweredJd)) {
            result.add(variant.toLowerCase());
          }
        }
      }
    }
  }

  // Deduplicate: skills sharing the same canonical form count as one entry.
  // E.g., if both "ci/cd" and "ci cd" appear, they resolve to the same
  // PREDEFINED_VARIANTS canonical key → only the first is kept.
  const canonicalSeen = new Set<string>();
  const deduped: string[] = [];
  for (const skill of result) {
    const lower = skill.toLowerCase();

    let canonical = lower;
    for (const [key, variants] of Object.entries(PREDEFINED_VARIANTS)) {
      if (
        key === lower ||
        variants.some((v) => v.toLowerCase() === lower)
      ) {
        canonical = key;
        break;
      }
    }

    if (!canonicalSeen.has(canonical)) {
      canonicalSeen.add(canonical);
      deduped.push(canonical);
    }
  }

  return deduped;
}

class DeterministicAugmentationStage implements IJdParseStage {
  async execute(ctx: JdParseContext): Promise<JdParseContext> {
    const analysis = ctx.jdAnalysis;
    const jdText = ctx.jobDescription;

    return {
      ...ctx,
      jdAnalysis: {
        ...analysis,
        requiredSkills: augmentSkillList(analysis.requiredSkills, jdText),
        preferredSkills: augmentSkillList(analysis.preferredSkills, jdText),
      },
    };
  }
}

// ── Stage 3: Sanity Checks ──────────────────────────────────────

class SanityCheckStage implements IJdParseStage {
  async execute(ctx: JdParseContext): Promise<JdParseContext> {
    const analysis = ctx.jdAnalysis;

    return {
      ...ctx,
      jdAnalysis: {
        ...analysis,
        jobId: analysis.jobId ?? "",
        location: analysis.location ?? "N/A",
        educationLevel: analysis.educationLevel || "none",
      },
    };
  }
}

// ── Pipeline ────────────────────────────────────────────────────

class JdParserPipeline {
  constructor(private stages: IJdParseStage[]) {}

  async parse(ctx: JdParseContext): Promise<JdParseContext> {
    let current = ctx;
    for (const stage of this.stages) {
      current = await stage.execute(current);
    }
    return current;
  }
}

// ── Backward-Compatible Export ──────────────────────────────────

export async function parseJD(
  jobDescription: string,
  snapshotStore?: SnapshotStore,
  models?: Record<string, LanguageModel>,
): Promise<{
  jdAnalysis: JDAnalysis;
  inputTokens: number;
  outputTokens: number;
}> {
  const pipeline = new JdParserPipeline([
    new LLMExtractionStage(models, snapshotStore),
    new DeterministicAugmentationStage(),
    new SanityCheckStage(),
  ]);

  const ctx: JdParseContext = {
    jobDescription,
    jdAnalysis: {} as JDAnalysis,
    inputTokens: 0,
    outputTokens: 0,
  };

  const result = await pipeline.parse(ctx);

  return {
    jdAnalysis: result.jdAnalysis,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
