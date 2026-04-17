// src/schemas/experience.ts
// Zod schemas for experience bullet generation output.

import { z } from 'zod';

/**
 * Tracks what the LLM added beyond what was in the original bullet brief.
 * Surfaced in the GenerationTrace so the user can review invented numbers
 * before submitting. All fields are nullable — `null` means nothing was
 * added in that category.
 */
export const InventionReportSchema = z.object({
  metric: z.string().nullable().describe(
    'If a metric was invented (not present in original), the invented phrase, e.g. "reduced by 25%" or "team of 4". Null if no metric was invented.',
  ),
  scope: z.string().nullable().describe(
    'If scope/team size/scale was invented, the invented phrase. Null otherwise.',
  ),
  context: z.string().nullable().describe(
    'If personal context was added to naturally ground the work, the phrase. Null otherwise.',
  ),
});

export const ExperienceBulletSchema = z.object({
  text: z.string().describe('The full bullet point text'),
  technologies: z.array(z.string()).describe('Technologies/tools mentioned in this bullet'),
  keywordsUsed: z
    .array(z.string())
    .describe('JD required/preferred skills that were woven into this bullet. Empty array if none.'),
  invented: InventionReportSchema.nullable().describe(
    'What was added beyond the original bullet brief. Null when this bullet was a pure rephrasing of existing facts.',
  ),
});

export const RoleExperienceSchema = z.object({
  roleTitle: z.string(),
  company: z.string(),
  bullets: z.array(ExperienceBulletSchema),
});

export const ExperienceOutputSchema = z.object({
  roles: z.array(RoleExperienceSchema),
});

export type InventionReport = z.infer<typeof InventionReportSchema>;
export type ExperienceBullet = z.infer<typeof ExperienceBulletSchema>;
export type RoleExperience = z.infer<typeof RoleExperienceSchema>;
export type ExperienceOutput = z.infer<typeof ExperienceOutputSchema>;
