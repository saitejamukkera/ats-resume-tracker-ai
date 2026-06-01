// src/validation/utils/word-boundary.ts
// Word-boundary-aware keyword matching for ATS scoring.
// Handles edge cases: C++, C#, F#, .NET, Node.js, etc.

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function keywordExistsInText(skill: string, text: string): boolean {
  const escaped = escapeRegex(skill);

  const startsWithWordChar = /^\w/.test(skill);
  const endsWithWordChar = /\w$/.test(skill);

  const startPattern = startsWithWordChar ? "\\b" : "(^|[^a-zA-Z0-9_])";
  const endPattern = endsWithWordChar ? "\\b" : "([^a-zA-Z0-9_]|$)";

  const boundaryRegex = new RegExp(startPattern + escaped + endPattern, "i");
  return boundaryRegex.test(text);
}

export function countKeywordOccurrences(skill: string, text: string): number {
  const escaped = escapeRegex(skill);

  const startsWithWordChar = /^\w/.test(skill);
  const endsWithWordChar = /\w$/.test(skill);

  const startPattern = startsWithWordChar ? "\\b" : "(?:^|[^a-zA-Z0-9_])";
  const endPattern = endsWithWordChar ? "\\b" : "(?:[^a-zA-Z0-9_]|$)";

  const regex = new RegExp(startPattern + escaped + endPattern, "gi");
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}
