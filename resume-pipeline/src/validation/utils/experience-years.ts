// src/validation/utils/experience-years.ts
// Parse professional experience duration from resume role date ranges.
// Best-effort: handles "Jan 2020 -- Present", "2019 - 2021", "May 2018 – Aug 2020",
// "2020-Present". Returns 0 years when nothing parseable so callers can fall back.

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

interface YM {
  year: number;
  month: number; // 0-11
}

function monthIndex(token: string | undefined): number {
  if (!token) return 0;
  return MONTHS[token.slice(0, 3).toLowerCase()] ?? 0;
}

/** Extract a single role's date span as fractional years (0 if unparseable). */
interface RoleSpan {
  start: YM;
  end: YM;
  isCurrent: boolean;
}

function parseRoleSpan(text: string, now: Date): RoleSpan | null {
  const lower = text.toLowerCase();
  const isCurrent = /\b(present|current|now|ongoing)\b/.test(lower);

  // Match optional month name followed by a 4-digit year.
  const re = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?(\d{4})|(\d{4})/gi;
  const points: YM[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[2]) {
      points.push({ year: parseInt(m[2], 10), month: monthIndex(m[1]) });
    } else if (m[3]) {
      points.push({ year: parseInt(m[3], 10), month: 0 });
    }
  }

  const valid = points.filter((p) => p.year >= 1950 && p.year <= now.getFullYear() + 1);
  if (valid.length === 0) return null;

  valid.sort((a, b) => a.year - b.year || a.month - b.month);
  const start = valid[0];
  const end: YM = isCurrent
    ? { year: now.getFullYear(), month: now.getMonth() }
    : valid[valid.length - 1];

  return { start, end, isCurrent };
}

function spanYears(start: YM, end: YM): number {
  const months = (end.year - start.year) * 12 + (end.month - start.month);
  return Math.max(0, months / 12);
}

export interface ExperienceDuration {
  /** Union span from earliest start to latest end (avoids overlap double-counting). */
  totalYears: number;
  /** Duration of the role with the latest end date. */
  mostRecentYears: number;
  /** True when at least one role date range was parsed. */
  parsed: boolean;
}

/**
 * Compute total and most-recent experience years from role heading/date strings.
 * Pass the raw heading text (or rawBlock) of each role.
 */
export function computeExperienceYears(
  roleTexts: string[],
  now: Date = new Date(),
): ExperienceDuration {
  const spans: RoleSpan[] = [];
  for (const t of roleTexts) {
    const span = parseRoleSpan(t, now);
    if (span) spans.push(span);
  }

  if (spans.length === 0) {
    return { totalYears: 0, mostRecentYears: 0, parsed: false };
  }

  // Union span: earliest start → latest end.
  let earliest = spans[0].start;
  let latestEnd = spans[0].end;
  let mostRecent = spans[0];
  for (const s of spans) {
    if (s.start.year < earliest.year || (s.start.year === earliest.year && s.start.month < earliest.month)) {
      earliest = s.start;
    }
    const endAfter =
      s.end.year > latestEnd.year ||
      (s.end.year === latestEnd.year && s.end.month > latestEnd.month);
    if (endAfter) {
      latestEnd = s.end;
      mostRecent = s;
    }
  }

  return {
    totalYears: spanYears(earliest, latestEnd),
    mostRecentYears: spanYears(mostRecent.start, mostRecent.end),
    parsed: true,
  };
}
