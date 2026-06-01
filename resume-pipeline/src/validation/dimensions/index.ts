// src/validation/dimensions/index.ts
import { keywordRelevanceDimension } from "./keyword-relevance.js";
import { preferredRelevanceDimension } from "./preferred-relevance.js";
import { impactScoreDimension } from "./impact-score.js";
import { metricsRatioDimension } from "./metrics-ratio.js";
import { actionVerbRatioDimension } from "./action-verb-ratio.js";
import { keywordPlacementDimension } from "./keyword-placement.js";
import { sectionCompletenessDimension } from "./section-completeness.js";
import { formatScoreDimension } from "./format-score.js";
import { skillExperienceCoherenceDimension } from "./skill-experience-coherence.js";
import { experienceLevelMatchDimension } from "./experience-level-match.js";
import { educationLevelMatchDimension } from "./education-level-match.js";
import { taxonomyCoverageDimension } from "./taxonomy-coverage.js";
import { bulletLengthHealthDimension } from "./bullet-length-health.js";
import { semanticSimilarityDimension } from "./semantic-similarity.js";
import type { ScorerDimension } from "../scorer-dimension.js";

export { keywordRelevanceDimension } from "./keyword-relevance.js";
export { preferredRelevanceDimension } from "./preferred-relevance.js";
export { impactScoreDimension } from "./impact-score.js";
export { metricsRatioDimension } from "./metrics-ratio.js";
export { actionVerbRatioDimension } from "./action-verb-ratio.js";
export { keywordPlacementDimension } from "./keyword-placement.js";
export { sectionCompletenessDimension } from "./section-completeness.js";
export { formatScoreDimension } from "./format-score.js";
export { skillExperienceCoherenceDimension } from "./skill-experience-coherence.js";
export { experienceLevelMatchDimension } from "./experience-level-match.js";
export { educationLevelMatchDimension } from "./education-level-match.js";
export { taxonomyCoverageDimension } from "./taxonomy-coverage.js";
export { bulletLengthHealthDimension } from "./bullet-length-health.js";
export { semanticSimilarityDimension } from "./semantic-similarity.js";

export const defaultDimensions: ScorerDimension[] = [
  keywordRelevanceDimension,
  preferredRelevanceDimension,
  impactScoreDimension,
  metricsRatioDimension,
  actionVerbRatioDimension,
  keywordPlacementDimension,
  sectionCompletenessDimension,
  formatScoreDimension,
  skillExperienceCoherenceDimension,
    experienceLevelMatchDimension,
    educationLevelMatchDimension,
    taxonomyCoverageDimension,
    bulletLengthHealthDimension,
  ];

export const phase3Dimensions: ScorerDimension[] = [
  semanticSimilarityDimension,
  ...defaultDimensions,
];
