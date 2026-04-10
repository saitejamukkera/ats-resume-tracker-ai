// src/schemas/summary.ts
// Zod schema for summary generation output.

import { z } from 'zod';

export const SummaryOutputSchema = z.object({
  summary: z.string().describe('3-4 line professional summary'),
});

export type SummaryOutput = z.infer<typeof SummaryOutputSchema>;
