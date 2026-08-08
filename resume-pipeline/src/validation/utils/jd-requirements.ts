// src/validation/utils/jd-requirements.ts
// Deterministic regex backstop for hard-requirement extraction from JD text.
// The LLM jd-parser is the primary source; these fill gaps it misses so the
// knockout evaluator never silently skips a hard requirement.

// ── Minimum years of experience ─────────────────────────────────

const YEARS_PATTERN =
  /(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi;

/** Sentence-ish window around a match, used to classify required vs preferred. */
function contextWindow(text: string, index: number, span: number): string {
  return text.substring(Math.max(0, index - span), index + span);
}

const PREFERRED_CONTEXT =
  /preferred|nice[\s-]to[\s-]have|bonus|a\s+plus|ideally|we\s+value/i;
const EXPERIENCE_CONTEXT =
  /experience|background|track\s+record|working\s+(?:in|with)|development|engineering/i;

/**
 * Extracts the minimum total years of experience the JD requires, or null.
 * Takes the maximum years figure that appears in a required (non-preferred)
 * experience context — "5+ years of experience" beats "2 years of Java".
 */
export function extractMinYears(jdText: string): number | null {
  let best: number | null = null;
  let match: RegExpExecArray | null;
  YEARS_PATTERN.lastIndex = 0;
  while ((match = YEARS_PATTERN.exec(jdText)) !== null) {
    const years = parseInt(match[1], 10);
    if (!Number.isFinite(years) || years <= 0 || years > 30) continue;
    const ctx = contextWindow(jdText, match.index, 80);
    if (!EXPERIENCE_CONTEXT.test(ctx)) continue;
    if (PREFERRED_CONTEXT.test(ctx)) continue;
    if (best === null || years > best) best = years;
  }
  return best;
}

// ── Work authorization ──────────────────────────────────────────

const WORK_AUTH_PATTERNS: RegExp[] = [
  /(?:must\s+be\s+)?(?:legally\s+)?authorized\s+to\s+work[^.\n]*/i,
  /no\s+(?:visa\s+)?sponsorship[^.\n]*/i,
  /(?:unable|not\s+able)\s+to\s+(?:provide|offer)\s+sponsorship[^.\n]*/i,
  /u\.?s\.?\s+citizen(?:ship)?[^.\n]*/i,
  /green\s+card[^.\n]*/i,
  /security\s+clearance[^.\n]*/i,
];

/** Returns the JD's work-authorization requirement sentence fragment, or null. */
export function extractWorkAuthRequirement(jdText: string): string | null {
  for (const pattern of WORK_AUTH_PATTERNS) {
    const match = jdText.match(pattern);
    if (match) return match[0].trim().replace(/\s+/g, " ").slice(0, 160);
  }
  return null;
}

// ── Certifications ──────────────────────────────────────────────

const CERT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "AWS Certification", pattern: /aws\s+certified[\w\s-]{0,40}/i },
  { name: "Azure Certification", pattern: /azure\s+(?:certified|administrator|developer|solutions\s+architect)[\w\s-]{0,30}/i },
  { name: "GCP Certification", pattern: /(?:google\s+cloud|gcp)\s+certified[\w\s-]{0,40}/i },
  { name: "CKA", pattern: /\bcka\b|certified\s+kubernetes\s+administrator/i },
  { name: "CKAD", pattern: /\bckad\b/i },
  { name: "PMP", pattern: /\bpmp\b|project\s+management\s+professional/i },
  { name: "CISSP", pattern: /\bcissp\b/i },
  { name: "Security+", pattern: /security\s*\+/i },
  { name: "CompTIA", pattern: /\bcomptia\b[\w\s+-]{0,20}/i },
];

const CERT_REQUIRED_CONTEXT = /required|must\s+(?:have|hold|possess)|need(?:ed)?/i;

/**
 * Certifications the JD frames as required (within an 120-char window of
 * required-language). Certifications merely mentioned are NOT knockouts.
 */
export function extractRequiredCertifications(jdText: string): string[] {
  const out: string[] = [];
  for (const { name, pattern } of CERT_PATTERNS) {
    const match = pattern.exec(jdText);
    if (!match) continue;
    const ctx = contextWindow(jdText, match.index, 120);
    if (CERT_REQUIRED_CONTEXT.test(ctx) && !PREFERRED_CONTEXT.test(ctx)) {
      out.push(name);
    }
  }
  return out;
}
