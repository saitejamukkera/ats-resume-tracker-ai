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
import {
  extractMinYears,
  extractWorkAuthRequirement,
  extractRequiredCertifications,
} from "../validation/utils/jd-requirements.js";

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

  Example 3 — SKILL vs JOB ACTIVITY:
  JD: "You will write unit tests following TDD and containerize apps with
       Docker. Must have: 2+ years of Java, experience with Spring Boot."
  →
  "requiredSkills": ["Java", "Spring Boot"]      ← "2+ years" / "experience with" = prerequisite
  "preferredSkills": []
  "keyResponsibilities": [
    "Write unit tests following TDD",
    "Containerize applications with Docker"
  ]                                              ← "You will write/containerize" = job activity
  "keyPhrases": ["TDD", "Docker"]               ← mentioned in activities, not prerequisites
  Note: "TDD" and "Docker" appear within activity sentences ("write", "containerize").
  They are NOT framed as prerequisites — no "experience with," "proficiency in," or
  "N+ years" — so they go to keyPhrases, not requiredSkills. If the JD instead said
  "3+ years of Docker" or "experience with TDD," they would go to requiredSkills.

Key rules:
- "position": the exact job title. NEVER use the company name here.
  Extract from the first line or job title header.
- "company": the organization name. NEVER use the job title here.
- "jobId": requisition/job ID number if present, empty string if not found
- "location": "City, State" format, "Remote", or "Hybrid". No full addresses. "N/A" if not found.
- "requiredSkills": extract ONLY prerequisites — competencies the candidate
  must ALREADY POSSESS before starting this job. Identify them by linguistic
  framing in the JD. Look for phrases like "N+ years of," "proficiency in,"
  "experience with," "knowledge of," "strong understanding of," "required,"
  "must have," "demonstrated ability to." These are portable, transferable
  skills the candidate brings with them.
  Skills mentioned ONLY as job activities (what the candidate will DO on
  the job — sentences with "You will write...," "You will build...,"
  "contribute to...," "design and implement...," "working as part of...")
  go to keyResponsibilities, NOT requiredSkills. If a technology is
  named within an activity sentence but NOT framed as a prerequisite, put
  it in keyPhrases instead.
  CRITICAL: DECOMPOSE compound skill lists into individual entries.
  "Java, Go, Python, or Node.js" must be extracted as 4 separate skills:
  ["Java", "Go", "Python", "Node.js"]. Never combine multiple technologies
  into a single skills entry. Same for cloud platforms, databases, etc.
- "preferredSkills": skills the JD explicitly marks as OPTIONAL or bonus.
  These are still portable skills — just not required. Look for phrases
  like "nice to have," "bonus points," "a plus," "preferred," "familiarity
  with," "we value."
- "keyResponsibilities": the main duties and job activities the candidate
  will perform. These describe what they will DO on the job, not what they
  must already KNOW. Pull from "Responsibilities," "What You Will Be Doing,"
  "The Role," or similar sections.
- "experienceLevel": infer from years of experience, title, responsibilities
  - "entry": 0-2 years or associate/junior titles
  - "mid": 2-5 years or standard engineer titles
  - "senior": 5+ years or senior/staff/lead titles
- "educationLevel": the minimum education required by the JD
  - "none": no education requirement mentioned
  - "high-school", "associate", "bachelors", "masters", "phd" as appropriate
  - If the JD lists a degree in a preferred section, still extract it here
- "domainFocus": the primary technical domain (backend, frontend, fullstack, data, devops, mobile, etc.)
- "keyPhrases": exact phrases from the JD that the candidate should mirror
  in the resume. Include: (1) company-specific product/platform names,
  (2) domain/industry terminology, (3) technologies mentioned in
  responsibilities but not stated as prerequisites, (4) distinctive
  phrasing the company uses that shows cultural fit.
- "minYearsExperience": the minimum TOTAL years of professional experience
  the JD requires (e.g., "5+ years of software development" → 5). Use the
  overall experience requirement, not per-technology years. null if the JD
  states no explicit years requirement.
- "workAuthRequirement": quote the JD's work-authorization constraint if any
  (e.g., "must be authorized to work in the US without sponsorship",
  "requires active security clearance"). null if none stated.
- "certifications": certifications the JD REQUIRES the candidate to hold
  (e.g., "AWS Certified Solutions Architect required"). Certifications that
  are merely preferred or mentioned go to preferredSkills/keyPhrases, not here.

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
      jdAnalysis: JDAnalysisSchema.parse(result.object),
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

// ── Prerequisite Filter ──────────────────────────────────────────

/**
 * Filters extracted skills to only those the JD frames as prerequisites.
 * A skill qualifies if the JD text has prerequisite-language patterns
 * (e.g., "3+ years of," "proficiency in," "must have") within 150
 * characters before the skill's occurrence.
 *
 * Skills without prerequisite framing are returned separately so the
 * caller can move them to keyPhrases — they were mentioned in context
 * but the JD does not require them as prior knowledge.
 */
function filterToPrerequisites(
  skills: string[],
  jdText: string,
): { required: string[]; movedToKeyPhrases: string[] } {
  const PREREQ_PATTERNS = [
    /\d+\+?\s*years?\s+(?:of\s+)?/i,
    /proficiency\s+(?:in|with)/i,
    /experience[\s\S]{0,30}?(?:in|with|using)\b/i,
    /\bexperience\s+of\b/i,
    /hands-on\s+(?:experience|knowledge)/i,
    /expertise\s+(?:in|with)/i,
    /knowledge\s+of/i,
    /understanding\s+of/i,
    /must\s+have/i,
    /is\s+required/i,
    /demonstrated\s+(?:ability|experience)/i,
    /strong\s+(?:background|understanding)\s+(?:in|of)/i,
    /familiarity\s+with/i,
    /working\s+knowledge\s+of/i,
  ];

  const required: string[] = [];
  const movedToKeyPhrases: string[] = [];

  for (const skill of skills) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    let match: RegExpExecArray | null;
    let isPrerequisite = false;

    while ((match = regex.exec(jdText)) !== null) {
      const contextBefore = jdText.substring(
        Math.max(0, match.index - 150),
        match.index,
      );
      if (PREREQ_PATTERNS.some((p) => p.test(contextBefore))) {
        isPrerequisite = true;
        break;
      }
    }

    if (isPrerequisite) {
      required.push(skill);
    } else {
      movedToKeyPhrases.push(skill);
    }
  }

  return { required, movedToKeyPhrases };
}

class DeterministicAugmentationStage implements IJdParseStage {
  async execute(ctx: JdParseContext): Promise<JdParseContext> {
    const analysis = ctx.jdAnalysis;
    const jdText = ctx.jobDescription;

    const augmentedRequired = augmentSkillList(analysis.requiredSkills, jdText);
    const augmentedPreferred = augmentSkillList(analysis.preferredSkills, jdText);

    const { required, movedToKeyPhrases } = filterToPrerequisites(
      augmentedRequired,
      jdText,
    );

    // Hard-requirement backstop: the LLM is the primary source; regexes fill
    // anything it missed so the knockout evaluator never skips a requirement.
    const minYears =
      analysis.minYearsExperience ?? extractMinYears(jdText);
    const workAuth =
      analysis.workAuthRequirement ?? extractWorkAuthRequirement(jdText);
    const certs =
      analysis.certifications.length > 0
        ? analysis.certifications
        : extractRequiredCertifications(jdText);

    return {
      ...ctx,
      jdAnalysis: {
        ...analysis,
        requiredSkills: required,
        preferredSkills: augmentedPreferred,
        keyPhrases: [...analysis.keyPhrases, ...movedToKeyPhrases],
        minYearsExperience: minYears,
        workAuthRequirement: workAuth,
        certifications: certs,
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
        minYearsExperience: analysis.minYearsExperience ?? null,
        workAuthRequirement: analysis.workAuthRequirement ?? null,
        certifications: analysis.certifications ?? [],
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
