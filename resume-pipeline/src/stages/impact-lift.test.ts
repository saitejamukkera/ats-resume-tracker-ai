// src/stages/impact-lift.test.ts
import { describe, it, expect } from "vitest";
import {
  strongRatio,
  selectWeakBullets,
  shouldAccept,
  mentionsForbidden,
} from "./impact-lift.js";
import { profileRoleImpact } from "../impact/detector.js";

const jdKeywords = ["Redis", "Spring Boot", "React", "CI/CD"];

// Known-strength sample bullets (validated against impact/detector.ts thresholds).
const STRONG_A =
  "Reduced API latency 40% by adding Redis caching to the Spring Boot service"; // 78
const STRONG_B =
  "Reduced onboarding drop-off 25% by redesigning the flow with React"; // 78
const STRONG_C = "Reduced error rates 30% by adding retries and circuit breakers"; // 73
const WEAK = "Improved the onboarding flow"; // impact verb only → weak (18)
const NONE = "Worked on various tasks"; // → none (0)

describe("impact-lift pure helpers", () => {
  it("strongRatio reflects the distribution", () => {
    const allStrong = profileRoleImpact("A", [STRONG_A, STRONG_B], jdKeywords, "mid");
    expect(strongRatio(allStrong)).toBe(1);

    const mixed = profileRoleImpact("B", [STRONG_C, WEAK, NONE], jdKeywords, "mid");
    expect(strongRatio(mixed)).toBeCloseTo(1 / 3, 5);
  });

  it("selectWeakBullets skips roles already at target and returns only non-strong", () => {
    const profiles = [
      profileRoleImpact("A", [STRONG_A, STRONG_B], jdKeywords, "mid"), // ratio 1.0 → skip
      profileRoleImpact("B", [STRONG_C, WEAK, NONE], jdKeywords, "mid"), // ratio .33 → include
    ];
    const targets = selectWeakBullets(profiles, 0.6);

    // Only role 1's non-strong bullets (WEAK, NONE) — role 0 untouched, STRONG_C skipped.
    expect(targets.every((t) => t.roleIndex === 1)).toBe(true);
    expect(targets.map((t) => t.text).sort()).toEqual([WEAK, NONE].sort());
  });

  it("shouldAccept accepts a strict impact improvement", () => {
    const improved =
      "Reduced onboarding drop-off 25% by redesigning the flow with React";
    expect(shouldAccept(WEAK, improved, jdKeywords, "mid")).toBe(true);
  });

  it("shouldAccept rejects regressions and equal-strength rewrites", () => {
    expect(shouldAccept(STRONG_A, "Worked on the flow", jdKeywords, "mid")).toBe(false);
    expect(shouldAccept(WEAK, "Enhanced the onboarding flow", jdKeywords, "mid")).toBe(false);
  });

  it("shouldAccept rejects non-credible (10x) rewrites", () => {
    const tooGood = "Boosted throughput 10x by adding Redis caching";
    expect(shouldAccept(WEAK, tooGood, jdKeywords, "mid")).toBe(false);
  });

  it("mentionsForbidden detects un-owned tech via word boundaries", () => {
    const forbidden = new Set(["kubernetes", "kafka"]);
    expect(mentionsForbidden("Deployed to Kubernetes clusters", forbidden)).toBe(true);
    expect(mentionsForbidden("Built with Docker and Redis", forbidden)).toBe(false);
  });
});
