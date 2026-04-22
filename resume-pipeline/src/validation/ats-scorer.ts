// src/validation/ats-scorer.ts
// Stage 4.5: Deterministic ATS score calculator — 0 LLM calls.

import type { GeneratedSections } from "../schemas/pipeline.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { ATSScore } from "../schemas/pipeline.js";

export function calculateATSScore(
  sections: GeneratedSections,
  jd: JDAnalysis,
): ATSScore {
  const fullText = extractAllText(sections).toLowerCase();

  // ── Keyword Match (40% of score) ──────────────────────────────
  const requiredFound = jd.requiredSkills.filter((skill) => {
    const variants = getSkillVariants(skill);
    return variants.some((v) => fullText.includes(v.toLowerCase()));
  });
  const missingRequired = jd.requiredSkills.filter((skill) => {
    const variants = getSkillVariants(skill);
    return !variants.some((v) => fullText.includes(v.toLowerCase()));
  });
  const keywordMatch =
    jd.requiredSkills.length > 0
      ? requiredFound.length / jd.requiredSkills.length
      : 1;

  // ── Preferred Skills (15% of score) ───────────────────────────
  const preferredFound = jd.preferredSkills.filter((skill) => {
    const variants = getSkillVariants(skill);
    return variants.some((v) => fullText.includes(v.toLowerCase()));
  });
  const missingPreferred = jd.preferredSkills.filter((skill) => {
    const variants = getSkillVariants(skill);
    return !variants.some((v) => fullText.includes(v.toLowerCase()));
  });
  const preferredMatch =
    jd.preferredSkills.length > 0
      ? preferredFound.length / jd.preferredSkills.length
      : 1;

  // ── Section Completeness (15% of score) ───────────────────────
  const hasSummary = sections.summary.trim().length > 0 ? 1 : 0;
  const hasSkills = sections.skills.trim().length > 0 ? 1 : 0;
  const hasExperience = sections.experience.length > 0 ? 1 : 0;
  const sectionCompleteness = (hasSummary + hasSkills + hasExperience) / 3;

  // ── Format Score (15% of score) ───────────────────────────────
  // LaTeX to PDF is fine for ATS. Just check for known bad patterns.
  const formatScore = 1.0; // We're using template-based assembly, so format is always clean

  // ── Keyword Placement (15% of score) ──────────────────────────
  // Keywords in summary and first 2 bullets of each role are weighted higher
  const highWeightTexts = [
    sections.summary,
    ...sections.experience.flatMap((r) => r.bullets.slice(0, 2)),
  ];
  const highWeightText = highWeightTexts.join(" ").toLowerCase();

  const highWeightHits = jd.requiredSkills.filter((skill) =>
    getSkillVariants(skill).some((v) =>
      highWeightText.includes(v.toLowerCase()),
    ),
  );
  const keywordPlacement =
    jd.requiredSkills.length > 0
      ? highWeightHits.length / jd.requiredSkills.length
      : 1;

  const overall = Math.round(
    keywordMatch * 40 +
      preferredMatch * 15 +
      sectionCompleteness * 15 +
      formatScore * 15 +
      keywordPlacement * 15,
  );

  return {
    overall,
    keywordMatch: Math.round(keywordMatch * 100),
    preferredMatch: Math.round(preferredMatch * 100),
    sectionCompleteness: Math.round(sectionCompleteness * 100),
    formatScore: Math.round(formatScore * 100),
    keywordPlacement: Math.round(keywordPlacement * 100),
    missingRequired,
    missingPreferred,
  };
}

function extractAllText(sections: GeneratedSections): string {
  return [
    sections.summary,
    stripLatexCommands(sections.skills),
    ...sections.experience.flatMap((r) => [
      r.roleTitle,
      r.company,
      ...r.bullets,
    ]),
  ].join(" ");
}

/**
 * Strip LaTeX formatting commands to expose the raw text for keyword matching.
 * e.g. "\textbf{Programming Languages}{: Java, TypeScript}" → "Programming Languages: Java, TypeScript"
 */
function stripLatexCommands(text: string): string {
  return text
    .replace(/\\textbf\{([^}]*)\}/g, "$1") // \textbf{X} → X
    .replace(/\\textit\{([^}]*)\}/g, "$1") // \textit{X} → X
    .replace(/\\emph\{([^}]*)\}/g, "$1") // \emph{X} → X
    .replace(/\\resumeItem\{([^}]*)\}/g, "$1")
    .replace(/\\resumeSubHeadingListStart|\\resumeSubHeadingListEnd/g, "")
    .replace(/\\resumeItemListStart|\\resumeItemListEnd/g, "")
    .replace(/\\\\|\\\\/g, " ") // line breaks
    .replace(/\\[a-zA-Z]+/g, " ") // remaining commands
    .replace(/[{}]/g, " ") // braces
    .replace(/\s+/g, " ");
}

function getSkillVariants(skill: string): string[] {
  const variants: Record<string, string[]> = {
    react: ["react", "react.js", "reactjs"],
    node: ["node", "node.js", "nodejs"],
    "node.js": ["node", "node.js", "nodejs"],
    typescript: ["typescript", "ts"],
    javascript: ["javascript", "js", "ecmascript"],
    postgresql: ["postgresql", "postgres", "psql"],
    mongodb: ["mongodb", "mongo"],
    kubernetes: ["kubernetes", "k8s"],
    "ci/cd": [
      "ci/cd",
      "ci cd",
      "cicd",
      "continuous integration",
      "continuous deployment",
      "ci",
      "cd",
    ],
    aws: ["aws", "amazon web services"],
    gcp: ["gcp", "google cloud", "google cloud platform"],
    "next.js": ["next.js", "nextjs", "next"],
    "spring boot": ["spring boot", "springboot", "spring"],
    spring: ["spring", "spring boot", "springboot"],
    docker: ["docker", "containerize", "containerization"],
    graphql: ["graphql", "graph ql"],
    rest: ["rest", "restful", "rest api", "restful api"],
    restful: ["rest", "restful", "rest api", "restful api"],
    sql: ["sql", "structured query language"],
    java: ["java", "jvm"],
    python: ["python", "py"],
    "c++": ["c++", "cpp"],
    "c#": ["c#", "csharp", "c sharp"],
    ".net": [".net", "dotnet", "asp.net"],
    redis: ["redis", "caching"],
    kafka: ["kafka", "event streaming"],
    jenkins: ["jenkins", "ci/cd"],
    "github actions": ["github actions", "gh actions", "ci/cd"],
    terraform: ["terraform", "iac", "infrastructure as code"],
    agile: ["agile", "scrum", "sprint"],
    microservices: ["microservices", "micro-services", "microservice"],
    "machine learning": ["machine learning", "ml", "ai/ml"],
    ai: ["ai", "artificial intelligence", "ai/ml"],
  };
  const key = skill.toLowerCase();
  return variants[key] || [key];
}
