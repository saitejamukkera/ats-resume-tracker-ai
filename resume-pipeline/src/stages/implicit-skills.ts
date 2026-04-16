// src/stages/implicit-skills.ts
//
// Implicit-skill adjacency graph (deterministic, 0 LLM calls).
//
// Many JD skills are not listed verbatim in a candidate's base resume
// but are universally implied by the tech they DO list. Examples:
//   - A Spring Boot developer implicitly knows J2EE, REST API
//     development, Mockito, servlet APIs, and MVC.
//   - A PostgreSQL user implicitly knows Relational DB and SQL.
//   - A Kafka user implicitly knows Messaging and Event Systems.
//   - A Redis user implicitly knows NoSQL and caching.
//   - Docker + GitHub Actions together imply DevOps.
//
// Naming these in the Summary / Skills section is honest and expected
// by recruiters — it's NOT fabrication. Pure string-match "is this in
// the base resume" is too literal and fails candidates on ATS for
// skills they demonstrably have.
//
// The rule: we only expand into skills that are *universally implied*
// by the explicit tech. Discrete products that a candidate has not
// touched (Grafana, Elasticsearch, Kibana, Logstash) stay OFF the
// resume unless they appear in the base resume literally.

const SKILL_ADJACENCY: Record<string, string[]> = {
  // Spring / Java ecosystem ------------------------------------------------
  "spring boot": [
    "j2ee", "jakarta ee", "java ee",
    "rest", "rest api", "rest apis", "rest api development", "rest api design",
    "restful", "restful api", "restful apis", "restful api development",
    "servlet", "servlet api",
    "dependency injection", "di",
    "mvc",
    "mockito",
    "backend development",
    "microservices",
  ],
  spring: [
    "dependency injection", "di",
    "aop",
    "mvc",
  ],
  "spring mvc": [
    "rest", "rest api", "rest apis", "rest api development",
    "mvc", "http", "servlet",
  ],
  "spring data jpa": [
    "jpa", "hibernate", "orm",
    "relational database", "relational db", "sql", "rdbms",
  ],
  "spring security": [
    "authentication", "authorization", "security",
    "jwt", "oauth",
  ],
  junit: ["unit testing", "mockito", "tdd", "test-driven development"],
  java: ["jvm", "oop", "object-oriented programming"],

  // Messaging / event systems ---------------------------------------------
  kafka: [
    "messaging", "messaging and event systems", "message broker",
    "event systems", "event-driven", "event-driven architecture",
    "pub/sub", "pubsub", "streaming", "message queues",
    "distributed messaging", "event streaming",
  ],
  rabbitmq: [
    "messaging", "event systems", "message broker", "pub/sub", "amqp",
  ],
  activemq: ["messaging", "jms", "message broker"],
  sqs: ["messaging", "pub/sub", "queue"],
  sns: ["messaging", "pub/sub", "notification service"],

  // Relational databases --------------------------------------------------
  postgresql: ["relational database", "relational db", "sql", "rdbms"],
  postgres: ["relational database", "relational db", "sql", "rdbms"],
  mysql: ["relational database", "relational db", "sql", "rdbms"],
  oracle: ["relational database", "relational db", "sql", "rdbms"],
  "oracle db": ["relational database", "relational db", "sql", "rdbms"],
  "sql server": ["relational database", "relational db", "sql", "rdbms"],
  sqlserver: ["relational database", "relational db", "sql", "rdbms"],
  mssql: ["relational database", "relational db", "sql", "rdbms"],
  sqlite: ["relational database", "relational db", "sql"],

  // NoSQL -----------------------------------------------------------------
  mongodb: ["nosql", "nosql db", "nosql database", "document store"],
  mongo: ["nosql", "nosql db", "nosql database", "document store"],
  cassandra: ["nosql", "nosql db", "nosql database", "wide-column store"],
  dynamodb: ["nosql", "nosql db", "nosql database", "key-value store"],
  redis: ["nosql", "nosql db", "nosql database", "caching", "key-value store"],
  memcached: ["nosql", "caching", "key-value store"],

  // Containers ------------------------------------------------------------
  docker: ["containerization", "devops"],
  kubernetes: ["container orchestration", "devops"],
  k8s: ["container orchestration", "devops"],
  ecs: ["container orchestration", "devops"],
  eks: ["container orchestration", "devops"],

  // CI/CD -----------------------------------------------------------------
  jenkins: ["ci/cd", "continuous integration", "continuous deployment", "devops"],
  "github actions": ["ci/cd", "continuous integration", "continuous deployment", "devops"],
  "gitlab ci": ["ci/cd", "continuous integration", "continuous deployment", "devops"],
  circleci: ["ci/cd", "continuous integration", "continuous deployment", "devops"],
  travis: ["ci/cd", "continuous integration", "devops"],
  "travis ci": ["ci/cd", "continuous integration", "devops"],

  // IaC / config mgmt -----------------------------------------------------
  terraform: ["infrastructure as code", "iac", "devops"],
  ansible: ["configuration management", "devops"],
  cloudformation: ["infrastructure as code", "iac", "devops"],

  // Clouds ----------------------------------------------------------------
  aws: ["cloud", "public cloud"],
  gcp: ["cloud", "public cloud"],
  "google cloud": ["cloud", "public cloud"],
  azure: ["cloud", "public cloud"],
  lambda: ["serverless", "cloud"],
  "aws lambda": ["serverless", "cloud"],

  // VCS -------------------------------------------------------------------
  git: ["version control", "scm", "source control"],
  github: ["version control", "scm", "source control"],
  gitlab: ["version control", "scm", "source control"],
  bitbucket: ["version control", "scm", "source control"],

  // Observability ---------------------------------------------------------
  splunk: ["observability", "log aggregation", "logging"],
  opentelemetry: ["observability", "distributed tracing", "tracing"],
  otel: ["observability", "distributed tracing", "tracing"],
  prometheus: ["observability", "metrics", "monitoring"],
  grafana: ["observability", "metrics", "monitoring", "dashboards"],
  datadog: ["observability", "metrics", "monitoring", "log aggregation"],
  "new relic": ["observability", "metrics", "monitoring"],
  elk: ["observability", "log aggregation", "logging"],
  elasticsearch: ["search", "full-text search", "nosql"],
  kibana: ["observability", "log aggregation", "dashboards"],

  // APIs ------------------------------------------------------------------
  graphql: ["api design", "api"],
  grpc: ["api", "rpc"],
  openapi: ["api design", "rest"],
  swagger: ["api design", "rest"],

  // Frontend --------------------------------------------------------------
  react: ["javascript", "frontend", "spa"],
  "next.js": ["react", "javascript", "frontend", "ssr", "ssg"],
  nextjs: ["react", "javascript", "frontend", "ssr", "ssg"],
  angular: ["typescript", "javascript", "frontend"],
  vue: ["javascript", "frontend"],
  "vue.js": ["javascript", "frontend"],
  typescript: ["javascript"],
  "node.js": ["javascript", "backend"],
  nodejs: ["javascript", "backend"],
  express: ["node.js", "javascript", "rest", "rest api development", "backend"],

  // Testing ---------------------------------------------------------------
  selenium: ["e2e testing", "browser automation", "integration testing"],
  cypress: ["e2e testing", "browser automation", "integration testing"],
  playwright: ["e2e testing", "browser automation", "integration testing"],
  jest: ["unit testing", "javascript"],
  testng: ["unit testing", "java"],

  // Build tools -----------------------------------------------------------
  maven: ["build tools", "java", "dependency management"],
  gradle: ["build tools", "java", "dependency management"],
  npm: ["javascript", "package management"],
  pnpm: ["javascript", "package management"],
  yarn: ["javascript", "package management"],

  // Monorepo --------------------------------------------------------------
  turborepo: ["mono repo", "monorepo"],
  turbo: ["mono repo", "monorepo"],
  nx: ["mono repo", "monorepo"],
  lerna: ["mono repo", "monorepo"],
  "pnpm workspaces": ["mono repo", "monorepo"],
  "yarn workspaces": ["mono repo", "monorepo"],

  // Code quality ----------------------------------------------------------
  sonarqube: ["static analysis", "code quality"],
  eslint: ["static analysis", "code quality"],

  // Auth ------------------------------------------------------------------
  jwt: ["authentication", "authorization", "security"],
  oauth: ["authentication", "authorization", "security"],
  oauth2: ["authentication", "authorization", "security"],
  saml: ["authentication", "authorization", "security"],
};

/**
 * Compound rules: if ALL of the `when` skills are present in the
 * candidate's explicit tech, add `add` skills to the implicit set.
 */
const CO_OCCURRENCE_RULES: { when: string[]; add: string[] }[] = [
  { when: ["docker", "github actions"], add: ["devops", "ci/cd"] },
  { when: ["docker", "jenkins"], add: ["devops", "ci/cd"] },
  { when: ["docker", "gitlab ci"], add: ["devops", "ci/cd"] },
  { when: ["docker", "circleci"], add: ["devops", "ci/cd"] },
  { when: ["docker", "kubernetes"], add: ["devops", "container orchestration"] },
  { when: ["kafka", "spring boot"], add: ["event-driven architecture", "distributed systems", "message queues"] },
  { when: ["kafka", "java"], add: ["event-driven architecture", "distributed systems", "message queues"] },
  { when: ["redis", "spring boot"], add: ["caching", "distributed caching"] },
  { when: ["redis", "postgresql"], add: ["caching", "database optimization"] },
  { when: ["spring boot", "docker", "kubernetes"], add: ["cloud-native", "container orchestration"] },
  { when: ["spring security", "jwt"], add: ["oauth2", "api security", "token-based authentication"] },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Expand the candidate's explicit tech list into a full "known skills" set
 * using the adjacency graph + co-occurrence rules. Returns a lowercased,
 * normalized Set.
 */
export function expandImplicitSkills(explicit: string[]): Set<string> {
  const out = new Set<string>();
  const explicitLc = explicit.map(normalize);

  for (const e of explicitLc) {
    out.add(e);
    const adj = SKILL_ADJACENCY[e];
    if (adj) for (const a of adj) out.add(normalize(a));
  }

  const explicitSet = new Set(explicitLc);
  for (const rule of CO_OCCURRENCE_RULES) {
    if (rule.when.every((w) => explicitSet.has(normalize(w)))) {
      for (const a of rule.add) out.add(normalize(a));
    }
  }

  return out;
}

/**
 * Only the IMPLICIT additions (not the explicit skills themselves).
 * Useful for prompt blocks that want to surface what's implied.
 */
export function implicitOnly(explicit: string[]): string[] {
  const full = expandImplicitSkills(explicit);
  const explicitLc = new Set(explicit.map(normalize));
  return [...full].filter((s) => !explicitLc.has(s)).sort();
}

/**
 * Bucket each JD skill into one of three categories:
 *   - explicit: literally present in the base resume.
 *   - implicit: not literal, but backed by an explicit skill via
 *               adjacency rules (safe to claim honestly).
 *   - missing:  neither — claiming would be fabrication.
 *
 * Also returns `implicitSources[skill]` = list of explicit skills that
 * back each implicit skill, for prompt transparency and logging.
 */
export function categorizeJdSkills(
  jdSkills: string[],
  explicitTechs: string[],
): {
  explicit: string[];
  implicit: string[];
  missing: string[];
  implicitSources: Record<string, string[]>;
} {
  const explicitLcSet = new Set(explicitTechs.map(normalize));
  const known = expandImplicitSkills(explicitTechs);

  const explicitOut: string[] = [];
  const implicitOut: string[] = [];
  const missingOut: string[] = [];
  const implicitSources: Record<string, string[]> = {};

  for (const s of jdSkills) {
    const lc = normalize(s);
    if (explicitLcSet.has(lc)) {
      explicitOut.push(s);
      continue;
    }
    if (known.has(lc)) {
      implicitOut.push(s);
      // Find which explicit skill(s) back this implicit skill. Prefer
      // direct adjacency (more informative) over co-occurrence; only
      // fall back to co-occurrence when no single explicit skill maps
      // to this JD skill on its own.
      const directBackers: string[] = [];
      for (const e of explicitTechs) {
        const eLc = normalize(e);
        const adj = SKILL_ADJACENCY[eLc];
        if (adj && adj.map(normalize).includes(lc)) directBackers.push(e);
      }
      let backers = directBackers;
      if (backers.length === 0) {
        for (const rule of CO_OCCURRENCE_RULES) {
          if (rule.add.map(normalize).includes(lc)) {
            const allPresent = rule.when.every((w) =>
              explicitLcSet.has(normalize(w)),
            );
            if (allPresent) backers = [rule.when.join(" + ")];
          }
        }
      }
      implicitSources[s] = backers.length ? backers : ["inferred"];
      continue;
    }
    missingOut.push(s);
  }

  return {
    explicit: explicitOut,
    implicit: implicitOut,
    missing: missingOut,
    implicitSources,
  };
}
