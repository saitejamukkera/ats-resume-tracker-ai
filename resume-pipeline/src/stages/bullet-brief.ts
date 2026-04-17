// src/stages/bullet-brief.ts
// Parse each original bullet into a structured brief that the generator
// rewrites FROM (instead of free-form prose). This guarantees no fact
// drift: the LLM receives the action, tools, scope, metric, and project
// name already extracted, and rewrites to the target style without
// inventing details that aren't in the base resume.
//
// Deterministic. 0 LLM calls.

// ── Types ──────────────────────────────────────────────────────

export interface BulletBrief {
  roleIndex: number;
  bulletIndex: number;
  rawText: string;
  /** First verb of the bullet, lowercased. */
  action: string;
  /** Concrete technologies found in the bullet. */
  technologies: string[];
  /** Scope phrase if present, e.g. "team of 4", "production", "5K req/day". */
  scope: string | null;
  /** Metric phrase if present, e.g. "30%", "$5M", "from 2hrs to 15min". */
  metric: string | null;
  /** Proper noun / project name if present, e.g. "Payments Hub", "Project Atlas". */
  projectTag: string | null;
  hasMetric: boolean;
}

// ── Tech Matching ──────────────────────────────────────────────

const BASE_TECH = [
  "Redis", "Kafka", "Kubernetes", "K8s", "Docker", "Terraform", "AWS", "GCP",
  "Azure", "PostgreSQL", "Postgres", "MongoDB", "React", "Spring Boot",
  "Spring", "Jenkins", "GitHub Actions", "CircleCI", "Datadog", "Grafana",
  "Elasticsearch", "RabbitMQ", "GraphQL", "TypeScript", "Python", "Java",
  "Go", "Golang", "Rust", "Node.js", "Next.js", "REST", "SQL", "NoSQL",
  "MySQL", "DynamoDB", "S3", "Lambda", "EC2", "Microservices", "CI/CD",
  "Nginx", "Express", "Flask", "Django", "FastAPI", "Kotlin", "Swift",
  "Scala", "Ruby", "Rails", "Angular", "Vue", "Svelte", "Redux", "Webpack",
  "Vite", "Jest", "Cypress", "Playwright", "JUnit", "pytest", "Selenium",
  "Kinesis", "SNS", "SQS", "CloudFormation", "Helm", "Prometheus",
  "OpenTelemetry", "OAuth", "JWT", "gRPC", "Protobuf", "WebSocket",
  "Tailwind", "Chakra", "Material UI", "shadcn",
];

function extractTechnologies(text: string, extras: string[] = []): string[] {
  const all = [...new Set([...BASE_TECH, ...extras])];
  const found = new Set<string>();
  for (const tech of all) {
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
      found.add(tech);
    }
  }
  return [...found];
}

// ── Metric Extraction ──────────────────────────────────────────
// Conservative — we want to recognize when a bullet already has a number.
// Order matters: longer patterns first.
const METRIC_PATTERNS: RegExp[] = [
  // "from 850ms to 500ms" — preserve exact span
  /from\s+\$?[\d.,]+\s*[a-zA-Z%]*\s+to\s+\$?[\d.,]+\s*[a-zA-Z%]*/i,
  // "$5M", "$50K", "$1.2B"
  /\$\s?[\d.,]+\s*[KMB]?\b/,
  // "30%", "3x", "10X", "2.5x"
  /\b[\d.,]+%|\b[\d.,]+\s?[xX]\b/,
  // "5K users", "1M requests", "400+ builds"
  /\b[\d.,]+\s?[KMB]\+?\s+[a-zA-Z]+/,
  // "handles 10000 req/s", "serves 4000 users"
  /\b[\d.,]{2,}\s*(req|qps|rps|tps|users|requests|records|endpoints|services|APIs|ms|seconds|hours|days|minutes|sprints|builds|teams|engineers|events)\b/i,
  // "by 40%"
  /\bby\s+[\d.,]+\s*[%x]?\b/i,
];

function extractMetric(text: string): string | null {
  for (const pat of METRIC_PATTERNS) {
    const m = text.match(pat);
    if (m) return m[0];
  }
  return null;
}

// ── Scope Extraction ───────────────────────────────────────────
// Scope is the "how big / where / for whom" context.
const SCOPE_PATTERNS: RegExp[] = [
  // "team of 4 engineers", "team of 12"
  /team of \d+(?:\s+[a-z]+)?/i,
  // "4 engineers", "3 designers"
  /\b\d+\s+(engineers?|developers?|designers?|analysts?|stakeholders?|clients?|customers?|users?)\b/i,
  // "production", "staging", "prod"
  /\b(production|staging|prod)\b/i,
  // "enterprise", "company-wide", "org-wide"
  /\b(enterprise|company-wide|org-wide|cross-team|cross-functional)\b/i,
  // "for X customers", "across Y teams"
  /\b(?:for|across)\s+\d+\+?\s+[a-z]+/i,
];

function extractScope(text: string): string | null {
  for (const pat of SCOPE_PATTERNS) {
    const m = text.match(pat);
    if (m) return m[0];
  }
  return null;
}

// ── Project Tag Extraction ─────────────────────────────────────
// Capitalized multi-word phrase that looks like a product/project name.
// We skip common sentence-starting verbs/prepositions and known tech.
const SENTENCE_START_WORDS = new Set([
  "Built", "Created", "Designed", "Wrote", "Configured", "Shipped",
  "Refactored", "Migrated", "Reduced", "Improved", "Increased",
  "Tackled", "Implemented", "Integrated", "Developed", "Deployed",
  "Led", "Owned", "Automated", "Debugged", "Profiled",
  "The", "A", "An", "As", "During", "In", "On", "For", "Using",
]);

function extractProjectTag(text: string, techs: string[]): string | null {
  // Quoted names: "Payments Hub", 'Project Atlas'
  const quoted = text.match(/["'“]([A-Z][A-Za-z0-9 .-]{2,40})["'”]/);
  if (quoted) return quoted[1];

  // Sequence of 2+ capitalized words not starting the sentence
  const words = text.split(/\s+/);
  const techSet = new Set(techs.map((t) => t.toLowerCase()));

  for (let i = 1; i < words.length - 1; i++) {
    const w = words[i].replace(/[^A-Za-z0-9]/g, "");
    const next = words[i + 1]?.replace(/[^A-Za-z0-9]/g, "") || "";
    if (!w || !next) continue;
    if (!/^[A-Z]/.test(w) || !/^[A-Z]/.test(next)) continue;
    if (SENTENCE_START_WORDS.has(w) || SENTENCE_START_WORDS.has(next)) continue;
    if (techSet.has(w.toLowerCase()) || techSet.has(next.toLowerCase())) continue;
    return `${w} ${next}`;
  }

  return null;
}

// ── Action Verb ────────────────────────────────────────────────

function extractAction(text: string): string {
  const first = text.trim().split(/\s+/)[0] || "";
  const cleaned = first.replace(/[^A-Za-z]/g, "");
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

// ── Public API ─────────────────────────────────────────────────

export function buildBulletBrief(
  rawText: string,
  roleIndex: number,
  bulletIndex: number,
  extraTechs: string[] = [],
): BulletBrief {
  const technologies = extractTechnologies(rawText, extraTechs);
  const metric = extractMetric(rawText);
  const scope = extractScope(rawText);
  const projectTag = extractProjectTag(rawText, technologies);
  const action = extractAction(rawText);

  return {
    roleIndex,
    bulletIndex,
    rawText,
    action,
    technologies,
    scope,
    metric,
    projectTag,
    hasMetric: metric !== null,
  };
}

export function buildRoleBriefs(
  bullets: string[],
  roleIndex: number,
  extraTechs: string[] = [],
): BulletBrief[] {
  return bullets.map((b, i) => buildBulletBrief(b, roleIndex, i, extraTechs));
}
