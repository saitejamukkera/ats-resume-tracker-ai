// src/stages/skills-injector.test.ts
import { describe, it, expect } from "vitest";
import { injectVerifiedSkills } from "./skills-injector.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type { CandidateTechProfile } from "./tech-stack-extractor.js";

const baseSkills =
  "\\textbf{Programming Languages}{: Java, JavaScript, TypeScript} \\\\\n" +
  "\\textbf{Backend Technologies}{: Spring Boot, Node.js} \\\\\n" +
  "\\textbf{Databases \\& Cloud}{: PostgreSQL, MongoDB, AWS}";

function jd(p: Partial<JDAnalysis>): JDAnalysis {
  return {
    position: "Backend Engineer",
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
    minYearsExperience: null,
    workAuthRequirement: null,
    certifications: [],
    ...p,
  };
}

const tech: CandidateTechProfile = {
  primary: ["Java", "Spring Boot", "Kubernetes", "Redis"],
  secondary: [],
};

describe("injectVerifiedSkills", () => {
  it("injects a required skill the candidate has but didn't list", () => {
    // Kubernetes is in the candidate's tech profile and an experience bullet,
    // but missing from the skills section. It should be injected.
    const resumeText = "Deployed services to Kubernetes in production.";
    const res = injectVerifiedSkills(
      baseSkills,
      jd({ requiredSkills: ["Kubernetes"] }),
      tech,
      resumeText,
    );
    expect(res.injected).toContain("Kubernetes");
    expect(res.skills.toLowerCase()).toContain("kubernetes");
    // Stays inside a valid \textbf{...}{: ...} group (no stray braces added).
    expect(res.skills).toMatch(/\\textbf\{[^}]*\}\{:[^}]*kubernetes[^}]*\}/i);
  });

  it("does NOT inject a skill the candidate cannot back up", () => {
    const res = injectVerifiedSkills(
      baseSkills,
      jd({ requiredSkills: ["Rust", "Go"] }),
      tech,
      "No systems languages here.",
    );
    expect(res.injected).toHaveLength(0);
    expect(res.skills).toBe(baseSkills);
  });

  it("does NOT duplicate a skill already present", () => {
    const res = injectVerifiedSkills(
      baseSkills,
      jd({ requiredSkills: ["Java", "Spring Boot"] }),
      tech,
      "Java Spring Boot everywhere.",
    );
    expect(res.injected).toHaveLength(0);
  });

  it("leaves unparseable skill sections untouched", () => {
    const weird = "Some freeform skills text without textbf groups";
    const res = injectVerifiedSkills(
      weird,
      jd({ requiredSkills: ["Kubernetes"] }),
      tech,
      "Kubernetes experience.",
    );
    expect(res.skills).toBe(weird);
    expect(res.injected).toHaveLength(0);
  });
});
