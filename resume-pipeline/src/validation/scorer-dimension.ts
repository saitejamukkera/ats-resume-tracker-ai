// src/validation/scorer-dimension.ts
// Core interface for pluggable scoring dimensions.
// Every scoring dimension must implement this.

import type { GeneratedSections, ParsedResume } from "../schemas/pipeline.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { RoleImpactProfile } from "../impact/detector.js";

// ── ScoringContext (read-only, all inputs available to every dimension) ──

export interface ScoringContext {
  sections: GeneratedSections;
  jd: JDAnalysis;
  parsedResume: ParsedResume;
  impactProfiles: RoleImpactProfile[];
  fullLatexText: string;

  fullText: string;
  skillsText: string;
  experienceText: string;
  highWeightText: string;
}

// ── ScorerDimension (pluggable strategy) ──

export interface ScorerDimension {
  readonly key: string;
  readonly label: string;

  evaluate(ctx: ScoringContext): number;
}
