// src/validation/utils/bullet-trimmer.ts
// Deterministic safety net that shortens over-length experience bullets without
// an LLM. Only bullets above the hard cap are touched; metrics (anything with a
// digit, %, or $) are never dropped. Conservative: filler-phrase substitution
// first, then clause-boundary truncation if still too long.

const HARD_CAP_WORDS = 32; // matches bulletLengthHealth BORDERLINE_MAX
const TARGET_WORDS = 26; // aim comfortably inside the optimal band

// Verbose phrase → concise equivalent. Case-insensitive, applied in order.
const FILLER_SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bwith the goal of\b/gi, "to"],
  [/\bfor the purpose of\b/gi, "to"],
  [/\bas well as\b/gi, "and"],
  [/\ba wide variety of\b/gi, "many"],
  [/\ba variety of\b/gi, "several"],
  [/\bin a timely manner\b/gi, "on time"],
  [/\bon a daily basis\b/gi, "daily"],
  [/\bresponsible for\b/gi, ""],
  [/\bsuccessfully\b/gi, ""],
  [/\bvarious\b/gi, ""],
  [/\bthat were\b/gi, ""],
  [/\bwhich were\b/gi, ""],
  [/\bin order\b/gi, ""],
];

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function applySubstitutions(text: string): string {
  let out = text;
  for (const [pattern, replacement] of FILLER_SUBSTITUTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

/**
 * Truncate at the last clause boundary (`,` `;` ` and `) that keeps the bullet
 * within TARGET_WORDS — but never cut so that a metric-bearing clause is lost if
 * that metric is the only one. Returns text ending cleanly (no trailing comma).
 */
function truncateAtClause(text: string): string {
  const words = text.split(/\s+/);
  if (words.length <= TARGET_WORDS) return text;

  const head = words.slice(0, TARGET_WORDS).join(" ");
  // Prefer to end at the last clause boundary inside the head.
  const boundary = Math.max(
    head.lastIndexOf(", "),
    head.lastIndexOf("; "),
    head.lastIndexOf(" and "),
  );
  let candidate = boundary > head.length * 0.5 ? head.slice(0, boundary) : head;
  candidate = candidate.replace(/[\s,;:]+$/, "").trim();

  // Never drop the only metric: if the original had a number but the candidate
  // lost all of them, keep the original (the score's bulletLengthHealth penalty
  // is a smaller cost than losing the quantified impact).
  const hadMetric = /[\d%$]/.test(text);
  const keepsMetric = /[\d%$]/.test(candidate);
  if (hadMetric && !keepsMetric) return text;

  return candidate;
}

/** Shorten a single bullet only if it exceeds the hard cap. */
export function trimBullet(text: string): string {
  if (wordCount(text) <= HARD_CAP_WORDS) return text;

  const substituted = applySubstitutions(text);
  if (wordCount(substituted) <= HARD_CAP_WORDS) return substituted;

  return truncateAtClause(substituted);
}

/** Apply trimBullet to every experience bullet. Returns count actually changed. */
export function trimRoleBullets(
  roles: { bullets: string[] }[],
): { trimmed: number } {
  let trimmed = 0;
  for (const role of roles) {
    for (let i = 0; i < role.bullets.length; i++) {
      const next = trimBullet(role.bullets[i]);
      if (next !== role.bullets[i]) {
        role.bullets[i] = next;
        trimmed++;
      }
    }
  }
  return { trimmed };
}
