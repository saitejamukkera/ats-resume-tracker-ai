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
}

export function detectSignals(text: string, jdKeywords: string[] = []): ImpactSignals {
  return {
    hasPercentage:     /\d+%|\d+x|\d+X/.test(text),
    hasNumber:         /\d/.test(text),
    hasComparison:     /(?:cut|reduced|improved|increased|dropped|lowered|boosted|decreased|saved|eliminated).{0,40}?\d+%|from\s+\S+\s+to\s+\S+|by\s+\d+|versus|compared to|(?:down|up)\s+from/i.test(text),
    hasScaleIndicator: /\d+\s*(K|M|B|\+|k)\b|\d{4,}|million|thousand|enterprise|production|company-wide/i.test(text),
    hasImpactVerb:     /\b(reduced|improved|increased|decreased|eliminated|stabilized|streamlined|accelerated|automated|consolidated|optimized|simplified|migrated|resolved|prevented|scaled|cut|halved|doubled|minimized|maximized|redesigned|overhauled|established)\b/i.test(text),
    hasCausality:      /\b(by\s+\w+ing|by\s+\w+\s+\w+ing|using|through|via|,\s*(cutting|reducing|improving|saving|dropping|lowering|boosting|preventing|eliminating|slashing))\b/i.test(text),
    hasResultClause:   /(resulting in|leading to|which\s+(reduced|improved|enabled|saved|cut)|saving|enabling|achieving|,\s*(cutting|reducing|improving|saving|dropping|lowering|boosting|preventing|eliminating|slashing|enabling|removing))/i.test(text),
    hasTech:           detectTech(text, jdKeywords),
    hasTimeframe:      /\b(in\s+\d+\s+(days|weeks|months|sprints)|within\s+Q\d|over\s+\d+\s+months|per\s+(day|week|month|sprint))\b/i.test(text),
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

  return Math.min(score, 100);
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

  if (strength === 'none') {
    return `This bullet shows no impact. Tip: ${scaleQuestions[category]}`;
  }

  if (strength === 'weak') {
    if (!signals.hasImpactVerb)
      return 'Start with a strong impact verb: reduced, eliminated, automated, streamlined...';
    if (!signals.hasCausality)
      return 'Add causality: HOW did you achieve this? "by implementing...", "using...", "through..."';
    return `Add scope: ${scaleQuestions[category]}`;
  }

  // medium
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

  let health: RoleImpactProfile['health'];
  if (distribution.none > 0)                                                health = 'poor';
  else if (credibilityFlags.length > 2)                                     health = 'needs-work';
  else if (strongRatio >= 0.4 && categoryCoverage.length >= 3)              health = 'excellent';
  else if (strongRatio >= 0.25)                                             health = 'good';
  else                                                                      health = 'needs-work';

  return {
    roleName, bullets: analyzed, distribution,
    categoryCoverage, credibilityFlags, overallScore, health,
  };
}
