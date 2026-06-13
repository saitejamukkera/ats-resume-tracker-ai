// src/validation/skill-matcher.test.ts
import { describe, it, expect } from "vitest";
import {
  matchSkillsLexical,
  applySemanticMatches,
  gradedCoverage,
  strongCoverage,
  hardGaps,
  TIER_CREDIT,
} from "./skill-matcher.js";
import {
  resolveCanonical,
  impliesSkill,
  getImplied,
} from "./taxonomy/skill-graph.js";

describe("skill-graph inference", () => {
  it("resolves aliases to canonical", () => {
    expect(resolveCanonical("React.js")).toBe("react");
    expect(resolveCanonical("k8s")).toBe("kubernetes");
    expect(resolveCanonical("springboot")).toBe("spring boot");
  });

  it("encodes specific→general implications", () => {
    expect(impliesSkill("React", "frontend")).toBe(true);
    expect(impliesSkill("React", "javascript")).toBe(true);
    expect(impliesSkill("Spring Boot", "java")).toBe(true);
    expect(impliesSkill("Kubernetes", "container orchestration")).toBe(true);
  });

  it("does NOT imply general→specific", () => {
    // Knowing JavaScript does not prove React.
    expect(impliesSkill("JavaScript", "react")).toBe(false);
    expect(impliesSkill("java", "spring boot")).toBe(false);
  });

  it("includes transitive closure", () => {
    const implied = getImplied("next.js");
    expect(implied.has("react")).toBe(true);
    expect(implied.has("javascript")).toBe(true);
    expect(implied.has("frontend")).toBe(true);
  });
});

describe("matchSkillsLexical tiers", () => {
  const resume =
    "Built Spring Boot microservices in Java, deployed to Kubernetes, data in PostgreSQL.";

  it("credits exact literal matches at 1.0", () => {
    const map = matchSkillsLexical(["Java", "PostgreSQL"], resume);
    expect(map.get("Java")!.tier).toBe("exact");
    expect(map.get("Java")!.credit).toBe(TIER_CREDIT.exact);
    expect(map.get("PostgreSQL")!.tier).toBe("exact");
  });

  it("credits implied matches via ontology", () => {
    // "container orchestration" never appears literally, but Kubernetes implies it.
    const map = matchSkillsLexical(["container orchestration"], resume);
    expect(map.get("container orchestration")!.tier).toBe("implied");
    expect(map.get("container orchestration")!.credit).toBe(TIER_CREDIT.implied);
  });

  it("reports unmatched skills as none", () => {
    const map = matchSkillsLexical(["Rust", "Flutter"], resume);
    expect(map.get("Rust")!.tier).toBe("none");
    expect(map.get("Flutter")!.tier).toBe("none");
  });
});

describe("coverage summaries + semantic merge", () => {
  const resume = "Java and Spring Boot services on Kubernetes.";

  it("gradedCoverage averages tier credit", () => {
    const map = matchSkillsLexical(["Java", "Rust"], resume); // exact + none
    expect(gradedCoverage(map)).toBeCloseTo((1.0 + 0) / 2, 5);
  });

  it("strongCoverage counts exact+implied only", () => {
    const map = matchSkillsLexical(["Java", "container orchestration", "Rust"], resume);
    // Java exact, container orchestration implied (k8s), Rust none → 2/3
    expect(strongCoverage(map)).toBeCloseTo(2 / 3, 5);
    expect(hardGaps(map)).toEqual(["Rust"]);
  });

  it("semantic merge upgrades only unmatched skills, capped", () => {
    const map = matchSkillsLexical(["Java", "Rust"], resume);
    applySemanticMatches(map, new Map([["Rust", 0.9], ["Java", 0.99]]));
    // Java stays exact (not downgraded); Rust upgraded to semantic, capped at 0.5.
    expect(map.get("Java")!.tier).toBe("exact");
    expect(map.get("Rust")!.tier).toBe("semantic");
    expect(map.get("Rust")!.credit).toBe(0.5);
  });

  it("semantic merge ignores below-threshold similarity", () => {
    const map = matchSkillsLexical(["Rust"], resume);
    applySemanticMatches(map, new Map([["Rust", 0.2]]));
    expect(map.get("Rust")!.tier).toBe("none");
  });
});
