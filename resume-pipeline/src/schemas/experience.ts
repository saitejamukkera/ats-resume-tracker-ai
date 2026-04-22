// src/schemas/experience.ts
// Zod schemas for experience bullet generation output.

import { z } from 'zod';

export const ExperienceBulletSchema = z.object({
  text: z.string().describe('The full bullet point text'),
  technologies: z.array(z.string()).describe('Technologies/tools mentioned in this bullet'),
});

export const RoleExperienceSchema = z.object({
  roleTitle: z.string(),
  company: z.string(),
  bullets: z.array(ExperienceBulletSchema),
});

export const ExperienceOutputSchema = z.object({
  roles: z.array(RoleExperienceSchema),
});

export type RoleExperience = z.infer<typeof RoleExperienceSchema>;
export type ExperienceOutput = z.infer<typeof ExperienceOutputSchema>;
