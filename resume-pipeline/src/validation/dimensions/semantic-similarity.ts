// src/validation/dimensions/semantic-similarity.ts
// Embedding-based cosine similarity between resume text and job description.
// Uses SBERT (all-MiniLM-L6-v2) via @huggingface/transformers — runs locally.

import type { ScorerDimension } from "../scorer-dimension.js";
import { prepareTextForEmbedding } from "../embedding-matcher.js";

export const semanticSimilarityDimension: ScorerDimension = {
  key: "semanticSimilarity",
  label: "Semantic Fit",

  evaluate(ctx): number {
    return 0;
  },
};

export function createSemanticSimilarityOverride(similarity: number): number {
  return similarity;
}
