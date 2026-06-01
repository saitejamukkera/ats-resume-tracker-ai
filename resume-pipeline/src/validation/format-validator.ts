// src/validation/format-validator.ts
// Validates generated LaTeX for ATS compatibility issues.
// Checks: plain-text readability, standard headings, contact info,
// date format consistency, bullet count sanity.

import type { GeneratedSections, FormatIssue } from "../schemas/pipeline.js";
import { stripAllLatex } from "./utils/latex-stripper.js";

export interface FormatResult {
  score: number;
  issues: FormatIssue[];
}

export function validateFormat(
  latexText: string,
  sections: GeneratedSections,
  preamble: string,
): FormatResult {
  const issues: FormatIssue[] = [];

  const plainText = stripAllLatex(latexText);

  const unresolvedCommands = plainText.match(/\\[a-zA-Z]+/g);
  if (unresolvedCommands && unresolvedCommands.length > 0) {
    issues.push({
      severity: "critical",
      category: "parsing",
      message: `Unresolved LaTeX commands found: ${unresolvedCommands.slice(0, 5).join(", ")}`,
    });
  }

  const hasExperience =
    /(work\s+)?experience|employment|professional\s+history/i.test(plainText);
  if (!hasExperience) {
    issues.push({
      severity: "critical",
      category: "headings",
      message:
        'No identifiable "Experience" section heading found',
    });
  }

  const hasEducation =
    /education|academic|qualifications/i.test(plainText);
  if (!hasEducation) {
    issues.push({
      severity: "warning",
      category: "headings",
      message:
        'No identifiable "Education" section heading found',
    });
  }

  const hasSkills =
    /skills?|technologies|proficienc/i.test(plainText);
  if (!hasSkills) {
    issues.push({
      severity: "warning",
      category: "headings",
      message:
        'No identifiable "Skills" section heading found',
    });
  }

  const hasEmail =
    /[\w.-]+@[\w.-]+\.\w+/i.test(preamble) ||
    /[\w.-]+@[\w.-]+\.\w+/i.test(plainText);
  const hasPhone =
    /\+?\d[\d\s().-]{7,}/.test(preamble) ||
    /\+?\d[\d\s().-]{7,}/.test(plainText);
  if (!hasEmail && !hasPhone) {
    issues.push({
      severity: "critical",
      category: "contact",
      message:
        "No email or phone number detected \u2014 ATS may discard anonymous resumes",
    });
  }

  const dates =
    plainText.match(
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{1,2}\/\d{4}\b/gi,
    ) || [];
  const formatCounts = new Map<string, number>();
  for (const d of dates) {
    const format = /\d{1,2}\/\d{4}/.test(d) ? "MM/YYYY" : "Month YYYY";
    formatCounts.set(format, (formatCounts.get(format) || 0) + 1);
  }
  if (formatCounts.size > 1) {
    issues.push({
      severity: "warning",
      category: "dates",
      message: `Inconsistent date formats detected: ${[...formatCounts.keys()].join(" and ")}`,
    });
  }

  for (const role of sections.experience) {
    if (role.bullets.length === 0) {
      issues.push({
        severity: "critical",
        category: "bullets",
        message: `Role "${role.roleTitle}" has 0 bullets`,
      });
    }
    if (role.bullets.length > 15) {
      issues.push({
        severity: "warning",
        category: "bullets",
        message: `Role "${role.roleTitle}" has ${role.bullets.length} bullets \u2014 may indicate parsing error`,
      });
    }
  }

  const criticalCount = issues.filter(
    (i) => i.severity === "critical",
  ).length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const score = Math.max(
    0,
    1 - (criticalCount * 0.25 + warningCount * 0.1),
  );

  return { score: Math.round(score * 100) / 100, issues };
}
