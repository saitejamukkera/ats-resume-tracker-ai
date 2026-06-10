// src/stages/docx-generator.ts
// Builds a professional .docx from already-parsed-and-validated structured data.
//
// Key design decisions:
//   - Brace-balanced scanner for all curly-brace extraction (no regex fragility)
//   - Recursive text segment parser handles \textbf{}, \textit{}, \underline{}, \href{}
//   - Right-aligned tab stops replicate the two-column \resumeSubheading layout
//   - Mixed-format TextRuns replicate \textbf{} / \textit{} inline formatting
//   - boldKeywords applied via same pipeline as assembleLatex()

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  TabStopType,
  BorderStyle,
} from "docx";
import type { ParsedResume, ValidatedSections, ParsedRole } from "../schemas/pipeline.js";
import {
  escapeLatex,
  boldifyKeywords,
  boldifyMetrics,
  parseSubheadingRoles,
} from "./latex-assembler.js";

// ============================================================================
// Types
// ============================================================================

interface TextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

// ============================================================================
// Brace-Balancing Scanner
// ============================================================================

function extractBracedArg(
  text: string,
  startIndex: number,
): { content: string; endIndex: number } | null {
  let i = startIndex;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (i >= text.length || text[i] !== "{") return null;

  let braceCount = 1;
  const argStart = i + 1;
  i++;
  while (i < text.length && braceCount > 0) {
    if (text[i] === "\\" && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (text[i] === "{") braceCount++;
    else if (text[i] === "}") braceCount--;
    i++;
  }
  return { content: text.substring(argStart, i - 1), endIndex: i };
}

function extractBracedArgs(
  text: string,
  startIndex: number,
  maxArgs: number,
): string[] {
  const args: string[] = [];
  let i = startIndex;
  for (let a = 0; a < maxArgs; a++) {
    const result = extractBracedArg(text, i);
    if (!result) break;
    args.push(result.content);
    i = result.endIndex;
  }
  return args;
}

function extractDelimitedArg(
  text: string,
  startIndex: number,
  open: string,
  close: string,
): { content: string; endIndex: number } | null {
  let i = startIndex;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (!text.startsWith(open, i)) return null;
  i += open.length;

  let depth = 1;
  const argStart = i;
  while (i < text.length && depth > 0) {
    if (text.startsWith(open, i)) { depth++; i += open.length; continue; }
    if (text.startsWith(close, i)) { depth--; i += close.length; continue; }
    i++;
  }
  return { content: text.substring(argStart, i - close.length), endIndex: i };
}

// ============================================================================
// Text Segment Parser
// ============================================================================

function parseTextSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let i = 0;
  let plain = "";

  function flush(): void {
    if (plain) {
      segments.push({ text: plain, bold: false, italic: false, underline: false });
      plain = "";
    }
  }

  function pushInner(innerText: string, bold: boolean, italic: boolean, underline: boolean): void {
    const inner = parseTextSegments(innerText);
    for (const seg of inner) {
      segments.push({
        text: seg.text,
        bold: seg.bold || bold,
        italic: seg.italic || italic,
        underline: seg.underline || underline,
      });
    }
  }

  while (i < text.length) {
    if (text[i] === "\\") {
      const rest = text.substring(i);

      if (rest.startsWith("\\textbf{")) {
        flush();
        const arg = extractBracedArg(text, i + 7);
        if (arg) { pushInner(arg.content, true, false, false); i = arg.endIndex; continue; }
      }

      if (rest.startsWith("\\textit{")) {
        flush();
        const arg = extractBracedArg(text, i + 7);
        if (arg) { pushInner(arg.content, false, true, false); i = arg.endIndex; continue; }
      }

      if (rest.startsWith("\\underline{")) {
        flush();
        const arg = extractBracedArg(text, i + 11);
        if (arg) { pushInner(arg.content, false, false, true); i = arg.endIndex; continue; }
      }

      if (rest.startsWith("\\href{")) {
        flush();
        const urlArg = extractBracedArg(text, i + 5);
        if (urlArg) {
          const labelArg = extractBracedArg(text, urlArg.endIndex);
          if (labelArg) { pushInner(labelArg.content, false, false, false); i = labelArg.endIndex; continue; }
          i = urlArg.endIndex; continue;
        }
      }

      if (rest.startsWith("\\small{") || rest.startsWith("\\large{")) {
        flush();
        const cmdLen = rest.startsWith("\\small{") ? 7 : 7;
        const arg = extractBracedArg(text, i + cmdLen);
        if (arg) { pushInner(arg.content, false, false, false); i = arg.endIndex; continue; }
      }

      if (/^\\fa[A-Za-z]+\*?/.test(rest)) {
        flush();
        const match = rest.match(/^\\fa[A-Za-z]+\*?/)!;
        i += match[0].length;
        continue;
      }

      if (rest.startsWith("\\hspace{")) {
        flush();
        const arg = extractBracedArg(text, i + 8);
        i = arg ? arg.endIndex : i + 8;
        continue;
      }

      if (rest.startsWith("\\vspace{")) {
        flush();
        const arg = extractBracedArg(text, i + 8);
        i = arg ? arg.endIndex : i + 8;
        continue;
      }

      if (rest.length >= 2 && "&%$#_".includes(rest[1])) {
        plain += rest[1];
        i += 2;
        continue;
      }

      if (rest.startsWith("\\\\")) { i += 2; continue; }

      const cmdMatch = rest.match(/^\\[a-zA-Z]+\*?/);
      if (cmdMatch) {
        i += cmdMatch[0].length;
        const nextArg = extractBracedArg(text, i);
        if (nextArg) i = nextArg.endIndex;
        continue;
      }

      i++;
      continue;
    }

    if (text.substring(i, i + 3) === "$|$") {
      flush();
      plain += " | ";
      i += 3;
      continue;
    }

    plain += text[i];
    i++;
  }

  flush();
  return mergeAdjacentSegments(segments);
}

function mergeAdjacentSegments(segments: TextSegment[]): TextSegment[] {
  const merged: TextSegment[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const last = merged[merged.length - 1];
    if (last && last.bold === seg.bold && last.italic === seg.italic && last.underline === seg.underline) {
      last.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

function segmentsToText(segments: TextSegment[]): string {
  return segments.map((s) => s.text).join("").replace(/\s+/g, " ").trim();
}

function stripText(text: string): string {
  return segmentsToText(parseTextSegments(text));
}

// ============================================================================
// LaTeX Structure Parsers
// ============================================================================

function parseSubheadingArgs(
  latexBlock: string,
): { title: string; dates: string; company: string; location: string } | null {
  const match = latexBlock.match(
    /\\(resume(?:Project)?[Ss]ub[Hh]eading|resumeProjectHeading)/,
  );
  if (!match) return null;

  let i = latexBlock.indexOf(match[0]) + match[0].length;

  const optArg = extractDelimitedArg(latexBlock, i, "[", "]");
  if (optArg) i = optArg.endIndex;

  const args = extractBracedArgs(latexBlock, i, 4);
  const command = match[1].toLowerCase();

  if (command === "resumeprojectsubheading") {
    if (args.length < 3) return null;
    return {
      title: stripText(args[0]),
      dates: stripText(args[1]),
      company: stripText(args[2]),
      location: "",
    };
  }

  if (command === "resumeprojectheading") {
    if (args.length < 2) return null;
    return {
      title: stripText(args[0]),
      dates: stripText(args[1]),
      company: "",
      location: "",
    };
  }

  // Projects sometimes omit the 4th (location) braced arg; education always has 4.
  if (args.length < 3) return null;

  return {
    title: stripText(args[0]),
    dates: stripText(args[1]),
    company: stripText(args[2]),
    location: args[3] ? stripText(args[3]) : "",
  };
}

function parseResumeItems(latexBlock: string): string[] {
  const items: string[] = [];
  let i = 0;
  while (i < latexBlock.length) {
    const idx = latexBlock.indexOf("\\resumeItem{", i);
    if (idx === -1) break;
    const result = extractBracedArg(latexBlock, idx + 11);
    if (!result) break;
    items.push(result.content.trim());
    i = result.endIndex;
  }
  return items;
}

function parseHeader(
  headerLatex: string,
): { name: string; contactLine1: string; contactLine2: string } {
  let text = headerLatex
    .replace(/\\begin\{center\}/g, "")
    .replace(/\\end\{center\}/g, "")
    .replace(/\\begin\{document\}/g, "")
    .replace(/\\end\{document\}/g, "");

  const lines = text.split(/\\\\\s*(?:\\vspace\{[^}]*\})?/);

  const rawName =
    lines[0]
      ?.replace(/\\textbf\{/g, "")
      .replace(/\\Huge\s*/g, "")
      .replace(/\\scshape\s*/g, "")
      .replace(/\}/g, "")
      .trim() ?? "";

  return {
    name: rawName,
    contactLine1: lines[1] ? segmentsToText(parseTextSegments(lines[1])) : "",
    contactLine2: lines[2] ? segmentsToText(parseTextSegments(lines[2])) : "",
  };
}

function parseSkillCategories(
  skillsLatex: string,
): { category: string; items: string }[] {
  const categories: { category: string; items: string }[] = [];
  let i = 0;

  while (i < skillsLatex.length) {
    const bfIdx = skillsLatex.indexOf("\\textbf{", i);
    if (bfIdx === -1) break;

    const catResult = extractBracedArg(skillsLatex, bfIdx + 7);
    if (!catResult) break;

    let cat = catResult.content.trim();
    let items = "";

    // Format A: \textbf{Category}{: items}
    const itemsResult = extractBracedArg(skillsLatex, catResult.endIndex);
    if (itemsResult) {
      items = itemsResult.content.replace(/^:\s*/, "").trim();
      i = itemsResult.endIndex;
    } else {
      // Format B: \textbf{Category:} items \\ — read until delimiter
      cat = cat.replace(/:$/, "").trim();
      const afterBf = catResult.endIndex;
      const candidates = [
        skillsLatex.indexOf("\\\\", afterBf),
        skillsLatex.indexOf("\\textbf{", afterBf),
        skillsLatex.indexOf("}}", afterBf),
        skillsLatex.indexOf("\\end{", afterBf),
      ].filter((p) => p !== -1);
      const endPos = candidates.length > 0 ? Math.min(...candidates) : skillsLatex.length;
      items = skillsLatex.substring(afterBf, endPos).trim();
      items = items.replace(/^:\s*/, "").replace(/\\\\$/, "").trim();
      i = endPos;
    }

    if (cat) categories.push({ category: cat, items });
  }

  return categories;
}

// ============================================================================
// LaTeX Sanitization (postgres TEXT column trailing '+' padding)
// ============================================================================

function sanitizeLatex(text: string): string {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => line.replace(/\s*\+\s*$/, "").replace(/\r$/, ""))
    .join("\n");
}

// ============================================================================
// Keyword/Metric Bolding
// ============================================================================

function boldText(text: string, keywords: string[]): string {
  return boldifyMetrics(boldifyKeywords(escapeLatex(text), keywords));
}

// ============================================================================
// DOCX Building Blocks
// ============================================================================

const RIGHT_TAB_STOP = {
  type: TabStopType.RIGHT as typeof TabStopType.RIGHT,
  position: 10800, // 12240 page - 720 left - 720 right = 10800 twips
};

function buildSectionHeading(name: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: name.toUpperCase(), bold: true, size: 28, font: "Calibri" })],
    border: { bottom: { style: BorderStyle.SINGLE, color: "000000", size: 4, space: 4 } },
    spacing: { before: 200, after: 80 },
  });
}

function buildSubheadingParagraph(
  title: string, dates: string, company: string, location: string,
): Paragraph {
  // Line 1: bold title (left) + tab → dates (right)
  // Line 2: break before + italic company (left) + tab → italic location (right)
  const children: TextRun[] = [
    new TextRun({ text: title, bold: true, size: 20, font: "Calibri" }),
    new TextRun({ text: "\t" + dates, size: 20, font: "Calibri" }),
  ];

  if (company || location) {
    children.push(
      new TextRun({ text: company, italics: true, size: 20, font: "Calibri", break: 1 }),
      new TextRun({ text: "\t" + (location || ""), italics: true, size: 20, font: "Calibri" }),
    );
  }

  return new Paragraph({
    children,
    tabStops: [RIGHT_TAB_STOP],
    spacing: { before: 60, after: 40 },
  });
}

function buildBulletParagraph(text: string, sizeHalfPoints: number = 18): Paragraph {
  const segments = parseTextSegments(text);
  return new Paragraph({
    children: segments.map((seg) =>
      new TextRun({
        text: seg.text, bold: seg.bold, italics: seg.italic,
        underline: seg.underline ? { type: "single" as const, color: "000000" } : undefined,
        size: sizeHalfPoints, font: "Calibri",
      }),
    ),
    bullet: { level: 0 },
    spacing: { after: 30 },
  });
}

function buildBodyParagraph(text: string, sizeHalfPoints: number = 20): Paragraph {
  const segments = parseTextSegments(text);
  return new Paragraph({
    children: segments.map((seg) =>
      new TextRun({
        text: seg.text, bold: seg.bold, italics: seg.italic,
        underline: seg.underline ? { type: "single" as const, color: "000000" } : undefined,
        size: sizeHalfPoints, font: "Calibri",
      }),
    ),
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 60 },
  });
}

// ============================================================================
// Section Builders
// ============================================================================

function buildSummarySection(summaryText: string): Paragraph[] {
  if (!summaryText?.trim()) return [];
  return [buildSectionHeading("Summary"), buildBodyParagraph(summaryText, 20)];
}

function buildEducationSection(educationLatex: string): Paragraph[] {
  if (!educationLatex?.trim()) return [];
  const items: Paragraph[] = [buildSectionHeading("Education")];
  for (const block of educationLatex.split(/(?=\\resumeSubheading)/)) {
    const parsed = parseSubheadingArgs(block);
    if (!parsed) continue;
    items.push(buildSubheadingParagraph(parsed.title, parsed.dates, parsed.company, parsed.location));
  }
  return items;
}

function buildExperienceSection(
  parsedRoles: ParsedRole[],
  validatedRoles: { bullets: string[] }[],
): Paragraph[] {
  const items: Paragraph[] = [buildSectionHeading("Experience")];
  for (let i = 0; i < parsedRoles.length; i++) {
    const orig = parsedRoles[i];
    const val = validatedRoles[i];
    const h = parseSubheadingArgs(orig.heading);
    const title = h?.title ?? stripText(orig.heading.split("\n").filter((l) => l.trim())[0] || "");
    const dates = h?.dates ?? "";
    const company = h?.company ?? stripText(orig.heading.split("\n").filter((l) => l.trim())[1] || "");
    const location = h?.location ?? "";
    items.push(buildSubheadingParagraph(title, dates, company, location));
    for (const b of (val?.bullets ?? orig.bullets)) {
      items.push(buildBulletParagraph(b));
    }
  }
  return items;
}

function buildProjectRoleParagraphs(role: ParsedRole): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const h = parseSubheadingArgs(role.heading);
  const title =
    h?.title ??
    stripText(role.heading.split("\n").find((l) => l.trim()) || "");
  const dates = h?.dates ?? "";
  const company =
    h?.company ??
    stripText(
      role.heading
        .split("\n")
        .filter((l) => l.trim())
        .slice(1)
        .join(" "),
    );
  const location = h?.location ?? "";

  if (title || dates || company) {
    paragraphs.push(
      buildSubheadingParagraph(title, dates, company, location),
    );
  }

  for (const bullet of role.bullets) {
    paragraphs.push(buildBulletParagraph(bullet));
  }

  return paragraphs;
}

function buildProjectsSection(projectsLatex: string): Paragraph[] {
  if (!projectsLatex?.trim()) return [];

  const roles = parseSubheadingRoles(projectsLatex);
  const content: Paragraph[] = [];

  for (const role of roles) {
    content.push(...buildProjectRoleParagraphs(role));
  }

  // Some templates list projects as bare \resumeItem bullets with no subheading.
  if (content.length === 0) {
    for (const bullet of parseResumeItems(projectsLatex)) {
      content.push(buildBulletParagraph(bullet));
    }
  }

  if (content.length === 0) return [];

  return [buildSectionHeading("Projects"), ...content];
}

function buildSkillsSection(skillsLatex: string): Paragraph[] {
  if (!skillsLatex?.trim()) return [];
  const items: Paragraph[] = [buildSectionHeading("Technical Skills")];
  for (const { category, items: catItems } of parseSkillCategories(skillsLatex)) {
    const cleanItems = catItems ? segmentsToText(parseTextSegments(catItems)) : "";
    const children: TextRun[] = [
      new TextRun({ text: category, bold: true, size: 20, font: "Calibri" }),
    ];
    if (cleanItems) {
      children.push(new TextRun({ text: `: ${cleanItems}`, size: 20, font: "Calibri" }));
    }
    items.push(new Paragraph({ children, spacing: { after: 20 } }));
  }
  return items;
}

// ============================================================================
// Main Entry Point
// ============================================================================

export async function generateDocx(
  rawParsed: ParsedResume,
  rawValidated: ValidatedSections,
  boldKeywords: string[] = [],
): Promise<Buffer> {
  // Sanitize trailing '+' padding from PostgreSQL TEXT columns
  const parsed: ParsedResume = {
    ...rawParsed,
    header: sanitizeLatex(rawParsed.header),
    summary: sanitizeLatex(rawParsed.summary),
    education: sanitizeLatex(rawParsed.education),
    projects: sanitizeLatex(rawParsed.projects),
    skills: sanitizeLatex(rawParsed.skills),
    experience: rawParsed.experience.map((r) => ({
      ...r,
      heading: sanitizeLatex(r.heading),
    })),
  };

  // Apply keyword + metric bolding (mirrors assembleLatex)
  const validated: ValidatedSections = {
    ...rawValidated,
    summary: boldText(rawValidated.summary, boldKeywords),
    skills: sanitizeLatex(rawValidated.skills),
    experience: rawValidated.experience.map((r) => ({
      ...r,
      bullets: r.bullets.map((b) => boldText(b, boldKeywords)),
    })),
  };

  const children: Paragraph[] = [];

  // ── Header ──
  const { name, contactLine1, contactLine2 } = parseHeader(parsed.header);
  if (name) {
    children.push(new Paragraph({
      children: [new TextRun({ text: name, bold: true, size: 32, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }));
  }
  if (contactLine1) {
    children.push(new Paragraph({
      children: [new TextRun({ text: contactLine1, size: 18, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 20 },
    }));
  }
  if (contactLine2) {
    children.push(new Paragraph({
      children: [new TextRun({ text: contactLine2, size: 18, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }));
  }

  // ── Sections ──
  for (const sectionName of parsed.sectionOrder) {
    const n = sectionName.toLowerCase();
    if (n.includes("summary")) children.push(...buildSummarySection(validated.summary));
    else if (n.includes("education")) children.push(...buildEducationSection(parsed.education));
    else if (n.includes("experience") || n.includes("professional"))
      children.push(...buildExperienceSection(parsed.experience, validated.experience));
    else if (n.includes("project"))
      children.push(...buildProjectsSection(parsed.projects));
    else if (n.includes("skill"))
      children.push(...buildSkillsSection(validated.skills));
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 20 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}
