// src/validation/ats-scorer.test.ts
import { describe, it, expect } from "vitest";
import { calculateATSScore } from "./ats-scorer.js";
import type { GeneratedSections } from "../schemas/pipeline.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import { computeExperienceYears } from "./utils/experience-years.js";

function jd(p: Partial<JDAnalysis>): JDAnalysis {
  return {
    position: "Backend Engineer",
    company: "Acme",
    jobId: "",
    location: "Remote",
    requiredSkills: ["Java", "Spring Boot", "PostgreSQL", "Kubernetes", "REST"],
    preferredSkills: [],
    keyResponsibilities: [],
    experienceLevel: "mid",
    educationLevel: "bachelors",
    domainFocus: "backend",
    keyPhrases: [],
    minYearsExperience: null,
    workAuthRequirement: null,
    certifications: [],
    ...p,
  };
}

function sections(p: Partial<GeneratedSections>): GeneratedSections {
  return { summary: "", skills: "", experience: [], coverLetter: "", ...p };
}

describe("calculateATSScore — knockout gating & separation", () => {
  it("gives a strong matching resume a clearly higher score than a weak one", () => {
    const strong = calculateATSScore(
      sections({
        summary: "Backend Engineer with 4 years in Java and Spring Boot.",
        skills:
          "\\textbf{Backend}{: Java, Spring Boot, REST APIs} \\\\ \\textbf{Data}{: PostgreSQL} \\\\ \\textbf{DevOps}{: Kubernetes}",
        experience: [
          {
            roleTitle: "Software Engineer",
            company: "Globex",
            bullets: [
              "Built Java Spring Boot REST services backed by PostgreSQL, cutting latency 35%.",
              "Deployed to Kubernetes improving uptime to 99.9%.",
            ],
          },
        ],
      }),
      jd({}),
    );

    const weak = calculateATSScore(
      sections({
        summary: "Frontend developer.",
        skills: "\\textbf{Frontend}{: React, CSS} \\\\ \\textbf{Languages}{: JavaScript}",
        experience: [
          {
            roleTitle: "Frontend Developer",
            company: "Globex",
            bullets: ["Built React components and styled with CSS."],
          },
        ],
      }),
      jd({}),
    );

    expect(strong.overall).toBeGreaterThan(weak.overall + 25);
    expect(weak.knockouts.length).toBeGreaterThanOrEqual(4);
    expect(weak.hardRequirementCoverage).toBeLessThan(40);
  });

  it("caps a resume that misses most hard requirements", () => {
    const score = calculateATSScore(
      sections({
        // Strong on everything EXCEPT required skills — would otherwise inflate.
        summary: "Engineer with great impact: increased revenue 40%, led 5 engineers.",
        skills: "\\textbf{Other}{: Photoshop, Figma, Excel}",
        experience: [
          {
            roleTitle: "Designer",
            company: "Globex",
            bullets: [
              "Drove 40% revenue growth through redesign, measured via A/B tests.",
              "Reduced churn by 18% and improved NPS by 25 points across 3 quarters.",
            ],
          },
        ],
      }),
      jd({}),
    );
    expect(score.hardRequirementCoverage).toBe(0);
    expect(score.overall).toBeLessThanOrEqual(40);
  });

  it("credits implied skills (ontology) without literal keywords", () => {
    const score = calculateATSScore(
      sections({
        skills: "\\textbf{Backend}{: Spring Boot} \\\\ \\textbf{Data}{: PostgreSQL} \\\\ \\textbf{DevOps}{: Kubernetes}",
        experience: [
          {
            roleTitle: "Engineer",
            company: "Globex",
            bullets: ["Built Spring Boot services on Kubernetes with PostgreSQL."],
          },
        ],
      }),
      jd({ requiredSkills: ["Java", "container orchestration", "PostgreSQL"] }),
    );
    // Java implied by Spring Boot, container orchestration implied by Kubernetes.
    expect(score.requiredMatchTiers["Java"]).toBe("implied");
    expect(score.requiredMatchTiers["container orchestration"]).toBe("implied");
    expect(score.hardRequirementCoverage).toBe(100);
  });
});

describe("computeExperienceYears", () => {
  it("parses a multi-role union span and most-recent role", () => {
    const d = computeExperienceYears([
      "Software Engineer, Globex, Jan 2020 -- Present",
      "Junior Developer, Initech, Jun 2017 -- Dec 2019",
    ], new Date("2024-01-01"));
    expect(d.parsed).toBe(true);
    expect(d.totalYears).toBeGreaterThan(6); // 2017 → 2024
    expect(d.mostRecentYears).toBeGreaterThan(3); // 2020 → 2024
  });

  it("returns parsed=false when no dates present", () => {
    const d = computeExperienceYears(["Software Engineer, Globex"]);
    expect(d.parsed).toBe(false);
    expect(d.totalYears).toBe(0);
  });
});
