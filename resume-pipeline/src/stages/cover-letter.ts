// src/stages/cover-letter.ts
// Cover letter generator — focused single LLM call.

import { models as defaultModels } from "../config/models.js";
import { CoverLetterOutputSchema } from "../schemas/cover-letter.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { LanguageModel } from "ai";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { SnapshotStore } from "../observability/debug.js";

export async function generateCoverLetter(
  jd: JDAnalysis,
  userInfo: string,
  masterSubjects: string,
  currentDate: string,
  snapshotStore?: SnapshotStore,
  models?: Record<string, LanguageModel>,
): Promise<{ coverLetter: string; inputTokens: number; outputTokens: number }> {
  const mdl = models ?? defaultModels;
  const prompt = `Generate a JD-specific cover letter for this application.

ROLE: ${jd.position} at ${jd.company}
LOCATION: ${jd.location}
JOB ID: ${jd.jobId || "Not provided"}

CANDIDATE INFO:
${userInfo || "Not provided"}

MASTER'S SUBJECTS (incorporate 1-2 relevant ones if provided):
${masterSubjects || "Not provided"}

JD REQUIREMENTS:
- Required Skills: ${jd.requiredSkills.join(", ")}
- Key Responsibilities: ${jd.keyResponsibilities.join("; ")}
- Domain: ${jd.domainFocus}

COVER LETTER RULES:
- Personal, concise, recruiter-friendly
- ONE page maximum
- Reference the role's technical focus
- Explain why this team/company is interesting
- Map past experiences to JD requirements
- No generic language or templates
- Do NOT use bullet points — write in full, flowing paragraphs
- If master's subjects provided, naturally incorporate 1-2 relevant subjects

FORMAT (strict):
[Full Name]
[Address]
[Phone]
[Email]
[LinkedIn URL if available]

${currentDate}
Hiring Manager
${jd.company}

Re: Application for ${jd.position}${jd.jobId ? ` (Job ID: ${jd.jobId})` : ""}

Dear Hiring Manager,
[Opening paragraph: Express interest, mention degree/GPA if provided, highlight years of experience and key technologies]
[Middle paragraphs: Detail specific past experiences matching JD requirements with metrics]
[Technical paragraph: Weave technical skills into a cohesive paragraph — NO bullet points]
[Closing paragraph: Express enthusiasm for the company, confidence in contributing]

Thank you for your time and consideration.

Sincerely,
[Full Name]
[Portfolio/GitHub URLs if available]

Return the full cover letter text.`;

  const result = await callLLM({
    model: mdl.generation,
    schema: CoverLetterOutputSchema,
    prompt,
    stage: "cover-letter",
    snapshotStore,
  });

  return {
    coverLetter: result.object.coverLetter,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
