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
  educationLevel: z.enum(['none', 'high-school', 'associate', 'bachelors', 'masters', 'phd']).describe('Minimum education required by the JD. Use "none" if not specified.'),
  domainFocus: z.string().describe('Primary domain: backend, frontend, fullstack, data, devops, etc.'),
  keyPhrases: z.array(z.string()).describe('Exact phrases from JD worth mirroring in the resume'),
  minYearsExperience: z.number().nullable().default(null).describe('Minimum total years of experience the JD requires, or null if not stated'),
  workAuthRequirement: z.string().nullable().default(null).describe('Work-authorization requirement quoted from the JD (e.g. "no visa sponsorship"), or null'),
  certifications: z.array(z.string()).default([]).describe('Certifications the JD explicitly requires (not merely mentions)'),
});

export type JDAnalysis = z.infer<typeof JDAnalysisSchema>;
