// scripts/eval-ats.ts
// Calibration harness for the deterministic ATS engine (no LLM, no embeddings).
// Scores hand-labeled (resume, JD) fixtures and prints overall + key signals so
// we can confirm strong vs. weak resumes separate and the knockout gate fires.
//
// Run: npx tsx scripts/eval-ats.ts

import { calculateATSScore } from "../src/validation/ats-scorer.js";
import type { GeneratedSections } from "../src/schemas/pipeline.js";
import type { JDAnalysis } from "../src/schemas/jd-analysis.js";

function jd(partial: Partial<JDAnalysis>): JDAnalysis {
  return {
    position: "Software Engineer",
    company: "Acme",
    jobId: "",
    location: "Remote",
    requiredSkills: [],
    preferredSkills: [],
    keyResponsibilities: [],
    experienceLevel: "mid",
    educationLevel: "bachelors",
    domainFocus: "backend",
    keyPhrases: [],
    ...partial,
  };
}

function sections(partial: Partial<GeneratedSections>): GeneratedSections {
  return {
    summary: "",
    skills: "",
    experience: [],
    coverLetter: "",
    ...partial,
  };
}

interface Fixture {
  name: string;
  expect: "pass" | "borderline" | "fail";
  jd: JDAnalysis;
  sections: GeneratedSections;
}

const backendJD = jd({
  position: "Backend Engineer",
  requiredSkills: ["Java", "Spring Boot", "PostgreSQL", "Kubernetes", "REST"],
  preferredSkills: ["Kafka", "AWS"],
  experienceLevel: "mid",
});

const fixtures: Fixture[] = [
  {
    name: "Strong exact match",
    expect: "pass",
    jd: backendJD,
    sections: sections({
      summary:
        "Backend Engineer with 4 years building scalable services in Java and Spring Boot.",
      skills:
        "\\textbf{Languages}{: Java, SQL} \\\\ \\textbf{Backend}{: Spring Boot, REST APIs} \\\\ \\textbf{Data}{: PostgreSQL, Kafka} \\\\ \\textbf{DevOps}{: Kubernetes, AWS}",
      experience: [
        {
          roleTitle: "Software Engineer",
          company: "Globex",
          bullets: [
            "Designed Java microservices with Spring Boot, cutting p99 latency by 35%.",
            "Deployed services to Kubernetes on AWS, improving uptime to 99.95%.",
            "Built REST APIs backed by PostgreSQL serving 2M requests/day.",
            "Streamed events through Kafka to decouple 6 downstream services.",
          ],
        },
        {
          roleTitle: "Junior Developer",
          company: "Initech",
          bullets: ["Wrote SQL queries and Java batch jobs processing 500k records nightly."],
        },
      ],
    }),
  },
  {
    name: "Implied match (no literal keywords)",
    expect: "borderline",
    jd: backendJD,
    sections: sections({
      // Has React->frontend etc. but for backend JD relies on implied: Spring Boot
      // implies Java/backend; k8s implies container orchestration. PostgreSQL exact.
      summary: "Engineer with 3 years of server-side experience.",
      skills:
        "\\textbf{Backend}{: Spring Boot} \\\\ \\textbf{Data}{: PostgreSQL} \\\\ \\textbf{DevOps}{: Kubernetes}",
      experience: [
        {
          roleTitle: "Software Engineer",
          company: "Globex",
          bullets: [
            "Built Spring Boot services and deployed them on Kubernetes.",
            "Modeled relational data in PostgreSQL for a 1M-user product.",
          ],
        },
      ],
    }),
  },
  {
    name: "Weak — misses most required (knockout expected)",
    expect: "fail",
    jd: backendJD,
    sections: sections({
      summary: "Frontend developer focused on UI.",
      skills:
        "\\textbf{Frontend}{: React, Redux, CSS} \\\\ \\textbf{Languages}{: JavaScript}",
      experience: [
        {
          roleTitle: "Frontend Developer",
          company: "Globex",
          bullets: [
            "Built React components and Redux stores for a marketing site.",
            "Styled responsive layouts with CSS and improved Lighthouse scores.",
          ],
        },
      ],
    }),
  },
];

console.log("\nATS calibration eval (deterministic, phase 2 — no embeddings)\n");
console.log(
  "fixture".padEnd(42),
  "exp".padEnd(11),
  "overall".padEnd(8),
  "kwd".padEnd(5),
  "hardCov".padEnd(8),
  "gate".padEnd(6),
  "knockouts",
);
console.log("-".repeat(110));

for (const f of fixtures) {
  const score = calculateATSScore(f.sections, f.jd);
  console.log(
    f.name.padEnd(42),
    f.expect.padEnd(11),
    String(score.overall).padEnd(8),
    String(score.keywordRelevance).padEnd(5),
    String(score.hardRequirementCoverage).padEnd(8),
    String(score.knockoutGateApplied).padEnd(6),
    score.knockouts.join(", ") || "—",
  );
}
console.log("");
