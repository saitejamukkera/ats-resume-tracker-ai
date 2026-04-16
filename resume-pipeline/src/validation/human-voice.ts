// src/validation/human-voice.ts
// Stage 4.8: Human Voice Scorer + Anti-AI Detection — deterministic, 0 LLM calls.
// Scores how "human" the generated bullets sound and flags AI-written patterns.

// ── Human Voice Score ──────────────────────────────────────────

export interface HumanVoiceScore {
  overall: number;        // 0-100, target: 70+
  verbDiversity: number;  // 0-1 — unique opening verbs / total bullets
  lengthVariance: number; // 0-1 — normalized stdDev of bullet word counts
  metricsBalance: number; // 0-1 — penalizes both <50% AND >85% metric density
  buzzwordDensity: number; // 0-1 — inverse of flagged buzzwords per bullet
  sentencePatterns: number; // 0-1 — unique syntactic patterns / total
}

/**
 * Score how human a set of resume bullets sound.
 * 
 * Key insight from recruiter feedback:
 * - 100% metrics = AI (real engineers have qualitative wins)
 * - Uniform bullet length = AI (real work is messy — some big, some minor)
 * - Same verb repeated = AI (real humans vary their openers)
 * - Corporate buzzwords = AI (real engineers say "built" not "spearheaded")
 */
export function scoreHumanVoice(bullets: string[]): HumanVoiceScore {
  if (bullets.length === 0) {
    return {
      overall: 100,
      verbDiversity: 1,
      lengthVariance: 1,
      metricsBalance: 1,
      buzzwordDensity: 1,
      sentencePatterns: 1,
    };
  }

  // ── Verb Diversity (25% of score) ──────────────────────────
  // Extract first word of each bullet (the action verb)
  const openingVerbs = bullets.map((b) =>
    b.trim().split(/\s+/)[0].toLowerCase(),
  );
  const uniqueVerbs = new Set(openingVerbs);
  const verbDiversity =
    openingVerbs.length > 0 ? uniqueVerbs.size / openingVerbs.length : 1;
  // Bad: 3 unique verbs across 10 bullets (0.3)
  // Good: 8 unique verbs across 10 bullets (0.8)

  // ── Length Variance (20% of score) ─────────────────────────
  // Real resumes have messy length — big projects get long bullets, small wins get short ones.
  const wordCounts = bullets.map((b) => b.split(/\s+/).length);
  const mean = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
  const variance =
    wordCounts.reduce((a, c) => a + Math.pow(c - mean, 2), 0) /
    wordCounts.length;
  const stdDev = Math.sqrt(variance);
  // Bad: stdDev < 2 (all bullets same length — robotic)
  // Good: stdDev 4-8 (natural variation)
  const lengthVariance = Math.min(stdDev / 8, 1); // normalize to 0-1

  // ── Metrics Balance (25% of score) ─────────────────────────
  // The insight: 100% metrics = AI. 60-80% metrics = real engineer who tracks impact.
  const metricPattern =
    /\d+%|\d+x|\$[\d,]+|\d+\s*(ms|seconds|hours|days|users|requests|records|endpoints|services|APIs)/i;
  const bulletsWithMetrics = bullets.filter((b) =>
    metricPattern.test(b),
  ).length;
  const metricsRatio =
    bullets.length > 0 ? bulletsWithMetrics / bullets.length : 0;
  // Penalize both too few (<50%) AND too many (>85%)
  let metricsBalance: number;
  if (metricsRatio >= 0.5 && metricsRatio <= 0.85) {
    metricsBalance = 1.0;
  } else if (metricsRatio < 0.5) {
    metricsBalance = metricsRatio / 0.5; // linearly penalize below 50%
  } else {
    metricsBalance = 1.0 - (metricsRatio - 0.85) / 0.15; // linearly penalize above 85%
  }
  metricsBalance = Math.max(0, metricsBalance);

  // ── Buzzword Density (15% of score) ────────────────────────
  // Words that only ChatGPT uses. Real engineers don't talk like this.
  const buzzwords = [
    "spearheaded",
    "orchestrated",
    "pioneered",
    "revolutionized",
    "transformative",
    "cutting-edge",
    "best-in-class",
    "world-class",
    "leveraged",
    "synergized",
    "paradigm",
    "holistic",
    "robust",
    "scalable",
    "seamless",
    "state-of-the-art",
    "utilize",
    "utilization",
    "facilitate",
    "facilitated",
    "champion",
    "championed",
  ];
  const totalBuzzwords = bullets.reduce((count, b) => {
    return (
      count + buzzwords.filter((bw) => b.toLowerCase().includes(bw)).length
    );
  }, 0);
  const buzzwordDensity =
    1 - Math.min(totalBuzzwords / (bullets.length * 0.5), 1);

  // ── Sentence Pattern Diversity (15% of score) ──────────────
  // Classify each bullet's syntactic shape
  const patterns = bullets.map(classifySentencePattern);
  const uniquePatterns = new Set(patterns);
  const sentencePatterns =
    patterns.length > 0 ? uniquePatterns.size / Math.min(patterns.length, 7) : 1;
  // Cap denominator at 7 — you can't realistically have more than 7 distinct patterns,
  // so having 5/10 bullets with unique patterns is still great diversity.

  const overall = Math.round(
    verbDiversity * 25 +
      lengthVariance * 20 +
      metricsBalance * 25 +
      buzzwordDensity * 15 +
      Math.min(sentencePatterns, 1) * 15,
  );

  return {
    overall,
    verbDiversity: Math.round(verbDiversity * 100) / 100,
    lengthVariance: Math.round(lengthVariance * 100) / 100,
    metricsBalance: Math.round(metricsBalance * 100) / 100,
    buzzwordDensity: Math.round(buzzwordDensity * 100) / 100,
    sentencePatterns: Math.round(Math.min(sentencePatterns, 1) * 100) / 100,
  };
}

// ── Sentence Pattern Classification ────────────────────────────

export type SentencePattern =
  | "context-first" // "As part of the payments team, implemented..."
  | "action-then-impact" // "Built caching layer, reducing latency by 40%"
  | "result-then-method" // "Reduced P95 latency by 35% by introducing Redis..."
  | "creation-verb" // "Built/Created/Designed/Wrote..."
  | "impact-first" // "Reduced/Improved/Increased..."
  | "team-oriented" // "Collaborated/Partnered/Mentored/Led..."
  | "other";

export function classifySentencePattern(bullet: string): SentencePattern {
  if (/^(As part of|During|In collaboration|Working with)/i.test(bullet))
    return "context-first";
  if (
    /,\s*(reducing|improving|cutting|saving|enabling|resulting|achieving|bringing|eliminating)/i.test(
      bullet,
    )
  )
    return "action-then-impact";
  if (
    /\bby\s+(\d|introducing|implementing|using|migrating|building|creating|deploying|adding|leveraging|refactoring)/i.test(
      bullet,
    )
  )
    return "result-then-method";
  if (
    /^(Built|Created|Designed|Wrote|Configured|Set up|Established|Constructed|Assembled|Authored)/i.test(
      bullet,
    )
  )
    return "creation-verb";
  if (
    /^(Reduced|Improved|Increased|Decreased|Accelerated|Eliminated|Minimized|Maximized|Cut|Halved|Doubled)/i.test(
      bullet,
    )
  )
    return "impact-first";
  if (
    /^(Collaborated|Partnered|Mentored|Led|Coordinated|Onboarded|Trained|Guided|Supervised)/i.test(
      bullet,
    )
  )
    return "team-oriented";
  return "other";
}

// ── Anti-AI Detection Risk Estimator ───────────────────────────

export interface AIDetectionResult {
  risk: "low" | "medium" | "high";
  signals: string[];
}

/**
 * Estimate how likely a recruiter or ATS system would flag these bullets as AI-generated.
 * 
 * Directly maps to recruiter complaints:
 * - "Every bullet starts with an impressive action verb" → verb repetition
 * - "Bullets suspiciously balanced in length" → length uniformity
 * - "The tone is identical throughout" → pattern uniformity
 * - "Use of 'impressive' buzzwords" → AI-favorite words
 * - "Everything gets equal real estate" → 100% metric density
 */
export function estimateAIDetectionRisk(
  bullets: string[],
): AIDetectionResult {
  if (bullets.length === 0) return { risk: "low", signals: [] };

  const signals: string[] = [];

  // 1. Verb repetition — any verb used >2 times is a red flag
  const verbs = bullets.map((b) => b.trim().split(/\s+/)[0].toLowerCase());
  const verbCounts = new Map<string, number>();
  verbs.forEach((v) => verbCounts.set(v, (verbCounts.get(v) || 0) + 1));
  const maxVerbRepeat = Math.max(...verbCounts.values());
  if (maxVerbRepeat > 2) {
    const repeatedVerb = [...verbCounts.entries()].find(
      ([, c]) => c === maxVerbRepeat,
    )?.[0];
    signals.push(
      `Verb "${repeatedVerb}" used ${maxVerbRepeat} times — vary your openers`,
    );
  }

  // 2. Bullet length uniformity — all within ±4 words of average
  const lengths = bullets.map((b) => b.split(/\s+/).length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const allSimilar = lengths.every((l) => Math.abs(l - avgLen) < 4);
  if (allSimilar && bullets.length >= 4) {
    signals.push(
      `All ${bullets.length} bullets suspiciously similar length (avg ${Math.round(avgLen)} words) — mix short punchy lines with longer detailed ones`,
    );
  }

  // 3. AI-favorite buzzwords — >2 total is suspicious
  const aiWords = [
    "utilize",
    "leverage",
    "spearhead",
    "spearheaded",
    "orchestrate",
    "orchestrated",
    "cutting-edge",
    "robust",
    "seamless",
    "holistic",
    "synergy",
    "synergized",
    "paradigm",
    "pioneered",
    "revolutionized",
    "champion",
    "championed",
    "facilitated",
    "best-in-class",
    "world-class",
    "state-of-the-art",
  ];
  const aiWordCount = bullets.reduce(
    (c, b) =>
      c + aiWords.filter((w) => b.toLowerCase().includes(w)).length,
    0,
  );
  if (aiWordCount > 2) {
    signals.push(
      `${aiWordCount} AI-favorite buzzwords detected — use plain engineering language`,
    );
  }

  // 4. Pattern uniformity — ≤2 unique sentence patterns across all bullets
  const patterns = bullets.map(classifySentencePattern);
  const uniquePatterns = new Set(patterns);
  if (uniquePatterns.size <= 2 && bullets.length >= 4) {
    signals.push(
      `Only ${uniquePatterns.size} sentence patterns — extremely uniform (${[...uniquePatterns].join(", ")})`,
    );
  }

  // 5. 100% metrics — every single bullet has a number/percentage
  const metricBullets = bullets.filter((b) =>
    /\d+%|\d+x|\$[\d,]+|\d+\s*(K|M|B)\b/i.test(b),
  ).length;
  if (metricBullets === bullets.length && bullets.length >= 4) {
    signals.push(
      "100% of bullets have metrics — unnatural. Real work includes qualitative wins too",
    );
  }

  // 6. Formal vagueness — bullets that are polished but say nothing specific
  const vaguePhrases = [
    "cross-functional stakeholders",
    "drive alignment",
    "key deliverables",
    "strategic initiatives",
    "business objectives",
    "modern cloud technologies",
    "scalable solutions",
    "key performance",
    "best practices",
    "industry-leading",
  ];
  const vagueCount = bullets.reduce(
    (c, b) =>
      c +
      vaguePhrases.filter((p) => b.toLowerCase().includes(p)).length,
    0,
  );
  if (vagueCount > 1) {
    signals.push(
      `${vagueCount} vague corporate phrases — replace with specific technologies and outcomes`,
    );
  }

  const risk: AIDetectionResult["risk"] =
    signals.length === 0
      ? "low"
      : signals.length <= 2
        ? "medium"
        : "high";

  return { risk, signals };
}
