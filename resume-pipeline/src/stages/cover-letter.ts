// src/stages/cover-letter.ts
// Cover letter generator — focused single LLM call.

import { models } from "../config/models.js";
import { CoverLetterOutputSchema } from "../schemas/cover-letter.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { SnapshotStore } from "../observability/debug.js";

export async function generateCoverLetter(
  jd: JDAnalysis,
  userInfo: string,
  masterSubjects: string,
  currentDate: string,
  snapshotStore?: SnapshotStore,
): Promise<{ coverLetter: string; inputTokens: number; outputTokens: number }> {
  const prompt = `Write a cover letter for this application. It should sound like a real person wrote it, not ChatGPT.

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

WRITING STYLE — READ THIS CAREFULLY:
- Write like you're talking to a smart person, not a form letter
- SHORT sentences mixed with longer ones. Not every sentence should be 25 words.
- Be SPECIFIC. "I built a caching layer that cut page loads from 2.3s to 400ms" beats "I have extensive experience optimizing application performance"
- Show personality. One sentence about WHY this company or team excites you, specifically.
- Do NOT use the phrase "I am excited to apply" or "I am writing to express my interest" — find a better opener
- Do NOT use "cross-functional", "stakeholders", "deliverables", "align", "synergy", or "leverage"
- Do NOT use "I believe I would be a valuable asset" or any variation of it
- Do NOT use em dashes (—) or en dashes (–) anywhere. Use commas, semicolons, or periods instead.
- Do NOT use excessive hyphens (-) for parenthetical asides. Restructure the sentence instead.
- Keep paragraphs to 3-4 sentences max. Recruiters skim.
- ONE page maximum. 4 paragraphs is ideal.
- No bullet points. Full, flowing paragraphs only.
- If master's subjects provided, weave in 1-2 relevant ones naturally

STRUCTURE:
1. Opening (2-3 sentences): Hook with something specific about the role or company. Mention the position.
2. Experience (4-6 sentences): Pick 2-3 past experiences that directly map to JD requirements. Use specific metrics.
3. Technical fit (3-4 sentences): Show you know their stack. Reference their actual technologies from the JD.
4. Close (2-3 sentences): Brief, confident, forward-looking. Not groveling.

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
[4 paragraphs as described above]

Thank you for your time and consideration.

Sincerely,
[Full Name]
[Portfolio/GitHub URLs if available]

Return the full cover letter text.`;

  const result = await callLLM({
    model: models.generation,
    schema: CoverLetterOutputSchema,
    prompt,
    stage: "cover-letter",
    snapshotStore,
  });

  // Post-processing: strip em/en dashes that LLMs love to insert despite instructions
  let coverLetter = result.object.coverLetter;
  coverLetter = coverLetter
    .replace(/\s*—\s*/g, ", ")     // em dash → comma
    .replace(/\s*–\s*/g, ", ")     // en dash → comma
    .replace(/\s+-\s+/g, ", ");    // spaced hyphen used as dash → comma

  return {
    coverLetter,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
