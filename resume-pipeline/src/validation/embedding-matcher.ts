// src/validation/embedding-matcher.ts
// SBERT semantic embedding similarity via @huggingface/transformers (v3).
// Runs locally — no API calls, no internet after first ~80MB model download.
// Feature-flagged via ENABLE_SEMANTIC_SCORING env var.

import { pipeline, env } from "@huggingface/transformers";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import type { GeneratedSections } from "../schemas/pipeline.js";
import { cosineSimilarity } from "./utils/cosine-similarity.js";

env.allowRemoteModels = true;
env.cacheDir = process.env.HF_HOME || null;

let embedder: FeatureExtractionPipeline | null = null;
let modelLoadAttempted = false;
let modelLoadFailed = false;

export async function getEmbedder(): Promise<FeatureExtractionPipeline | null> {
  if (embedder) return embedder;
  if (modelLoadFailed) return null;

  try {
    console.log(
      "[embedding-matcher] Loading Xenova/all-MiniLM-L6-v2 (first run downloads ~80MB)...",
    );
    embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
    modelLoadAttempted = true;
    console.log("[embedding-matcher] Model loaded successfully.");
    return embedder;
  } catch (error) {
    modelLoadFailed = true;
    modelLoadAttempted = true;
    console.warn(
      `[embedding-matcher] Model load failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export function prepareTextForEmbedding(sections: GeneratedSections): string {
  const parts: string[] = [];

  if (sections.summary.trim()) {
    parts.push(sections.summary);
  }

  if (sections.skills.trim()) {
    parts.push(sections.skills);
  }

  for (const role of sections.experience.slice(0, 3)) {
    const roleText = [role.roleTitle, ...role.bullets.slice(0, 2)]
      .filter(Boolean)
      .join(". ");
    if (roleText.trim()) {
      parts.push(roleText);
    }
  }

  const combined = parts.join(" ").trim();
  return combined.slice(0, 1200);
}

export async function computeResumeJDSimilarity(
  resumeText: string,
  jdText: string,
): Promise<number> {
  try {
    const model = await getEmbedder();
    if (!model) return 0;

    const jdChunk = jdText.slice(0, 1200);

    const [resumeOutput, jdOutput] = await Promise.all([
      model(resumeText, { pooling: "mean", normalize: true }),
      model(jdChunk, { pooling: "mean", normalize: true }),
    ]);

    return cosineSimilarity(resumeOutput.data, jdOutput.data);
  } catch (error) {
    console.warn(
      `[embedding-matcher] Similarity failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 0;
  }
}

export async function computeSkillSimilarity(
  skill: string,
  resumeText: string,
): Promise<number> {
  try {
    const model = await getEmbedder();
    if (!model) return 0;

    const [skillOutput, textOutput] = await Promise.all([
      model(skill, { pooling: "mean", normalize: true }),
      model(resumeText.slice(0, 1200), { pooling: "mean", normalize: true }),
    ]);

    return cosineSimilarity(skillOutput.data, textOutput.data);
  } catch (error) {
    console.warn(
      `[embedding-matcher] Skill similarity failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 0;
  }
}

/**
 * Split a skills-section / skill-dense string into individual skill tokens
 * suitable for token-vs-token semantic comparison.
 */
export function tokenizeSkills(text: string, max = 80): string[] {
  return [
    ...new Set(
      text
        .split(/[,;|/\n•·]+/)
        .map((t) => t.replace(/\s+/g, " ").trim().toLowerCase())
        .filter((t) => t.length >= 2 && t.length <= 40),
    ),
  ].slice(0, max);
}

/**
 * Max cosine similarity of each JD skill against the candidate's skill tokens.
 * Embeds candidate tokens once and reuses them across all JD skills — token-vs-token
 * comparison is where SBERT is strongest (e.g. "container orchestration" ≈ "kubernetes").
 * Returns skill → max cosine (0 when embeddings unavailable).
 */
export async function computeSkillSetSimilarity(
  jdSkills: string[],
  candidateSkills: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (jdSkills.length === 0 || candidateSkills.length === 0) return out;

  try {
    const model = await getEmbedder();
    if (!model) return out;

    const candVecs = await Promise.all(
      candidateSkills.map((s) =>
        model(s, { pooling: "mean", normalize: true }).then((o) => o.data),
      ),
    );

    for (const skill of jdSkills) {
      const skillVec = (
        await model(skill, { pooling: "mean", normalize: true })
      ).data;
      let max = 0;
      for (const cv of candVecs) {
        const sim = cosineSimilarity(skillVec, cv);
        if (sim > max) max = sim;
      }
      out.set(skill, max);
    }
  } catch (error) {
    console.warn(
      `[embedding-matcher] Skill-set similarity failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return out;
}

export const SEMANTIC_MATCH_THRESHOLD = 0.45;
