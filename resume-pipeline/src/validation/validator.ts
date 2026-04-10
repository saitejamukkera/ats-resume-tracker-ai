// src/validation/validator.ts
// Stage 4: Deterministic constraint validator — 0 LLM calls.
// Checks bullet count, impact, phrasing, JD relevance.

import type { GeneratedSections, GeneratedRole, ValidationError } from '../schemas/pipeline.js';
import type { JDAnalysis } from '../schemas/jd-analysis.js';
import type { PipelineConfig } from '../schemas/pipeline.js';
import { analyzeBullet, type BulletImpactAnalysis } from '../impact/detector.js';

export interface ValidationResult {
  pass: boolean;
  errors: ValidationError[];
  bulletAnalyses: Map<number, BulletImpactAnalysis[]>; // roleIndex -> bullet analyses
}

export function validateSections(
  sections: GeneratedSections,
  jdAnalysis: JDAnalysis,
  config: PipelineConfig,
): ValidationResult {
  const errors: ValidationError[] = [];
  const bulletAnalyses = new Map<number, BulletImpactAnalysis[]>();

  // ── 1. Bullet count per role ──────────────────────────────────
  for (let i = 0; i < sections.experience.length; i++) {
    const role = sections.experience[i];
    if (role.bullets.length < config.constraints.minBulletsPerRole) {
      errors.push({
        section: 'experience',
        rule: 'min-bullets',
        severity: 'critical',
        message: `${role.roleTitle}: only ${role.bullets.length} bullets (min ${config.constraints.minBulletsPerRole})`,
      });
    }
    if (role.bullets.length > config.constraints.maxBulletsPerRole) {
      errors.push({
        section: 'experience',
        rule: 'max-bullets',
        severity: 'warning',
        message: `${role.roleTitle}: ${role.bullets.length} bullets (max ${config.constraints.maxBulletsPerRole})`,
      });
    }
  }

  // ── 2. IDS Impact Analysis per role ───────────────────────────
  const jdKeywords = [...jdAnalysis.requiredSkills, ...jdAnalysis.preferredSkills];

  for (let i = 0; i < sections.experience.length; i++) {
    const role = sections.experience[i];
    const analyses = role.bullets.map(b =>
      analyzeBullet(b, jdKeywords, jdAnalysis.experienceLevel)
    );
    bulletAnalyses.set(i, analyses);

    // Check for zero-impact bullets
    for (const bullet of analyses) {
      if (bullet.strength === 'none') {
        errors.push({
          section: 'experience',
          rule: 'no-impact',
          severity: 'critical',
          message: `Zero-impact bullet: "${bullet.text.substring(0, 80)}..."`,
          offendingContent: bullet.text,
          suggestion: bullet.suggestion,
        });
      } else if (bullet.strength === 'weak') {
        errors.push({
          section: 'experience',
          rule: 'weak-impact',
          severity: 'warning',
          message: `Weak-impact bullet (score ${bullet.score}): "${bullet.text.substring(0, 80)}..."`,
          offendingContent: bullet.text,
          suggestion: bullet.suggestion,
        });
      }
    }

    // Check metric distribution
    const explicitMetricPattern = /\d+%|\d+x|\$[\d,]+|\d+\s*(ms|seconds|hours|days|users|requests|records|endpoints|services|APIs|builds|teams|engineers|sprints|K\+|M\+|\+)/i;
    const bulletsWithMetrics = role.bullets.filter(b => explicitMetricPattern.test(b)).length;
    const metricsRatio = role.bullets.length > 0 ? bulletsWithMetrics / role.bullets.length : 0;

    if (metricsRatio < config.constraints.metricMinRatio) {
      errors.push({
        section: 'experience',
        rule: 'metric-distribution',
        severity: 'warning',
        message: `${role.roleTitle}: Only ${Math.round(metricsRatio * 100)}% of bullets have explicit numbers (recommend ${Math.round(config.constraints.metricMinRatio * 100)}%+)`,
      });
    }
    if (metricsRatio > config.constraints.metricMaxRatio) {
      errors.push({
        section: 'experience',
        rule: 'metric-distribution',
        severity: 'warning',
        message: `${role.roleTitle}: ${Math.round(metricsRatio * 100)}% of bullets have numbers — too uniform, mix in qualitative impact`,
      });
    }

    // Credibility flags
    for (const bullet of analyses) {
      for (const flag of bullet.credibility.flags) {
        errors.push({
          section: 'experience',
          rule: 'credibility',
          severity: 'warning',
          message: `${flag}: "${bullet.text.substring(0, 80)}..."`,
          offendingContent: bullet.text,
        });
      }
    }
  }

  // ── 3. Context-Aware Phrasing Check ───────────────────────────
  const phraseTiers: { pattern: RegExp; severity: 'critical' | 'warning'; reason: string }[] = [
    // TIER 1: CRITICAL — always lazy as opener
    { pattern: /^(responsible for|tasked with|duties included)/i,
      severity: 'critical', reason: 'Passive opener — rewrite with active verb' },
    { pattern: /^(helped with|assisted in|assisted with)/i,
      severity: 'critical', reason: 'Weak agency — state what YOU did' },
    { pattern: /^(involved in|participated in)/i,
      severity: 'critical', reason: 'Vague involvement — specify your contribution' },
    // TIER 2: WARNING
    { pattern: /^(worked on|contributed to)/i,
      severity: 'warning', reason: 'Could be stronger — specify THE action' },
    // TIER 3: ALWAYS BAD
    { pattern: /various (tasks|projects|responsibilities)/i,
      severity: 'critical', reason: 'Vague scope — name the actual tasks/projects' },
    { pattern: /day-to-day (operations|tasks|activities)/i,
      severity: 'critical', reason: 'Filler phrase — describe the actual work' },
  ];

  for (const role of sections.experience) {
    for (const bullet of role.bullets) {
      for (const tier of phraseTiers) {
        if (tier.pattern.test(bullet)) {
          errors.push({
            section: 'experience',
            rule: 'weak-phrasing',
            severity: tier.severity,
            message: `${tier.reason}: "${bullet.substring(0, 80)}..."`,
            offendingContent: bullet,
          });
        }
      }
    }
  }

  // ── 4. JD Relevance Scoring ───────────────────────────────────
  const jdKeywordSet = new Set(
    [...jdAnalysis.requiredSkills, ...jdAnalysis.preferredSkills, ...jdAnalysis.keyPhrases]
      .map(k => k.toLowerCase())
  );

  for (const role of sections.experience) {
    let relevantBullets = 0;
    for (const bullet of role.bullets) {
      const bulletLower = bullet.toLowerCase();
      const hasRelevance = [...jdKeywordSet].some(keyword => {
        const words = keyword.split(/\s+/);
        return words.some(w => w.length > 3 && bulletLower.includes(w));
      });
      if (hasRelevance) relevantBullets++;
    }

    const relevanceRatio = role.bullets.length > 0 ? relevantBullets / role.bullets.length : 0;

    if (relevanceRatio < config.constraints.jdRelevanceMinRatio) {
      errors.push({
        section: 'experience',
        rule: 'jd-relevance',
        severity: 'warning',
        message: `${role.roleTitle}: Only ${Math.round(relevanceRatio * 100)}% of bullets reference JD keywords (min ${Math.round(config.constraints.jdRelevanceMinRatio * 100)}%)`,
      });
    }
  }

  // ── 5. Overall JD Keyword Coverage ────────────────────────────
  const fullText = JSON.stringify(sections).toLowerCase();
  const coveredSkills = jdAnalysis.requiredSkills.filter(skill =>
    fullText.includes(skill.toLowerCase())
  );
  const coverageRatio = jdAnalysis.requiredSkills.length > 0
    ? coveredSkills.length / jdAnalysis.requiredSkills.length
    : 1;

  if (coverageRatio < config.constraints.jdKeywordCoverage) {
    const missing = jdAnalysis.requiredSkills.filter(s => !coveredSkills.includes(s));
    errors.push({
      section: 'overall',
      rule: 'jd-keyword-coverage',
      severity: 'warning',
      message: `Resume covers only ${Math.round(coverageRatio * 100)}% of required skills. Missing: ${missing.join(', ')}`,
    });
  }

  // ── 6. Summary length check ──────────────────────────────────
  const summaryLines = sections.summary.split('\n').filter(l => l.trim()).length;
  if (summaryLines > 6) {
    errors.push({
      section: 'summary',
      rule: 'summary-length',
      severity: 'warning',
      message: `Summary has ${summaryLines} lines (expected 3-4)`,
    });
  }

  return {
    pass: errors.filter(e => e.severity === 'critical').length === 0,
    errors,
    bulletAnalyses,
  };
}
