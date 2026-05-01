// src/stages/keyword-extractor.ts
// Post-generation stage: LLM identifies exact phrases in resume text to bold.
// Runs AFTER section generation, BEFORE LaTeX assembly.
// Uses the fast/cheap model since it's a simple extraction task.

import { z } from "zod";
import { models as defaultModels } from "../config/models.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { LanguageModel } from "ai";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { GeneratedSections } from "../schemas/pipeline.js";
import type { SnapshotStore } from "../observability/debug.js";

const KeywordExtractionSchema = z.object({
  boldPhrases: z
    .array(z.string())
    .describe(
      "Exact phrases from the resume text that should be bolded for ATS emphasis",
    ),
});

/**
 * Scans generated resume sections and identifies exact phrases to bold.
 * Returns phrases that appear in BOTH the resume AND are relevant to the JD.
 */
export async function extractBoldKeywords(
  sections: GeneratedSections,
  jd: JDAnalysis,
  snapshotStore?: SnapshotStore,
  models?: Record<string, LanguageModel>,
): Promise<{
  boldPhrases: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  const mdl = models ?? defaultModels;
  // Collect all resume text for the LLM to scan
  const resumeText = [
    `SUMMARY: ${sections.summary}`,
    ...sections.experience.map(
      (r, i) =>
        `ROLE ${i + 1} (${r.roleTitle} at ${r.company}):\n${r.bullets.map((b, j) => `  ${j + 1}. ${b}`).join("\n")}`,
    ),
  ].join("\n\n");

  const prompt = `You are an ATS resume optimizer. Given the resume text and job description context below, identify EXACT phrases from the resume that should be bolded for maximum ATS impact.

RESUME TEXT:
${resumeText}

JOB DESCRIPTION CONTEXT:
- Position: ${jd.position} at ${jd.company}
- Required Skills: ${jd.requiredSkills.join(", ")}
- Preferred Skills: ${jd.preferredSkills.join(", ")}
- Key Phrases: ${jd.keyPhrases.join(", ")}
- Key Responsibilities: ${jd.keyResponsibilities.slice(0, 5).join("; ")}

RULES:
- Return ONLY phrases that appear EXACTLY in the resume text above (case-insensitive match is fine)
- Include: technology names (Java, Spring Boot, AWS, Redis, Kafka, PostgreSQL, etc.)
- Include: technical concepts that match the JD (microservices, distributed systems, API Gateway, REST, CI/CD, etc.)
- Include: methodologies and practices mentioned in both resume and JD (Agile, event sourcing, idempotency, circuit breakers, etc.)
- Include: cloud services and tools (Amazon SQS, OAuth2, JWT, Docker, Kubernetes, etc.)
- Include multi-word technical terms (e.g. "Spring Boot", "API Gateway", "distributed tracing", "circuit breakers")
- Do NOT include generic words (built, maintained, reduced, improved, etc.)
- Do NOT include metrics/numbers
- Do NOT include company names or role titles
- Aim for 15-40 phrases total
- Each phrase should be 1-4 words`;

  const result = await callLLM({
    model: mdl.extraction,
    schema: KeywordExtractionSchema,
    prompt,
    stage: "keyword-extractor",
    snapshotStore,
  });

  console.log(
    `[keyword-extractor] Found ${result.object.boldPhrases.length} bold phrases`,
  );

  return {
    boldPhrases: result.object.boldPhrases,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
