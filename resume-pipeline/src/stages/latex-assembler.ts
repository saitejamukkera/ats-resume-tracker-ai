// src/stages/latex-assembler.ts
// LaTeX Parser + Assembler
// NOT a general LaTeX parser — extracts known sections from a known template.
// Parses \resumeSubheading, \resumeItem, etc. from the base resume LaTeX.

import type {
  ParsedResume,
  ParsedRole,
  GeneratedRole,
  ValidatedSections,
} from "../schemas/pipeline.js";

// ── Section Boundary Markers ───────────────────────────────────
// These are the exact comments/commands that delimit sections in the template.

const SECTION_PATTERNS = {
  summary: {
    start: /\\begin\{document\}/,
    end: /\\section\{(?:Technical\s+)?Skills\}/i,
  },
  skills: {
    start: /\\section\{(?:Technical\s+)?Skills\}/i,
    end: /\\section\{(?:Experience|Professional\s+Experience|Work\s+Experience)\}/i,
  },
  experience: {
    start:
      /\\section\{(?:Experience|Professional\s+Experience|Work\s+Experience)\}/i,
    end: /\\section\{(?:Projects|Personal\s+Projects|Technical\s+Projects)\}/i,
  },
  projects: {
    start:
      /\\section\{(?:Projects|Personal\s+Projects|Technical\s+Projects)\}/i,
    end: /\\section\{(?:Education)\}/i,
  },
  education: {
    start: /\\section\{Education\}/i,
    end: /\\end\{document\}/,
  },
};

// ── LaTeX Parser ───────────────────────────────────────────────

export function parseLatexResume(rawLatex: string): ParsedResume {
  const lines = rawLatex.split("\n");

  // Find \begin{document} and \end{document}
  const docStartIdx = lines.findIndex((l) => /\\begin\{document\}/.test(l));
  const docEndIdx = lines.findIndex((l) => /\\end\{document\}/.test(l));

  if (docStartIdx === -1 || docEndIdx === -1) {
    throw new Error(
      "Invalid LaTeX: missing \\begin{document} or \\end{document}",
    );
  }

  const preamble = lines.slice(0, docStartIdx + 1).join("\n");
  const postamble = lines.slice(docEndIdx).join("\n");
  const bodyLines = lines.slice(docStartIdx + 1, docEndIdx);
  const body = bodyLines.join("\n");

  // Find section boundaries by scanning for \section{...}
  const sectionIndices = findSectionBoundaries(bodyLines);
  const sectionOrder = sectionIndices.map((s) => s.name);

  // Extract header: everything before the first \section
  const firstSectionIdx =
    sectionIndices.length > 0 ? sectionIndices[0].lineIndex : bodyLines.length;
  const header = bodyLines.slice(0, firstSectionIdx).join("\n");

  // Extract each section INCLUDING the header line
  const summary =
    extractNamedSection(bodyLines, sectionIndices, /summary/i) || "";
  const skills =
    extractNamedSection(bodyLines, sectionIndices, /skills/i) || "";
  const experienceRaw =
    extractNamedSection(bodyLines, sectionIndices, /experience/i) || "";
  const projects =
    extractNamedSection(bodyLines, sectionIndices, /projects/i) || "";
  const education =
    extractNamedSection(bodyLines, sectionIndices, /education/i) || "";

  // Parse experience into roles
  const experience = parseExperienceRoles(experienceRaw);

  return {
    preamble,
    header,
    summary,
    skills,
    experience,
    projects,
    education,
    postamble,
    rawLatex,
    sectionOrder,
  };
}

// ── Section Boundary Detection ─────────────────────────────────

interface SectionBoundary {
  name: string;
  lineIndex: number;
  rawLine: string;
}

function findSectionBoundaries(bodyLines: string[]): SectionBoundary[] {
  const boundaries: SectionBoundary[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const match = line.match(/\\section\{([^}]+)\}/);
    if (match) {
      boundaries.push({
        name: match[1].trim(),
        lineIndex: i,
        rawLine: line,
      });
    }
  }

  return boundaries;
}

/**
 * Extract a full section INCLUDING the \section{...} header line.
 */
function extractNamedSection(
  bodyLines: string[],
  sectionIndices: SectionBoundary[],
  namePattern: RegExp,
): string | null {
  const idx = sectionIndices.findIndex((s) => namePattern.test(s.name));
  if (idx === -1) return null;

  const startLine = sectionIndices[idx].lineIndex;
  const endLine =
    idx + 1 < sectionIndices.length
      ? sectionIndices[idx + 1].lineIndex
      : bodyLines.length;

  return bodyLines.slice(startLine, endLine).join("\n").trim();
}

// ── Experience Role Parser ─────────────────────────────────────

function parseExperienceRoles(experienceSection: string): ParsedRole[] {
  const roles: ParsedRole[] = [];

  // Split on \resumeSubheading — each one starts a new role
  // Lookahead avoids eating the command, handles newlines between command and braces
  const blocks = experienceSection.split(/(?=\\resumeSubheading)/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || !trimmed.startsWith("\\resumeSubheading")) continue;

    // Find the heading by looking for the first \resumeItem or \resumeItemListStart
    const itemListStart = trimmed.search(
      /\\resumeItemListStart|\\resumeItem\{/,
    );
    const heading =
      itemListStart !== -1
        ? trimmed.substring(0, itemListStart).trim()
        : trimmed;

    // Extract bullet texts from \resumeItem{...} entries
    const bullets: string[] = [];
    const bulletRegex = /\\resumeItem\{((?:[^{}]|\{[^{}]*\})*)\}/g;
    let match: RegExpExecArray | null;

    while ((match = bulletRegex.exec(trimmed)) !== null) {
      bullets.push(match[1].trim());
    }

    roles.push({
      heading,
      bullets,
      rawBlock: trimmed,
    });
  }

  return roles;
}

// ── LaTeX Assembler ────────────────────────────────────────────
// Inject validated content back into the LaTeX template in the exact original order.
// Projects and Education are NEVER modified.

export function assembleLatex(
  parsed: ParsedResume,
  validated: ValidatedSections,
  jdKeywords: string[] = [],
): string {
  const parts: string[] = [];

  // 1. Preamble (unchanged)
  parts.push(parsed.preamble);

  // 2. Header (unchanged)
  parts.push(parsed.header);

  // 3. Sections in Strict Output Order
  const strictOrder = [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
  ];

  for (const sectionName of strictOrder) {
    if (sectionName === "summary" && parsed.summary) {
      parts.push(
        rebuildSummarySection(parsed.summary, validated.summary, jdKeywords),
      );
    } else if (sectionName === "skills" && parsed.skills) {
      parts.push(validated.skills);
    } else if (
      sectionName === "experience" &&
      (parsed.experience.length > 0 || parsed.experience)
    ) {
      parts.push(
        rebuildExperienceSection(parsed, validated.experience, jdKeywords),
      );
    } else if (sectionName === "projects" && parsed.projects) {
      parts.push(parsed.projects);
    } else if (sectionName === "education" && parsed.education) {
      parts.push(parsed.education);
    }
  }

  // 4. Postamble
  parts.push(parsed.postamble);

  return parts.filter((p) => p.trim()).join("\n\n");
}

/**
 * Rebuild the summary section with new summary text.
 * Preserves the original LaTeX structure around the summary content.
 */
function rebuildSummarySection(
  originalSummary: string,
  newSummary: string,
  jdKeywords: string[],
): string {
  // The summary section in the template is typically:
  // \section{Summary}
  // \resumeSubHeadingListStart
  //   \resumeItem{...summary text...}
  // \resumeSubHeadingListEnd

  const processed = boldifyMetrics(
    boldifyKeywords(escapeLatex(newSummary), jdKeywords),
  );

  // Check if it uses \resumeItem
  if (originalSummary.includes("\\resumeItem{")) {
    return originalSummary.replace(
      /\\resumeItem\{((?:[^{}]|\{[^{}]*\})*)\}/,
      `\\resumeItem{${processed}}`,
    );
  }

  // Check if summary is wrapped in any list environment
  if (
    originalSummary.includes("\\small{") ||
    originalSummary.includes("\\resumeSubHeadingListStart")
  ) {
    const sectionHeader =
      originalSummary.match(/\\section\{[^}]*\}[^\n]*/)?.[0] || "";
    if (sectionHeader) {
      return `${sectionHeader}\n\\resumeSubHeadingListStart\n  \\resumeItem{${processed}}\n\\resumeSubHeadingListEnd`;
    }
  }

  // Fallback: just return the new summary with a section wrapper
  const sectionHeader =
    originalSummary.match(/\\section\{[^}]*\}[^\n]*/)?.[0] ||
    "\\section{Summary}";
  return `${sectionHeader}\n\\resumeSubHeadingListStart\n  \\resumeItem{${processed}}\n\\resumeSubHeadingListEnd`;
}

/**
 * Rebuild experience section: keep original headings, replace bullets.
 */
function rebuildExperienceSection(
  parsed: ParsedResume,
  generatedRoles: GeneratedRole[],
  jdKeywords: string[],
): string {
  const sectionHeader = "\\section{Experience}";
  const roleBlocks: string[] = [];

  for (let i = 0; i < parsed.experience.length; i++) {
    const originalRole = parsed.experience[i];
    const generated = generatedRoles[i];

    // Use original heading (preserves exact company/title/dates formatting)
    const heading = originalRole.heading;

    // Build new bullet list with bold keywords
    const bulletItems = (generated?.bullets || originalRole.bullets)
      .map(
        (b) =>
          `    \\resumeItem{${boldifyMetrics(boldifyKeywords(escapeLatex(b), jdKeywords))}}`,
      )
      .join("\n");

    roleBlocks.push(
      `${heading}\n` +
        `    \\resumeItemListStart\n` +
        `${bulletItems}\n` +
        `    \\resumeItemListEnd`,
    );
  }

  return (
    `${sectionHeader}\n` +
    `  \\resumeSubHeadingListStart\n` +
    roleBlocks.join("\n\n") +
    "\n" +
    `  \\resumeSubHeadingListEnd`
  );
}

/**
 * Escapes unescaped standard LaTeX special characters from LLM outputs.
 * Uses negative lookbehind (?<!\\) to avoid double-escaping already escaped chars.
 */
function escapeLatex(text: string): string {
  if (!text) return text;
  return (
    text
      // Convert spelled-out "percent" back to % symbol (LLMs sometimes spell it out)
      .replace(/(\d+)\s*percent/gi, "$1%")
      // Replace em-dash and en-dash with comma (LLMs ignore the prompt-level ban ~10% of the time)
      .replace(/[\u2014\u2013]/g, ",")
      .replace(/(?<!\\)&/g, "\\&")
      .replace(/(?<!\\)%/g, "\\%")
      .replace(/(?<!\\)\$/g, "\\$")
      .replace(/(?<!\\)#/g, "\\#")
      .replace(/(?<!\\)_/g, "\\_")
  );
}

/**
 * Wraps numeric metrics in \textbf{} for visual emphasis.
 * Matches: "30\%", "8K to 12K", "20+", "$5M", "850ms to 500ms", "10K\+" etc.
 * Skips metrics already inside a \textbf{} block.
 */
function boldifyMetrics(text: string): string {
  if (!text) return text;

  // Patterns for common resume metrics (applied after escapeLatex, so % is \%)
  const metricPatterns = [
    // Ranges: "8K to 12K", "850ms to 500ms", "$2M to $5M"
    /\$?[\d,]+(?:\.\d+)?(?:K|M|B|k|m|ms|s|x|X)?(?:\\\+)?\s+to\s+\$?[\d,]+(?:\.\d+)?(?:K|M|B|k|m|ms|s|x|X)?(?:\\\+)?/g,
    // Percentage: "30\%", "55\%"
    /[\d,]+(?:\.\d+)?\s*\\%/g,
    // Numbers with units/scale: "10K+", "12K", "500ms", "20+", "$5M"
    /\$[\d,]+(?:\.\d+)?(?:K|M|B|k|m)?(?:\\\+)?/g,
    /[\d,]+(?:\.\d+)?(?:K|M|B)\\\+/g,
    /[\d,]+(?:\.\d+)?(?:K|M|B)(?=\s|,|\.|\b)/g,
    // "20+" (with escaped plus)
    /[\d,]+\\\+/g,
    // Time durations: "850ms", "2hrs", "15min"
    /[\d,]+(?:ms|hrs?|min|seconds?|days?|weeks?|months?|sprints?)/gi,
    // Multipliers: "3x", "10x"
    /[\d,]+x\b/gi,
  ];

  let result = text;

  for (const pattern of metricPatterns) {
    result = result.replace(pattern, (match, offset) => {
      // Skip if already inside \textbf{...}
      const before = result.slice(Math.max(0, offset - 100), offset);
      const lastOpen = before.lastIndexOf("\\textbf{");
      if (lastOpen !== -1) {
        const afterOpen = before.slice(lastOpen + 8);
        if (!afterOpen.includes("}")) {
          return match;
        }
      }
      return `\\textbf{${match}}`;
    });
  }

  return result;
}

/**
 * Wraps technology keywords and JD-relevant terms in \textbf{} for visual emphasis.
 * Applied AFTER escapeLatex() so LaTeX specials inside keywords are already escaped.
 * Only bolds whole-word matches to avoid mangling partial words.
 * Skips keywords that are already inside a \textbf{} block.
 */
function boldifyKeywords(text: string, jdKeywords: string[]): string {
  if (!text || jdKeywords.length === 0) return text;

  // Build a unique set of keywords, sorted longest-first to avoid partial replacements
  const seen = new Set<string>();
  const keywords = jdKeywords
    .filter((k) => {
      const lower = k.toLowerCase();
      if (seen.has(lower) || lower.length < 2) return false;
      seen.add(lower);
      return true;
    })
    .sort((a, b) => b.length - a.length);

  let result = text;

  for (const keyword of keywords) {
    // Escape regex special chars in the keyword, and also handle LaTeX-escaped underscores
    const escaped = keyword
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/_/g, "\\\\_"); // match the escaped underscore in text

    // Word-boundary match — case-insensitive
    const pattern = new RegExp(`\\b(${escaped})\\b`, "gi");

    // Replace only if the match is NOT already inside a \textbf{...} block
    result = result.replace(pattern, (match, _group, offset) => {
      // Scan backwards from the match offset to check for \textbf{
      const before = result.slice(Math.max(0, offset - 100), offset);
      const lastOpen = before.lastIndexOf("\\textbf{");
      if (lastOpen !== -1) {
        // Check if there's a closing } between the \textbf{ and our match
        const afterOpen = before.slice(lastOpen + 8); // after "\textbf{"
        if (!afterOpen.includes("}")) {
          return match; // inside an open \textbf{}, don't double-wrap
        }
      }
      return `\\textbf{${match}}`;
    });
  }

  return result;
}
