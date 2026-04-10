// src/stages/jd-parser.ts
// Stage 1: Parse job description → structured JSON.
// Single-task prompt with Zod schema enforcement.

import { models } from "../config/models.js";
import { JDAnalysisSchema, type JDAnalysis } from "../schemas/jd-analysis.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { SnapshotStore } from "../observability/debug.js";

export async function parseJD(
  jobDescription: string,
  snapshotStore?: SnapshotStore,
): Promise<{
  jdAnalysis: JDAnalysis;
  inputTokens: number;
  outputTokens: number;
}> {
  const prompt = `You are a job description parser. Extract structured data from this JD.
Return ONLY valid JSON matching the schema. No markdown, no explanation.

Key rules:
- "position": the exact job title (e.g., "Software Engineer II", "Senior Backend Developer")
- "company": the company name
- "jobId": requisition/job ID number if present, empty string if not found
- "location": "City, State" format, "Remote", or "Hybrid". No full addresses. "N/A" if not found.
- "requiredSkills": extract ALL technical skills explicitly required (languages, frameworks, tools, platforms)
- "preferredSkills": nice-to-have skills mentioned as preferred/bonus
- "keyResponsibilities": the main duties/responsibilities listed
- "experienceLevel": infer from years of experience, title, responsibilities
  - "entry": 0-2 years or associate/junior titles
  - "mid": 2-5 years or standard engineer titles
  - "senior": 5+ years or senior/staff/lead titles
- "domainFocus": the primary technical domain (backend, frontend, fullstack, data, devops, mobile, etc.)
- "keyPhrases": exact phrases from the JD that would be good to mirror in a resume

JOB DESCRIPTION:
${jobDescription}`;

  const result = await callLLM({
    model: models.extraction,
    schema: JDAnalysisSchema,
    prompt,
    maxRetries: 2,
    stage: "jd-parser",
    snapshotStore,
  });

  const obj = result.object;
  return {
    jdAnalysis: {
      ...obj,
      jobId: obj.jobId ?? "",
      location: obj.location ?? "N/A",
    },
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
