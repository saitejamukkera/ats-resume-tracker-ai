// src/stages/tech-stack-extractor.ts
// Dynamically extract a candidate's primary technologies from their parsed resume.
// Pure function, no LLM calls, no hardcoded user data.
// Uses a universal tech dictionary (like LinkedIn Skills / StackOverflow Tags)
// with multi-layer fallback: Skills → Bullets → Summary → Project Headings.

import type { ParsedResume } from "../schemas/pipeline.js";

// ── Public Types ────────────────────────────────────────────────

export interface CandidateTechProfile {
  primary: string[];   // top technologies by weighted score
  secondary: string[]; // next tier of technologies
}

// ── Universal Tech Dictionary ───────────────────────────────────
// Maps lowercase aliases → canonical display name.
// NOT user-specific data — this is a universal vocabulary of technologies.

const CANONICAL_TECH: Map<string, string> = new Map([
  // Languages
  ["java", "Java"], ["python", "Python"], ["javascript", "JavaScript"],
  ["typescript", "TypeScript"], ["go", "Go"], ["golang", "Go"],
  ["rust", "Rust"], ["c++", "C++"], ["cpp", "C++"], ["c#", "C#"],
  ["csharp", "C#"], ["ruby", "Ruby"], ["php", "PHP"], ["scala", "Scala"],
  ["kotlin", "Kotlin"], ["swift", "Swift"], ["sql", "SQL"], ["r", "R"],
  ["dart", "Dart"], ["elixir", "Elixir"], ["haskell", "Haskell"],
  ["perl", "Perl"], ["lua", "Lua"], ["groovy", "Groovy"],
  ["objective-c", "Objective-C"],

  // JVM / Java ecosystem
  ["spring boot", "Spring Boot"], ["springboot", "Spring Boot"],
  ["spring", "Spring"], ["spring core", "Spring Core"],
  ["spring security", "Spring Security"], ["spring mvc", "Spring MVC"],
  ["spring data", "Spring Data"], ["hibernate", "Hibernate"],
  ["maven", "Maven"], ["gradle", "Gradle"], ["jpa", "JPA"],
  ["jdbc", "JDBC"], ["junit", "JUnit"], ["junit 5", "JUnit"],
  ["mockito", "Mockito"], ["testcontainers", "Testcontainers"],
  ["lombok", "Lombok"], ["flyway", "Flyway"],

  // JavaScript / Node ecosystem
  ["node.js", "Node.js"], ["nodejs", "Node.js"], ["node", "Node.js"],
  ["express", "Express.js"], ["express.js", "Express.js"],
  ["expressjs", "Express.js"], ["next.js", "Next.js"],
  ["nextjs", "Next.js"], ["nest.js", "NestJS"], ["nestjs", "NestJS"],
  ["deno", "Deno"], ["bun", "Bun"],

  // Frontend
  ["react", "React"], ["react.js", "React"], ["reactjs", "React"],
  ["angular", "Angular"], ["vue", "Vue.js"], ["vue.js", "Vue.js"],
  ["vuejs", "Vue.js"], ["svelte", "Svelte"], ["redux", "Redux"],
  ["redux toolkit", "Redux Toolkit"], ["tailwindcss", "TailwindCSS"],
  ["tailwind", "TailwindCSS"], ["bootstrap", "Bootstrap"],
  ["html5", "HTML5"], ["html", "HTML5"], ["css3", "CSS3"], ["css", "CSS3"],
  ["sass", "Sass"], ["webpack", "Webpack"], ["vite", "Vite"],

  // Python ecosystem
  ["django", "Django"], ["flask", "Flask"], ["fastapi", "FastAPI"],
  ["pandas", "Pandas"], ["numpy", "NumPy"], ["pytorch", "PyTorch"],
  ["tensorflow", "TensorFlow"], ["scikit-learn", "scikit-learn"],
  ["celery", "Celery"], ["sqlalchemy", "SQLAlchemy"],

  // Databases
  ["postgresql", "PostgreSQL"], ["postgres", "PostgreSQL"],
  ["mysql", "MySQL"], ["mongodb", "MongoDB"], ["mongo", "MongoDB"],
  ["redis", "Redis"], ["elasticsearch", "Elasticsearch"],
  ["dynamodb", "DynamoDB"], ["cassandra", "Cassandra"],
  ["oracle", "Oracle"], ["sqlite", "SQLite"], ["neo4j", "Neo4j"],
  ["couchdb", "CouchDB"], ["mariadb", "MariaDB"],

  // Cloud
  ["aws", "AWS"], ["amazon web services", "AWS"],
  ["gcp", "GCP"], ["google cloud", "GCP"],
  ["google cloud platform", "GCP"],
  ["azure", "Azure"], ["microsoft azure", "Azure"],
  ["ec2", "EC2"], ["s3", "S3"], ["rds", "RDS"],
  ["lambda", "Lambda"], ["cloudwatch", "CloudWatch"],
  ["api gateway", "API Gateway"], ["sqs", "SQS"], ["sns", "SNS"],
  ["cloudfront", "CloudFront"], ["ecs", "ECS"], ["eks", "EKS"],
  ["fargate", "Fargate"],

  // DevOps / Infrastructure
  ["docker", "Docker"], ["kubernetes", "Kubernetes"], ["k8s", "Kubernetes"],
  ["terraform", "Terraform"], ["ansible", "Ansible"],
  ["helm", "Helm"], ["vagrant", "Vagrant"],
  ["nginx", "Nginx"], ["caddy", "Caddy"], ["apache", "Apache"],

  // CI/CD
  ["github actions", "GitHub Actions"], ["jenkins", "Jenkins"],
  ["circleci", "CircleCI"], ["travis ci", "Travis CI"],
  ["bamboo", "Bamboo"], ["gitlab ci", "GitLab CI"],
  ["azure devops", "Azure DevOps"], ["argo cd", "Argo CD"],
  ["sonarqube", "SonarQube"],

  // Messaging / Streaming
  ["kafka", "Kafka"], ["apache kafka", "Kafka"],
  ["rabbitmq", "RabbitMQ"], ["amazon sqs", "Amazon SQS"],
  ["activemq", "ActiveMQ"], ["nats", "NATS"],
  ["pulsar", "Pulsar"],

  // Observability / Monitoring
  ["splunk", "Splunk"], ["grafana", "Grafana"], ["datadog", "DataDog"],
  ["prometheus", "Prometheus"], ["opentelemetry", "OpenTelemetry"],
  ["new relic", "New Relic"], ["appdynamics", "AppDynamics"],
  ["elk", "ELK Stack"], ["kibana", "Kibana"], ["logstash", "Logstash"],
  ["jaeger", "Jaeger"], ["log4j", "Log4j"],

  // API / Architecture
  ["rest", "REST"], ["restful", "REST"], ["rest apis", "REST APIs"],
  ["graphql", "GraphQL"], ["grpc", "gRPC"],
  ["microservices", "Microservices"], ["oauth2", "OAuth2"],
  ["oauth", "OAuth"], ["jwt", "JWT"], ["swagger", "Swagger"],
  ["openapi", "OpenAPI"],

  // Patterns / Practices
  ["resilience4j", "Resilience4j"], ["wiremock", "WireMock"],

  // Version control
  ["git", "Git"], ["github", "GitHub"], ["gitlab", "GitLab"],
  ["bitbucket", "Bitbucket"],

  // AI / ML
  ["openai", "OpenAI"], ["gemini", "Gemini"], ["claude", "Claude"],
  ["langchain", "LangChain"], ["hugging face", "Hugging Face"],

  // .NET
  [".net", ".NET"], ["asp.net", "ASP.NET"], ["entity framework", "Entity Framework"],

  // Go ecosystem
  ["gin", "Gin"], ["echo", "Echo"],

  // Mobile
  ["react native", "React Native"], ["flutter", "Flutter"],

  // Other
  ["vercel", "Vercel"], ["heroku", "Heroku"], ["netlify", "Netlify"],
]);

// Pre-compute: group aliases by canonical name for deduplication
const ALL_ALIASES: string[] = [...CANONICAL_TECH.keys()].sort(
  (a, b) => b.length - a.length, // longest first to avoid partial matches
);

// ── Main Extractor ──────────────────────────────────────────────

export function extractTechProfile(
  parsed: ParsedResume,
  uiSkills?: string[],
  maxPrimary = 5,
  maxSecondary = 10,
): CandidateTechProfile {
  const scores = new Map<string, number>(); // canonical name → score

  function addScore(canonical: string, points: number) {
    scores.set(canonical, (scores.get(canonical) ?? 0) + points);
  }

  // Layer 0: UI Skills (highest authority, weight = 4)
  if (uiSkills && uiSkills.length > 0) {
    for (const skill of uiSkills) {
      const canonicals = scanTextForTechs(skill);
      if (canonicals.length > 0) {
        for (const tech of canonicals) {
          addScore(tech, 4);
        }
      } else {
        // Fallback for custom user skills not in our map: treat as canonical
        addScore(skill, 4);
      }
    }
  }

  // Layer 1: Skills section (highest signal, weight = 3)
  if (parsed.skills) {
    const skillTechs = extractFromSkillsSection(parsed.skills);
    for (const tech of skillTechs) {
      addScore(tech, 3);
    }
  }

  // Layer 2: Summary (weight = 2)
  if (parsed.summary) {
    const summaryTechs = scanTextForTechs(stripLatex(parsed.summary));
    for (const tech of summaryTechs) {
      addScore(tech, 2);
    }
  }

  // Layer 3: Experience bullets (weight = 1 per role, capped at 3)
  const roleMentions = new Map<string, number>(); // canonical → role count
  for (const role of parsed.experience) {
    const roleText = role.bullets.join(" ");
    const cleaned = stripLatex(roleText);
    const techs = scanTextForTechs(cleaned);
    const seen = new Set<string>();
    for (const tech of techs) {
      if (!seen.has(tech)) {
        seen.add(tech);
        roleMentions.set(tech, (roleMentions.get(tech) ?? 0) + 1);
      }
    }
  }
  for (const [tech, roleCount] of roleMentions) {
    addScore(tech, Math.min(roleCount, 3));
  }

  // Layer 4: Project headings (weight = 1)
  if (parsed.projects) {
    const projectTechs = extractFromProjectHeadings(parsed.projects);
    for (const tech of projectTechs) {
      addScore(tech, 1);
    }
  }

  // Rank by score descending, then alphabetically for ties
  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return {
    primary: ranked.slice(0, maxPrimary).map(([name]) => name),
    secondary: ranked.slice(maxPrimary, maxPrimary + maxSecondary).map(([name]) => name),
  };
}

// ── Layer 1: Skills Section Parser ──────────────────────────────
// Handles multiple LaTeX formats:
//   \textbf{Category}{: skill1, skill2}
//   \resumeItem{Category: skill1, skill2}
//   \item Category: skill1, skill2
//   Plain comma-separated lines

function extractFromSkillsSection(skillsRaw: string): string[] {
  const found: string[] = [];
  const lines = skillsRaw.split("\n");

  for (const line of lines) {
    // Strip LaTeX commands to get plain text
    const plain = stripLatex(line);
    if (!plain.trim()) continue;

    // Look for "Category: skill1, skill2, skill3" pattern
    const colonIdx = plain.indexOf(":");
    if (colonIdx !== -1) {
      const afterColon = plain.slice(colonIdx + 1);
      found.push(...scanTextForTechs(afterColon));
    } else {
      // No colon — scan the whole line
      found.push(...scanTextForTechs(plain));
    }
  }

  return [...new Set(found)];
}

// ── Layer 4: Project Headings Parser ────────────────────────────
// Project subheading lines often contain tech stacks:
//   \resumeSubheading{...}{...}{Java 21, Spring Boot, Node.js}{}

function extractFromProjectHeadings(projectsRaw: string): string[] {
  const found: string[] = [];

  // Match \resumeSubheading or \small{...} lines that often list techs
  const headingPattern = /\\(?:resumeSubheading|small)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(projectsRaw)) !== null) {
    found.push(...scanTextForTechs(stripLatex(match[1])));
  }

  // Also scan any plain-text lines in project blocks
  const lines = projectsRaw.split("\n");
  for (const line of lines) {
    if (line.includes("\\resumeSubheading") || line.includes("\\small")) {
      found.push(...scanTextForTechs(stripLatex(line)));
    }
  }

  return [...new Set(found)];
}

// ── Core: Scan text for tech dictionary matches ─────────────────

export function scanTextForTechs(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  const matched = new Set<string>(); // avoid duplicate canonical names

  for (const alias of ALL_ALIASES) {
    const canonical = CANONICAL_TECH.get(alias)!;
    if (matched.has(canonical)) continue;

    const idx = lower.indexOf(alias);
    if (idx === -1) continue;

    // Word boundary check: ensure the match isn't part of a larger word
    const before = idx > 0 ? lower[idx - 1] : " ";
    const after = idx + alias.length < lower.length ? lower[idx + alias.length] : " ";

    if (isWordBoundary(before) && isWordBoundary(after)) {
      found.push(canonical);
      matched.add(canonical);
    }
  }

  return found;
}

function isWordBoundary(char: string): boolean {
  return /[\s,;:.|(){}[\]/"'\\+\-]/.test(char) || char === " ";
}

// ── LaTeX Stripping ─────────────────────────────────────────────

function stripLatex(text: string): string {
  return text
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\\textit\{([^}]*)\}/g, "$1")
    .replace(/\\small\{([^}]*)\}/g, "$1")
    .replace(/\\resumeItem\{([^}]*)\}/g, "$1")
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, "$1")
    .replace(/\\underline\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+\*/g, "")  // commands like \faGithub*
    .replace(/\\[a-zA-Z]+/g, " ")   // remaining commands
    .replace(/[{}]/g, "")
    .replace(/\$\|\$/g, " ")        // LaTeX pipe separator
    .replace(/\s+/g, " ")
    .trim();
}
