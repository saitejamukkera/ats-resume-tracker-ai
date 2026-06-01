// src/validation/skill-variants.ts
// Skill variant generation — canonical alias mapping for ATS keyword matching.

export const PREDEFINED_VARIANTS: Record<string, string[]> = {
  // Programming Languages
  typescript: ["typescript", "ts"],
  javascript: ["javascript", "js", "ecmascript"],
  java: ["java", "jvm"],
  python: ["python", "py"],
  "c++": ["c++", "cpp"],
  "c#": ["c#", "csharp", "c sharp"],
  ".net": [".net", "dotnet", "asp.net"],
  rust: ["rust", "rust lang"],
  go: ["go", "golang"],
  scala: ["scala", "scala lang"],
  kotlin: ["kotlin", "kotlin lang"],
  swift: ["swift", "swift lang"],
  ruby: ["ruby", "ruby lang"],
  php: ["php", "php lang"],
  dart: ["dart", "dart lang"],

  // Frontend
  react: ["react", "react.js", "reactjs"],
  vue: ["vue", "vue.js", "vuejs"],
  angular: ["angular", "angularjs", "angular.js"],
  "next.js": ["next.js", "nextjs", "next"],
  svelte: ["svelte", "sveltekit"],
  tailwind: ["tailwind", "tailwind css", "tailwindcss"],
  bootstrap: ["bootstrap", "bootstrap css"],
  redux: ["redux", "redux toolkit"],
  jquery: ["jquery", "jquery js"],

  // Backend
  node: ["node", "node.js", "nodejs"],
  "node.js": ["node", "node.js", "nodejs"],
  express: ["express", "express.js", "expressjs"],
  django: ["django", "django framework"],
  flask: ["flask", "flask framework"],
  fastapi: ["fastapi", "fast api"],
  "spring boot": ["spring boot", "springboot", "spring"],
  spring: ["spring", "spring boot", "springboot"],
  laravel: ["laravel", "laravel framework"],
  rails: ["rails", "ruby on rails"],
  "ruby on rails": ["ruby on rails", "rails"],

  // Databases
  sql: ["sql", "structured query language"],
  postgresql: ["postgresql", "postgres", "psql"],
  mysql: ["mysql", "my sql"],
  mongodb: ["mongodb", "mongo"],
  redis: ["redis", "caching"],
  elasticsearch: ["elasticsearch", "elastic search"],
  dynamodb: ["dynamodb", "dynamo db"],
  cassandra: ["cassandra", "cassandra db"],
  neo4j: ["neo4j", "neo 4j"],
  sqlite: ["sqlite", "sql lite"],
  oracle: ["oracle", "oracle db", "oracle database"],
  mssql: ["mssql", "ms sql", "sql server", "microsoft sql server"],

  // Cloud & DevOps
  aws: ["aws", "amazon web services"],
  gcp: ["gcp", "google cloud", "google cloud platform"],
  azure: ["azure", "microsoft azure"],
  docker: ["docker", "containerize", "containerization"],
  kubernetes: ["kubernetes", "k8s"],
  terraform: ["terraform", "iac", "infrastructure as code"],
  jenkins: ["jenkins", "ci/cd"],
  "github actions": ["github actions", "gh actions", "ci/cd"],
  gitlab: ["gitlab", "gitlab ci", "ci/cd"],
  "ci/cd": [
    "ci/cd",
    "ci cd",
    "cicd",
    "continuous integration",
    "continuous deployment",
    "ci",
    "cd",
  ],
  ansible: ["ansible", "automation"],
  prometheus: ["prometheus", "monitoring"],
  grafana: ["grafana", "monitoring", "dashboards"],
  datadog: ["datadog", "monitoring", "apm"],

  // Data & Messaging
  kafka: ["kafka", "event streaming"],
  rabbitmq: ["rabbitmq", "rabbit mq"],
  graphql: ["graphql", "graph ql"],
  rest: ["rest", "restful", "rest api", "restful api"],
  restful: ["rest", "restful", "rest api", "restful api"],
  grpc: ["grpc", "g rpc"],
  websocket: ["websocket", "web socket", "ws"],
  spark: ["spark", "apache spark"],
  hadoop: ["hadoop", "apache hadoop"],
  airflow: ["airflow", "apache airflow"],
  snowflake: ["snowflake", "snowflake db"],
  databricks: ["databricks", "databricks platform"],

  // AI/ML
  "machine learning": ["machine learning", "ml", "ai/ml"],
  ai: ["ai", "artificial intelligence", "ai/ml"],
  tensorflow: ["tensorflow", "tensor flow", "tf"],
  pytorch: ["pytorch", "torch"],
  sklearn: ["sklearn", "scikit-learn", "scikit learn"],
  pandas: ["pandas", "python pandas"],
  numpy: ["numpy", "num py"],
  llm: ["llm", "large language model", "large language models"],
  nlp: ["nlp", "natural language processing"],

  // Mobile
  android: ["android", "android dev"],
  ios: ["ios", "ios dev"],
  reactnative: ["react native", "reactnative", "react-native"],
  flutter: ["flutter", "flutter dev"],
  "react native": ["react native", "reactnative", "react-native"],

  // Methodologies & Soft Skills
  agile: ["agile", "scrum", "sprint"],
  scrum: ["scrum", "agile", "sprint"],
  kanban: ["kanban", "kanban board"],
  microservices: ["microservices", "micro-services", "microservice"],
  tdd: ["tdd", "test driven development"],
  bdd: ["bdd", "behavior driven development"],
  devops: ["devops", "dev ops"],
  cicd: ["cicd", "ci/cd", "ci cd"],

  // Testing
  jest: ["jest", "jest test"],
  mocha: ["mocha", "mocha test"],
  cypress: ["cypress", "cypress test"],
  selenium: ["selenium", "selenium test"],
  playwright: ["playwright", "playwright test"],
  junit: ["junit", "j unit"],
  pytest: ["pytest", "py test"],
};

export function generateDynamicVariants(term: string): string[] {
  const variants: string[] = [term.toLowerCase()];
  const lower = term.toLowerCase();

  if (lower.includes(".")) {
    variants.push(lower.replace(/\./g, ""));
    variants.push(lower.replace(/\./g, " "));
  }
  if (lower.includes("-")) {
    variants.push(lower.replace(/-/g, " "));
    variants.push(lower.replace(/-/g, ""));
  }
  if (lower.includes("/")) {
    variants.push(lower.replace(/\//g, " "));
    variants.push(lower.replace(/\//g, ""));
  }
  if (lower.endsWith("js")) {
    variants.push(lower.replace(/js$/, ".js"));
  }
  if (lower === "ts") {
    variants.push("typescript");
  }
  if (lower === "js") {
    variants.push("javascript");
  }
  if (lower === "k8s") {
    variants.push("kubernetes");
  }

  return [...new Set(variants)];
}

export function getAllSkillVariants(skill: string): string[] {
  const dynamic = generateDynamicVariants(skill);
  const fromMap = PREDEFINED_VARIANTS[skill.toLowerCase()];
  return [...new Set(fromMap ? [...dynamic, ...fromMap] : dynamic)];
}
