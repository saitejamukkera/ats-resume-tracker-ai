// src/schemas/cover-letter.ts
// Zod schema for cover letter generation output.

import { z } from 'zod';

export const CoverLetterOutputSchema = z.object({
  coverLetter: z.string().min(200).describe('Full cover letter text in plain paragraphs'),
});

export type CoverLetterOutput = z.infer<typeof CoverLetterOutputSchema>;
