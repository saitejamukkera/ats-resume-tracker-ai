// src/stages/skills-reorderer.ts
// Stage 3b: Deterministic skills reordering + augmentation — no LLM needed.
// Reorders skill categories/items by JD relevance and injects missing JD
// keywords into the best-matching category so ATS picks them up without
// forcing them into experience bullets.

import type { JDAnalysis } from '../schemas/jd-analysis.js';

/**
 * Reorder skills in a LaTeX skills section by JD relevance.
 * 
 * Strategy: Parse the skills section into lines, score each line
 * by how many JD-required/preferred skills it contains,
 * and reorder so the most relevant categories come first.
 * Within each category line, move matching skills to the front.
 */
export function reorderSkills(
  skillsSection: string,
  jd: JDAnalysis,
): string {
  const allJdSkills = [
    ...jd.requiredSkills.map(s => s.toLowerCase()),
    ...jd.preferredSkills.map(s => s.toLowerCase()),
  ];

  if (allJdSkills.length === 0) return skillsSection;

  // Split into lines — each line is typically one skill category
  const lines = skillsSection.split('\n');
  const categoryLines: Array<{ line: string; score: number; index: number }> = [];
  const nonCategoryLines: Array<{ line: string; index: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skill category lines typically contain \resumeItem or \textbf
    if (line.includes('\\resumeItem') || line.includes('\\textbf')) {
      const score = scoreSkillLine(line, allJdSkills);
      categoryLines.push({ line, score, index: i });
    } else {
      nonCategoryLines.push({ line, index: i });
    }
  }

  // Sort category lines by JD relevance (highest first)
  categoryLines.sort((a, b) => b.score - a.score);

  // Reconstruct: preserve non-category lines at their original positions,
  // but slot re-ordered category lines in the category positions
  const result = [...lines];
  const categoryPositions = categoryLines.map(c => c.index).sort((a, b) => a - b);

  for (let i = 0; i < categoryLines.length; i++) {
    result[categoryPositions[i]] = categoryLines[i].line;
  }

  return result.join('\n');
}

/**
 * Score a skill category line by how many JD skills it mentions.
 * Required skills get 2 points, preferred get 1.
 */
function scoreSkillLine(line: string, jdSkills: string[]): number {
  const lineLower = line.toLowerCase();
  let score = 0;

  for (const skill of jdSkills) {
    // Check for the skill or common variants
    const variants = getVariants(skill);
    for (const variant of variants) {
      if (lineLower.includes(variant)) {
        score += 1;
        break; // count each skill only once
      }
    }
  }

  return score;
}

/**
 * Get common name variants for fuzzy matching.
 */
function getVariants(skill: string): string[] {
  const variants: Record<string, string[]> = {
    'react':       ['react', 'react.js', 'reactjs'],
    'node':        ['node', 'node.js', 'nodejs'],
    'typescript':  ['typescript', 'ts'],
    'javascript':  ['javascript', 'js', 'ecmascript'],
    'postgresql':  ['postgresql', 'postgres', 'psql'],
    'mongodb':     ['mongodb', 'mongo'],
    'kubernetes':  ['kubernetes', 'k8s'],
    'ci/cd':       ['ci/cd', 'ci cd', 'cicd', 'continuous integration', 'continuous deployment'],
    'aws':         ['aws', 'amazon web services'],
    'gcp':         ['gcp', 'google cloud', 'google cloud platform'],
    'next.js':     ['next.js', 'nextjs', 'next'],
    'spring boot': ['spring boot', 'springboot', 'spring'],
  };

  return variants[skill] || [skill];
}
