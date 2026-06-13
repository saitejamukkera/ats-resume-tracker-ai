// src/validation/taxonomy/skill-graph.ts
// Curated tech skill ontology with INFERENCE edges — the core of Workday-like
// skill matching. Unlike the flat alias table in skill-variants.ts, this graph
// encodes "implies" relationships so a specific skill credits the general one:
//   React        ⇒ JavaScript, Frontend
//   Kubernetes   ⇒ Container Orchestration, Containers, DevOps
//   Spring Boot  ⇒ Spring, Java, Backend
//
// Direction convention: `implies` lists the MORE GENERAL skills that possessing
// THIS skill demonstrates. Matching only credits specific→general (having React
// proves Frontend), never general→specific (knowing JavaScript does NOT prove React).
//
// Deterministic, offline, zero API calls. General/umbrella skills (frontend,
// backend, container orchestration, …) exist as nodes too so JD phrases that use
// them resolve and can be satisfied by a more specific candidate skill.

export interface SkillNode {
  /** Canonical lowercase key. */
  canonical: string;
  /** Surface forms / synonyms (lowercase). Always includes the canonical key. */
  aliases: string[];
  /** More general skills this skill demonstrates (canonical keys). */
  implies: string[];
  /** Coarse grouping — used for diagnostics and future sibling logic. */
  category: string;
}

// ── Graph definition ────────────────────────────────────────────
// Authored as terse tuples [canonical, aliases, implies, category] then expanded.

type RawNode = [canonical: string, aliases: string[], implies: string[], category: string];

const RAW: RawNode[] = [
  // ── Umbrella / general targets (no implies; they ARE the general skill) ──
  ["frontend", ["frontend", "front-end", "front end", "ui development", "ui engineering"], [], "domain"],
  ["backend", ["backend", "back-end", "back end", "server-side"], [], "domain"],
  ["fullstack", ["fullstack", "full-stack", "full stack"], ["frontend", "backend"], "domain"],
  ["javascript", ["javascript", "js", "ecmascript"], [], "language"],
  ["typescript", ["typescript", "ts"], ["javascript"], "language"],
  ["java", ["java"], ["jvm"], "language"],
  ["jvm", ["jvm", "java virtual machine"], [], "platform"],
  ["python", ["python", "py"], [], "language"],
  ["c#", ["c#", "csharp", "c sharp"], [], "language"],
  ["c++", ["c++", "cpp"], [], "language"],
  ["go", ["go", "golang"], [], "language"],
  ["ruby", ["ruby"], [], "language"],
  ["php", ["php"], [], "language"],
  ["scala", ["scala"], ["jvm"], "language"],
  ["kotlin", ["kotlin"], ["jvm"], "language"],
  ["swift", ["swift"], [], "language"],
  ["dart", ["dart"], [], "language"],
  ["rust", ["rust"], [], "language"],
  ["css", ["css", "css3"], [], "language"],
  ["html", ["html", "html5"], [], "language"],
  ["sql", ["sql", "structured query language"], [], "language"],
  ["database", ["database", "databases", "rdbms"], [], "data"],
  ["nosql", ["nosql", "no-sql", "non-relational"], ["database"], "data"],
  ["caching", ["caching", "cache"], [], "data"],
  ["search", ["search", "full-text search"], [], "data"],
  ["cloud", ["cloud", "cloud computing"], [], "cloud"],
  ["serverless", ["serverless"], ["cloud"], "cloud"],
  ["containers", ["containers", "containerization", "containerize"], [], "devops"],
  ["container orchestration", ["container orchestration", "orchestration"], ["containers"], "devops"],
  ["devops", ["devops", "dev ops"], [], "devops"],
  ["ci/cd", ["ci/cd", "ci cd", "cicd", "continuous integration", "continuous deployment", "continuous delivery"], ["devops"], "devops"],
  ["infrastructure as code", ["infrastructure as code", "iac"], ["devops"], "devops"],
  ["configuration management", ["configuration management"], ["devops"], "devops"],
  ["monitoring", ["monitoring"], ["observability"], "observability"],
  ["observability", ["observability"], [], "observability"],
  ["logging", ["logging", "log aggregation"], ["observability"], "observability"],
  ["messaging", ["messaging", "message queue", "message broker", "message queues"], [], "messaging"],
  ["event streaming", ["event streaming", "event-driven", "streaming"], ["messaging"], "messaging"],
  ["big data", ["big data"], [], "data"],
  ["data engineering", ["data engineering"], [], "data"],
  ["data warehouse", ["data warehouse", "data warehousing"], ["database"], "data"],
  ["data analysis", ["data analysis", "data analytics"], [], "data"],
  ["machine learning", ["machine learning", "ml"], [], "ml"],
  ["deep learning", ["deep learning"], ["machine learning"], "ml"],
  ["llm", ["llm", "large language model", "large language models", "generative ai", "genai"], ["machine learning"], "ml"],
  ["nlp", ["nlp", "natural language processing"], ["machine learning"], "ml"],
  ["ai", ["ai", "artificial intelligence"], [], "ml"],
  ["api", ["api", "apis", "web services"], [], "api"],
  ["microservices", ["microservices", "micro-services", "microservice"], ["backend", "distributed systems"], "architecture"],
  ["distributed systems", ["distributed systems"], [], "architecture"],
  ["architecture", ["architecture", "software architecture", "system design"], [], "architecture"],
  ["authentication", ["authentication", "authn", "identity"], ["security"], "security"],
  ["security", ["security", "application security", "appsec"], [], "security"],
  ["mobile", ["mobile", "mobile development"], [], "mobile"],
  ["testing", ["testing", "qa", "quality assurance"], [], "testing"],
  ["e2e testing", ["e2e testing", "end-to-end testing", "end to end testing"], ["testing"], "testing"],
  ["orm", ["orm", "object relational mapping"], [], "backend"],
  ["methodology", ["methodology"], [], "methodology"],
  ["agile", ["agile"], ["methodology"], "methodology"],
  ["graph database", ["graph database"], ["database"], "data"],

  // ── Languages handled above; now specific tools/frameworks ──
  // Frontend
  ["react", ["react", "react.js", "reactjs"], ["javascript", "frontend"], "frontend"],
  ["vue", ["vue", "vue.js", "vuejs"], ["javascript", "frontend"], "frontend"],
  ["angular", ["angular", "angularjs", "angular.js"], ["typescript", "javascript", "frontend"], "frontend"],
  ["next.js", ["next.js", "nextjs", "next"], ["react", "javascript", "frontend"], "frontend"],
  ["svelte", ["svelte", "sveltekit"], ["javascript", "frontend"], "frontend"],
  ["redux", ["redux", "redux toolkit"], ["react", "javascript", "frontend"], "frontend"],
  ["tailwind", ["tailwind", "tailwind css", "tailwindcss"], ["css", "frontend"], "frontend"],
  ["bootstrap", ["bootstrap"], ["css", "frontend"], "frontend"],
  ["jquery", ["jquery"], ["javascript", "frontend"], "frontend"],

  // Backend / frameworks
  ["node.js", ["node.js", "node", "nodejs"], ["javascript", "backend"], "backend"],
  ["express", ["express", "express.js", "expressjs"], ["node.js", "javascript", "backend"], "backend"],
  ["nestjs", ["nestjs", "nest.js"], ["node.js", "typescript", "backend"], "backend"],
  ["spring", ["spring", "spring framework"], ["java", "backend"], "backend"],
  ["spring boot", ["spring boot", "springboot"], ["spring", "java", "backend"], "backend"],
  ["hibernate", ["hibernate"], ["orm", "java", "backend"], "backend"],
  ["jpa", ["jpa"], ["orm", "java"], "backend"],
  ["django", ["django"], ["python", "backend"], "backend"],
  ["flask", ["flask"], ["python", "backend"], "backend"],
  ["fastapi", ["fastapi", "fast api"], ["python", "backend", "api"], "backend"],
  ["rails", ["rails", "ruby on rails"], ["ruby", "backend"], "backend"],
  ["laravel", ["laravel"], ["php", "backend"], "backend"],
  [".net", [".net", "dotnet"], ["c#", "backend"], "backend"],
  ["asp.net", ["asp.net", "asp net"], [".net", "c#", "backend"], "backend"],

  // Databases
  ["postgresql", ["postgresql", "postgres", "psql"], ["sql", "database"], "data"],
  ["mysql", ["mysql", "my sql"], ["sql", "database"], "data"],
  ["mssql", ["mssql", "ms sql", "sql server", "microsoft sql server"], ["sql", "database"], "data"],
  ["oracle", ["oracle", "oracle db", "oracle database"], ["sql", "database"], "data"],
  ["sqlite", ["sqlite", "sql lite"], ["sql", "database"], "data"],
  ["mongodb", ["mongodb", "mongo"], ["nosql", "database"], "data"],
  ["dynamodb", ["dynamodb", "dynamo db"], ["nosql", "database"], "data"],
  ["cassandra", ["cassandra"], ["nosql", "database"], "data"],
  ["redis", ["redis"], ["nosql", "caching", "database"], "data"],
  ["elasticsearch", ["elasticsearch", "elastic search"], ["search", "database"], "data"],
  ["neo4j", ["neo4j"], ["graph database", "database"], "data"],
  ["snowflake", ["snowflake"], ["data warehouse", "database"], "data"],

  // Cloud
  ["aws", ["aws", "amazon web services"], ["cloud"], "cloud"],
  ["gcp", ["gcp", "google cloud", "google cloud platform"], ["cloud"], "cloud"],
  ["azure", ["azure", "microsoft azure"], ["cloud"], "cloud"],
  ["ec2", ["ec2"], ["aws", "cloud"], "cloud"],
  ["s3", ["s3"], ["aws", "cloud"], "cloud"],
  ["lambda", ["lambda", "aws lambda"], ["aws", "serverless", "cloud"], "cloud"],
  ["eks", ["eks"], ["aws", "kubernetes", "cloud"], "cloud"],
  ["ecs", ["ecs"], ["aws", "containers", "cloud"], "cloud"],

  // DevOps / infra
  ["docker", ["docker"], ["containers", "devops"], "devops"],
  ["kubernetes", ["kubernetes", "k8s"], ["container orchestration", "containers", "devops"], "devops"],
  ["helm", ["helm"], ["kubernetes", "container orchestration", "devops"], "devops"],
  ["terraform", ["terraform"], ["infrastructure as code", "devops", "cloud"], "devops"],
  ["ansible", ["ansible"], ["configuration management", "infrastructure as code", "devops"], "devops"],
  ["jenkins", ["jenkins"], ["ci/cd", "devops"], "devops"],
  ["github actions", ["github actions", "gh actions"], ["ci/cd", "devops"], "devops"],
  ["gitlab ci", ["gitlab ci", "gitlab-ci"], ["ci/cd", "devops"], "devops"],
  ["circleci", ["circleci", "circle ci"], ["ci/cd", "devops"], "devops"],
  ["argo cd", ["argo cd", "argocd"], ["ci/cd", "kubernetes", "devops"], "devops"],

  // Messaging / data
  ["kafka", ["kafka", "apache kafka"], ["event streaming", "messaging"], "messaging"],
  ["rabbitmq", ["rabbitmq", "rabbit mq"], ["messaging"], "messaging"],
  ["sqs", ["sqs", "amazon sqs"], ["messaging", "aws"], "messaging"],
  ["pulsar", ["pulsar", "apache pulsar"], ["event streaming", "messaging"], "messaging"],
  ["spark", ["spark", "apache spark"], ["big data", "data engineering"], "data"],
  ["hadoop", ["hadoop", "apache hadoop"], ["big data", "data engineering"], "data"],
  ["airflow", ["airflow", "apache airflow"], ["data engineering"], "data"],
  ["databricks", ["databricks"], ["big data", "data engineering", "spark"], "data"],
  ["pandas", ["pandas"], ["python", "data analysis"], "data"],
  ["numpy", ["numpy", "num py"], ["python", "data analysis"], "data"],

  // ML
  ["pytorch", ["pytorch", "torch"], ["deep learning", "machine learning", "python"], "ml"],
  ["tensorflow", ["tensorflow", "tensor flow"], ["deep learning", "machine learning", "python"], "ml"],
  ["scikit-learn", ["scikit-learn", "sklearn", "scikit learn"], ["machine learning", "python"], "ml"],
  ["langchain", ["langchain"], ["llm", "ai", "python"], "ml"],

  // API
  ["graphql", ["graphql", "graph ql"], ["api"], "api"],
  ["grpc", ["grpc", "g rpc"], ["api"], "api"],
  ["rest", ["rest", "restful", "rest api", "restful api", "rest apis"], ["api"], "api"],
  ["websocket", ["websocket", "web socket", "ws"], ["api"], "api"],
  ["oauth2", ["oauth2", "oauth", "oauth 2.0"], ["authentication", "security"], "security"],
  ["jwt", ["jwt", "json web token"], ["authentication", "security"], "security"],

  // Mobile
  ["react native", ["react native", "reactnative", "react-native"], ["react", "javascript", "mobile"], "mobile"],
  ["flutter", ["flutter"], ["dart", "mobile"], "mobile"],
  ["android", ["android"], ["mobile"], "mobile"],
  ["ios", ["ios"], ["swift", "mobile"], "mobile"],

  // Testing
  ["jest", ["jest"], ["testing", "javascript"], "testing"],
  ["mocha", ["mocha"], ["testing", "javascript"], "testing"],
  ["cypress", ["cypress"], ["e2e testing", "testing", "javascript"], "testing"],
  ["playwright", ["playwright"], ["e2e testing", "testing"], "testing"],
  ["selenium", ["selenium"], ["e2e testing", "testing"], "testing"],
  ["junit", ["junit", "j unit"], ["testing", "java"], "testing"],
  ["pytest", ["pytest", "py test"], ["testing", "python"], "testing"],
  ["mockito", ["mockito"], ["testing", "java"], "testing"],

  // Methodology
  ["scrum", ["scrum", "sprint"], ["agile", "methodology"], "methodology"],
  ["kanban", ["kanban"], ["agile", "methodology"], "methodology"],
  ["tdd", ["tdd", "test driven development", "test-driven development"], ["testing", "methodology"], "methodology"],
  ["bdd", ["bdd", "behavior driven development"], ["testing", "methodology"], "methodology"],

  // Observability tools
  ["prometheus", ["prometheus"], ["monitoring", "observability", "devops"], "observability"],
  ["grafana", ["grafana"], ["monitoring", "observability"], "observability"],
  ["datadog", ["datadog", "data dog"], ["monitoring", "observability"], "observability"],
  ["splunk", ["splunk"], ["monitoring", "logging", "observability"], "observability"],
];

// ── Build maps ──────────────────────────────────────────────────

export const SKILL_GRAPH: Record<string, SkillNode> = {};
const ALIAS_TO_CANONICAL = new Map<string, string>();

for (const [canonical, aliases, implies, category] of RAW) {
  const allAliases = [...new Set([canonical, ...aliases].map((a) => a.toLowerCase()))];
  SKILL_GRAPH[canonical] = { canonical, aliases: allAliases, implies, category };
  for (const a of allAliases) {
    if (!ALIAS_TO_CANONICAL.has(a)) ALIAS_TO_CANONICAL.set(a, canonical);
  }
}

// ── Public helpers ──────────────────────────────────────────────

/** Resolve any surface skill form to its canonical key, or null if unknown. */
export function resolveCanonical(skill: string): string | null {
  return ALIAS_TO_CANONICAL.get(skill.toLowerCase().trim()) ?? null;
}

/** All alias surface forms for a skill (for lexical matching). */
export function getGraphAliases(skill: string): string[] {
  const canonical = resolveCanonical(skill);
  return canonical ? SKILL_GRAPH[canonical].aliases : [];
}

/**
 * Transitive closure of skills `skill` demonstrates (specific→general),
 * including the skill's own canonical key. Depth-limited to avoid cycles.
 */
export function getImplied(skill: string): Set<string> {
  const out = new Set<string>();
  const canonical = resolveCanonical(skill);
  if (!canonical) return out;

  const stack = [canonical];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    const node = SKILL_GRAPH[cur];
    if (node) {
      for (const imp of node.implies) stack.push(imp);
    }
  }
  return out;
}

/**
 * Does possessing `haveSkill` demonstrate `wantSkill`?
 * True when they share a canonical form, or when haveSkill's implied-closure
 * contains wantSkill's canonical (specific proves general). Never the reverse.
 */
export function impliesSkill(haveSkill: string, wantSkill: string): boolean {
  const want = resolveCanonical(wantSkill);
  if (!want) return false;
  return getImplied(haveSkill).has(want);
}

/** Coarse category for a skill, or null if unknown. */
export function getCategory(skill: string): string | null {
  const canonical = resolveCanonical(skill);
  return canonical ? SKILL_GRAPH[canonical].category : null;
}

/** Every alias across the graph — used to scan resume text for present skills. */
export function allGraphAliases(): Array<{ alias: string; canonical: string }> {
  return [...ALIAS_TO_CANONICAL.entries()].map(([alias, canonical]) => ({
    alias,
    canonical,
  }));
}
