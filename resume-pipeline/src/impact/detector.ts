// src/impact/detector.ts
// Impact Detection System (IDS) — deterministic, 0 LLM calls.
// Classifies, scores, and generates repair guidance for every bullet.

// ── Signal Detection ───────────────────────────────────────────

export interface ImpactSignals {
  hasPercentage: boolean;
  hasNumber: boolean;
  hasComparison: boolean;
  hasScaleIndicator: boolean;
  hasImpactVerb: boolean;
  hasCausality: boolean;
  hasResultClause: boolean;
  hasTech: boolean;
  hasTimeframe: boolean;
  hasOutcome: boolean;
  isOutcomeFirst: boolean;
  fillerPatternCount: number;
  isDescriptionOnly: boolean;
}

// Filler patterns that add no value — "using data structures and algorithms",
// "during sprint planning" (as padding), "using system design principles", etc.
const FILLER_PATTERNS = [
  /\busing (?:data structures(?: and algorithms)?|system design principles?|design patterns?|best practices|industry (?:best )?practices)\b/i,
  /\bwith (?:system design principles?|best practices|industry standards)\b/i,
  /\b(?:collaborated|partnered|worked) with (?:cross-functional |)(?:teams?|stakeholders|colleagues)\b/i,
  /\bparticipated in (?:agile|scrum|daily standups?|ceremonies)\b/i,
  /\badhering to (?:coding standards|best practices|team standards)\b/i,
  /\bfollowing (?:agile|scrum) (?:methodology|practices|principles)\b/i,
  /\bin an? (?:agile|scrum) environment\b/i,
  /\bcontribut(?:ed|ing) to (?:team|project) (?:success|goals|objectives)\b/i,
  /\bensur(?:ed|ing) (?:code quality|high quality|quality standards)\b/i,
  /\b(?:various|multiple|different) (?:tasks|projects|responsibilities|aspects)\b/i,
  /\bday-to-day (?:operations|tasks|activities)\b/i,
];

// Outcome patterns: the bullet communicates a measurable or clear result
const OUTCOME_PATTERN = /\b(reduc|improv|increas|decreas|eliminat|cut|halv|doubl|sav|enabl|achiev|boost|lower|rais|accelerat|prevent|stabili|drop|shrink|trim|minimiz|maximiz)\w*\s+.{3,}?\b(by|from|to|across|per|within|under|below|above)\b/i;

// Outcome-first: bullet STARTS with the outcome/impact
const OUTCOME_FIRST_PATTERN = /^(reduced|improved|increased|decreased|eliminated|cut|halved|doubled|stabilized|lowered|raised|accelerated|prevented|minimized|maximized|dropped|trimmed|boosted|shortened|shrank|saved|achieved|delivered|brought)\b/i;

// Description-only: action verb + tech/what, but NO outcome/result/impact
const DESCRIPTION_ONLY_INDICATORS = [
  /^(developed|built|created|designed|implemented|configured|set up|wrote|worked on|contributed to|maintained|managed|handled|supported|assisted)\b/i,
];

function isDescriptionOnly(text: string, signals: Omit<ImpactSignals, 'hasOutcome' | 'isOutcomeFirst' | 'fillerPatternCount' | 'isDescriptionOnly'>): boolean {
  const startsWithDescription = DESCRIPTION_ONLY_INDICATORS.some(p => p.test(text.trim()));
  if (!startsWithDescription) return false;
  const hasAnyOutcome = signals.hasPercentage || signals.hasComparison || signals.hasResultClause || OUTCOME_PATTERN.test(text);
  return !hasAnyOutcome;
}

export function detectSignals(text: string, jdKeywords: string[] = []): ImpactSignals {
  const baseSignals = {
    hasPercentage:     /\d+%|\d+x|\d+X/.test(text),
    hasNumber:         /\d/.test(text),
    hasComparison:     /from\s+\S+\s+to\s+\S+|by\s+\d|versus|compared to/i.test(text),
    hasScaleIndicator: /\d+\s*(K|M|B|\+|k)\b|\d{4,}|million|thousand|enterprise|production|company-wide/i.test(text),
    hasImpactVerb:     /\b(reduced|improved|increased|decreased|eliminated|stabilized|streamlined|accelerated|automated|consolidated|optimized|simplified|migrated|resolved|prevented|scaled|cut|halved|doubled|minimized|maximized|redesigned|overhauled|established)\b/i.test(text),
    hasCausality:      /\b(by\s+(implementing|building|creating|designing|introducing|migrating|refactoring|writing|deploying|adding|configuring|integrating|developing|leveraging|using|adopting)|using|through|via)\b/i.test(text),
    hasResultClause:   /resulting in|leading to|which\s+(reduced|improved|enabled|saved|cut)|saving|enabling|achieving/i.test(text),
    hasTech:           detectTech(text, jdKeywords),
    hasTimeframe:      /\b(in\s+\d+\s+(days|weeks|months|sprints)|within\s+Q\d|over\s+\d+\s+months|per\s+(day|week|month|sprint))\b/i.test(text),
  };

  const fillerPatternCount = FILLER_PATTERNS.filter(p => p.test(text)).length;
  const hasOutcome = OUTCOME_PATTERN.test(text) || baseSignals.hasComparison || baseSignals.hasResultClause;

  return {
    ...baseSignals,
    hasOutcome,
    isOutcomeFirst: OUTCOME_FIRST_PATTERN.test(text.trim()),
    fillerPatternCount,
    isDescriptionOnly: isDescriptionOnly(text, baseSignals),
  };
}

// ── Dynamic Tech Detection ─────────────────────────────────────

const BASE_TECH = [
  'Redis', 'Kafka', 'Kubernetes', 'Docker', 'Terraform', 'AWS', 'GCP', 'Azure',
  'PostgreSQL', 'MongoDB', 'React', 'Spring', 'Jenkins', 'GitHub Actions',
  'CircleCI', 'Datadog', 'Grafana', 'Elasticsearch', 'RabbitMQ', 'GraphQL',
  'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'Node.js', 'Next.js',
  'REST', 'API', 'SQL', 'NoSQL', 'MySQL', 'DynamoDB', 'S3', 'Lambda',
  'Microservices', 'CI/CD', 'Nginx', 'Express', 'Flask', 'Django',
];

function detectTech(text: string, jdKeywords: string[]): boolean {
  const allTech = [...new Set([...BASE_TECH, ...jdKeywords])];
  return allTech.some(tech =>
    new RegExp(`\\b${tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
  );
}

// ── Impact Scoring ─────────────────────────────────────────────

export function scoreBulletImpact(signals: ImpactSignals): number {
  let score = 0;

  // Specificity signals
  if (signals.hasPercentage)     score += 20;
  else if (signals.hasNumber)    score += 12;

  // Cause → Effect
  if (signals.hasCausality)      score += 15;
  if (signals.hasComparison)     score += 20;
  if (signals.hasResultClause)   score += 12;

  // Context signals
  if (signals.hasImpactVerb)     score += 18;
  if (signals.hasScaleIndicator) score += 12;
  if (signals.hasTech)           score += 5;
  if (signals.hasTimeframe)      score += 5;

  // Outcome-first bonus: bullets that LEAD with impact are Tier A material
  if (signals.isOutcomeFirst)    score += 8;
  else if (signals.hasOutcome)   score += 3;

  // Filler penalty: each filler pattern dilutes the bullet's signal
  score -= signals.fillerPatternCount * 8;

  // Description-only penalty: action+tech but no outcome is Tier C
  if (signals.isDescriptionOnly) score -= 15;

  return Math.max(0, Math.min(score, 100));
}

export type ImpactStrength = 'strong' | 'medium' | 'weak' | 'none';

export function classifyStrength(score: number): ImpactStrength {
  if (score >= 55) return 'strong';
  if (score >= 30) return 'medium';
  if (score >= 12) return 'weak';
  return 'none';
}

// ── Impact Categories ──────────────────────────────────────────

export type ImpactCategory =
  | 'performance' | 'scale'      | 'cost'
  | 'reliability' | 'automation' | 'quality'
  | 'delivery'    | 'team'       | 'security'
  | 'uncategorized';

export function detectCategory(text: string): ImpactCategory {
  const patterns: [ImpactCategory, RegExp][] = [
    ['performance',  /latency|response time|throughput|load time|cache|speed|p95|p99|faster|bottleneck|optimize/i],
    ['scale',        /users|traffic|requests|concurrent|volume|capacity|TPS|RPS|QPS|peak|handles?\s+\d/i],
    ['cost',         /cost|budget|savings?|spend|utilization|ROI|\$|billing|infrastructure.*(reduc|optim)/i],
    ['reliability',  /uptime|downtime|incidents?|on-?call|error rate|failure|monitoring|SLA|SLO|availability|outage/i],
    ['automation',   /automat|manual|pipeline|CI\/CD|deploy|workflow|script|self-?service|hands-?free/i],
    ['quality',      /test|coverage|bug|defect|code review|refactor|lint|technical debt|maintainab|flaky/i],
    ['delivery',     /ship|release|sprint|deadline|time-?to-?market|launch|feature flag|rollout|deliver/i],
    ['team',         /mentor|onboard|interview|documentation|knowledge|cross-?functional|collaborate|hire/i],
    ['security',     /security|vulnerability|CVE|auth|encryption|compliance|OWASP|SOC|HIPAA|PCI/i],
  ];

  for (const [category, pattern] of patterns) {
    if (pattern.test(text)) return category;
  }
  return 'uncategorized';
}

// ── Category Value for Engineering Roles ────────────────────────
// Not all impact categories are equal on a resume. A recruiter for a
// backend/payments role cares about performance, scale, reliability,
// and security. Process work (PR reviews, sprint ceremonies) and
// generic quality bullets (defect counts, test coverage without
// system-level framing) are low-value — they describe doing your job,
// not improving the system.
//
// This multiplier is applied by the bullet ranker so that a "Cut PR
// review cycle time by 27%" bullet (delivery, 0.5x) ranks below
// "Dropped P95 latency from 850ms to 500ms" (performance, 1.2x)
// even when the raw IDS + JD relevance scores are similar.

const CATEGORY_VALUE: Record<ImpactCategory, number> = {
  performance:    1.2,   // latency, throughput, cache — top-tier
  scale:          1.2,   // users, requests, transactions — top-tier
  reliability:    1.15,  // uptime, fault tolerance, incidents
  security:       1.1,   // auth, encryption, compliance
  cost:           1.05,  // savings, efficiency
  automation:     0.9,   // CI/CD, pipelines — supporting
  quality:        0.7,   // test coverage, defects — low value unless system-framed
  delivery:       0.6,   // sprints, releases, PR cycle time — process work
  team:           0.5,   // mentoring, collaboration — lowest value on eng resume
  uncategorized:  0.8,
};

export function categoryValueMultiplier(category: ImpactCategory): number {
  return CATEGORY_VALUE[category] ?? 0.8;
}

/**
 * Returns true if the category is considered low-value for engineering
 * resumes. Used by the validator to flag resume-wide category imbalance.
 */
export function isLowValueCategory(category: ImpactCategory): boolean {
  return (CATEGORY_VALUE[category] ?? 0.8) < 0.75;
}

// ── Credibility Check ──────────────────────────────────────────

export interface CredibilityResult {
  plausible: boolean;
  flags: string[];
}

export function checkCredibility(text: string, candidateLevel: 'entry' | 'mid' | 'senior'): CredibilityResult {
  const flags: string[] = [];

  if (/\b([2-9]\d|\d{3,})x\b/i.test(text) && candidateLevel !== 'senior') {
    flags.push('Large multiplier claim — unusual for ' + candidateLevel + ' level');
  }
  if (/\b9[5-9]%/.test(text) && !/uptime|availability|SLA/.test(text)) {
    flags.push('95%+ improvement — suspicious outside uptime/SLA');
  }
  if (/\b100%/.test(text) && !/test coverage|uptime/.test(text)) {
    flags.push('100% claim — rarely plausible outside test coverage/uptime');
  }
  if (/\$\d{2,}M|\$\d+\s*billion/i.test(text) && candidateLevel !== 'senior') {
    flags.push('Enterprise-scale financial claim for ' + candidateLevel + ' level');
  }
  if (/\b(revolutionized|transformed the entire|single-handedly)\b/i.test(text)) {
    flags.push('Executive-level language — inappropriate for IC role');
  }

  return { plausible: flags.length === 0, flags };
}

// ── Context-Aware Suggestions ──────────────────────────────────

export function generateSuggestion(
  strength: ImpactStrength,
  signals: ImpactSignals,
  category: ImpactCategory,
): string | undefined {
  if (strength === 'strong') return undefined;

  const scaleQuestions: Record<string, string> = {
    performance:   'how much faster? what was the before/after latency?',
    scale:         'how many users/requests/records does this system handle?',
    cost:          'how much money/time was saved?',
    reliability:   'how many incidents were prevented? what was the uptime improvement?',
    automation:    'how many hours of manual work were eliminated per week?',
    quality:       'what was the test coverage change? how many bugs were caught?',
    delivery:      'how much faster did features ship?',
    team:          'how many people were mentored/onboarded?',
    security:      'how many vulnerabilities were fixed?',
    uncategorized: 'what was the measurable outcome of this work?',
  };

  // Filler patterns are always worth calling out
  if (signals.fillerPatternCount > 0) {
    return 'Remove filler phrases ("using data structures", "in an agile environment", "collaborated with teams"). Replace with specific outcome or tech detail.';
  }

  // Description-only bullets need an outcome
  if (signals.isDescriptionOnly) {
    return `This bullet describes WHAT you did but not WHAT CHANGED. Lead with the outcome: "Reduced X by Y%" or "Cut Z from A to B". Then explain how. Tip: ${scaleQuestions[category]}`;
  }

  if (strength === 'none') {
    return `This bullet shows no impact. Rewrite as outcome-first: "Reduced/Improved/Cut [metric] by [amount] by [action]". Tip: ${scaleQuestions[category]}`;
  }

  if (strength === 'weak') {
    if (!signals.hasOutcome)
      return 'Add a clear outcome. Stop describing work, start proving results: "Reduced latency by 35%" not "Configured Redis caching".';
    if (!signals.hasImpactVerb)
      return 'Start with a strong impact verb: reduced, eliminated, automated, streamlined...';
    if (!signals.hasCausality)
      return 'Add causality: HOW did you achieve this? "by implementing...", "using...", "through..."';
    return `Add scope: ${scaleQuestions[category]}`;
  }

  // medium — push toward Tier A
  if (!signals.isOutcomeFirst && signals.hasOutcome)
    return 'Restructure to lead with outcome: "Reduced P95 latency from 850ms to 500ms by..." instead of "Configured Redis caching, reducing..."';
  if (!signals.hasCausality) return 'Add causality: "...by implementing X" or "...using Y"';
  if (!signals.hasComparison) return 'Add a before→after comparison: "from X to Y"';
  if (!signals.hasScaleIndicator) return `Add scale: ${scaleQuestions[category]}`;

  return undefined;
}

// ── Bullet Analysis (putting it together) ──────────────────────

export interface BulletImpactAnalysis {
  text: string;
  signals: ImpactSignals;
  score: number;
  strength: ImpactStrength;
  category: ImpactCategory;
  credibility: CredibilityResult;
  suggestion?: string;
}

export function analyzeBullet(
  text: string,
  jdKeywords: string[],
  candidateLevel: 'entry' | 'mid' | 'senior',
): BulletImpactAnalysis {
  const signals = detectSignals(text, jdKeywords);
  const score = scoreBulletImpact(signals);
  const strength = classifyStrength(score);
  const category = detectCategory(text);
  const credibility = checkCredibility(text, candidateLevel);
  const suggestion = generateSuggestion(strength, signals, category);

  return { text, signals, score, strength, category, credibility, suggestion };
}

// ── Role-Level Profile ─────────────────────────────────────────

export interface RoleImpactProfile {
  roleName: string;
  bullets: BulletImpactAnalysis[];
  distribution: { strong: number; medium: number; weak: number; none: number };
  categoryCoverage: ImpactCategory[];
  credibilityFlags: string[];
  overallScore: number;
  health: 'excellent' | 'good' | 'needs-work' | 'poor';
}

export function profileRoleImpact(
  roleName: string,
  bullets: string[],
  jdKeywords: string[],
  candidateLevel: 'entry' | 'mid' | 'senior',
): RoleImpactProfile {
  const analyzed = bullets.map(text => analyzeBullet(text, jdKeywords, candidateLevel));

  const distribution = {
    strong: analyzed.filter(b => b.strength === 'strong').length,
    medium: analyzed.filter(b => b.strength === 'medium').length,
    weak:   analyzed.filter(b => b.strength === 'weak').length,
    none:   analyzed.filter(b => b.strength === 'none').length,
  };

  const categoryCoverage = [...new Set(
    analyzed.map(b => b.category).filter(c => c !== 'uncategorized')
  )] as ImpactCategory[];

  const credibilityFlags = analyzed.flatMap(b => b.credibility.flags);

  const overallScore = bullets.length > 0
    ? Math.round(analyzed.reduce((sum, b) => sum + b.score, 0) / bullets.length)
    : 0;

  const total = bullets.length;
  const strongRatio = total > 0 ? distribution.strong / total : 0;
  const descOnlyCount = analyzed.filter(b => b.signals.isDescriptionOnly).length;

  let health: RoleImpactProfile['health'];
  if (distribution.none > 0 || descOnlyCount > total * 0.3)                health = 'poor';
  else if (credibilityFlags.length > 2)                                     health = 'needs-work';
  else if (strongRatio >= 0.4 && categoryCoverage.length >= 3)              health = 'excellent';
  else if (strongRatio >= 0.25)                                             health = 'good';
  else                                                                      health = 'needs-work';

  return {
    roleName, bullets: analyzed, distribution,
    categoryCoverage, credibilityFlags, overallScore, health,
  };
}
