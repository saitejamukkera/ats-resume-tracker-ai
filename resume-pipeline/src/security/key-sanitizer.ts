// src/security/key-sanitizer.ts
// Key redaction utilities — prevents API keys from leaking into
// console.log, snapshotStore captures, and error messages.

const KEY_PATTERNS: RegExp[] = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  /AIza[A-Za-z0-9_-]{30,}/g,
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
];

const SENSITIVE_FIELDS = [
  "apiKey",
  "apikey",
  "apiKeys",
  "apikeys",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

const REDACTED = "***REDACTED***";

export function sanitize(str: string): string {
  let out = str;
  for (const pattern of KEY_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(
      (field) => lower.includes(field.toLowerCase()),
    );
    if (isSensitive) {
      copy[key] = REDACTED;
    } else {
      copy[key] = obj[key];
    }
  }
  return copy;
}

export function sanitizeSnapshot(
  stage: string,
  extra?: Record<string, unknown>,
): string {
  const parts: string[] = [`[${stage}]`];
  if (extra) {
    const safe = sanitizeObject(extra);
    parts.push(JSON.stringify(safe));
  }
  return sanitize(parts.join(" "));
}
