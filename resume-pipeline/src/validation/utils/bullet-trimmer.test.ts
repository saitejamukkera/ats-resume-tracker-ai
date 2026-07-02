// src/validation/utils/bullet-trimmer.test.ts
import { describe, it, expect } from "vitest";
import { trimBullet, trimRoleBullets } from "./bullet-trimmer.js";

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("trimBullet", () => {
  it("leaves bullets within the cap untouched", () => {
    const b = "Reduced API latency 40% by adding a Redis cache to the Spring Boot service";
    expect(trimBullet(b)).toBe(b);
  });

  it("shortens an over-length, filler-heavy bullet to within the cap", () => {
    const long =
      "Reduced API latency by 40% in order to improve throughput, and was responsible for " +
      "successfully building various supporting microservices that were needed across a wide " +
      "variety of teams and regions and stakeholders and partners nationwide every quarter";
    expect(words(long)).toBeGreaterThan(32);
    const out = trimBullet(long);
    expect(words(out)).toBeLessThanOrEqual(32);
    expect(words(out)).toBeLessThan(words(long));
    // Early metric is preserved.
    expect(out).toContain("40%");
    // No trailing punctuation artifacts.
    expect(out).not.toMatch(/[,;:]\s*$/);
  });

  it("applies filler substitutions", () => {
    const long =
      "In order to ship faster the team was responsible for migrating various legacy services " +
      "as well as rewriting a wide variety of endpoints that were brittle across many different " +
      "teams and regions and partners and stakeholders worldwide consistently every single quarter without fail";
    expect(words(long)).toBeGreaterThan(32);
    const out = trimBullet(long);
    expect(out.toLowerCase()).not.toContain("in order to");
    expect(out.toLowerCase()).not.toContain("responsible for");
  });

  it("never drops the only metric (keeps original rather than lose it)", () => {
    const long =
      "Built and maintained a wide variety of internal tooling and dashboards and reports and " +
      "various integrations across many teams and stakeholders and partners over several quarters " +
      "improving developer productivity by 25%";
    const out = trimBullet(long);
    expect(out).toContain("25%");
  });

  it("trimRoleBullets reports how many bullets changed", () => {
    const roles = [
      {
        bullets: [
          "Short clean bullet under the cap with a 12% gain",
          "In order to do things the team was responsible for handling a wide variety of various " +
            "tasks and duties and chores across many teams and groups and units and divisions and " +
            "branches and offices worldwide every single day without any exception whatsoever",
        ],
      },
    ];
    const { trimmed } = trimRoleBullets(roles);
    expect(trimmed).toBe(1);
    expect(roles[0].bullets[0]).toContain("12%"); // untouched
  });
});
