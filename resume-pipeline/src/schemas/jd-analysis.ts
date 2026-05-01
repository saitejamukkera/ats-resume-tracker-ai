// src/schemas/jd-analysis.ts
// Zod schema for structured JD parsing output.

import { z } from 'zod';

export const JDAnalysisSchema = z.object({
  position: z.string().min(1).describe('Exact job title from the JD'),
  company: z.string().min(1).describe('Company name from the JD'),
  jobId: z.string().describe('Job ID/requisition number, or empty string if not found'),
  location: z.string().describe('City, State or Remote or Hybrid. No full addresses. Return N/A if not found.'),
  requiredSkills: z.array(z.string()).describe('Technical skills explicitly required'),
  preferredSkills: z.array(z.string()).describe('Nice-to-have skills'),
  keyResponsibilities: z.array(z.string()).describe('Core responsibilities from the JD'),
  experienceLevel: z.enum(['entry', 'mid', 'senior']).describe('Inferred experience level'),
  domainFocus: z.string().describe('Primary domain: backend, frontend, fullstack, data, devops, etc.'),
  keyPhrases: z.array(z.string()).describe('Exact phrases from JD worth mirroring in the resume'),
});

export type JDAnalysis = z.infer<typeof JDAnalysisSchema>;
