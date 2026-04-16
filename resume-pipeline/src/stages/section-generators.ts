// src/stages/section-generators.ts
// Stage 3: Summary + Experience generators.
//
// Major redesign: bullets are now rewritten from structured briefs + plans
// instead of free-form prose. Anti-AI rules (buzzword ban, burstiness,
// context markers) live INSIDE the primary prompt rather than in a post-hoc
// repair pass. The LLM never sees a seniority tier label — metric invention
// bands are injected as concrete numbers derived from the candidate's exact
// YoE float, so a 4.2-year candidate never gets anchored to the "mid" floor.

import { z } from "zod";
import { models } from "../config/models.js";
import { SummaryOutputSchema } from "../schemas/summary.js";
import {
  ExperienceOutputSchema,
  type ExperienceBullet,
} from "../schemas/experience.js";
import { callLLM } from "../observability/llm-wrapper.js";
import type { JDAnalysis } from "../schemas/jd-analysis.js";
import type {
  ParsedRole,
  GeneratedRole,
} from "../schemas/pipeline.js";
import type { SnapshotStore } from "../observability/debug.js";
import type { CandidateProfile } from "./candidate-profile.js";
import { inventionBands, extractDateRange } from "./candidate-profile.js";
import {
  categorizeJdSkills,
  implicitOnly,
} from "./implicit-skills.js";
import { buildRoleBriefs, type BulletBrief } from "./bullet-brief.js";
import {
  buildPlans,
  formatPlanForPrompt,
  type BulletPlan,
} from "./bullet-plan.js";

// ── Strict App-Side Schemas ────────────────────────────────────

const StrictSummarySchema = z.object({
  summary: z
    .string()
    .min(50, "Summary too short")
    .max(1000, "Summary too long"),
});

const StrictExperienceBulletSchema = z.object({
  text: z
    .string()
    .min(15, "Bullet too short")
    .max(250, "Bullet too long (max 250 chars for scannability)"),
  technologies: z.array(z.string()),
});

const StrictRoleSchema = z.object({
  roleTitle: z.string().min(1),
  company: z.string().min(1),
  bullets: z
    .array(StrictExperienceBulletSchema)
    .min(1, "Role must have at least 1 bullet"),
});

const StrictExperienceSchema = z.object({
  roles: z.array(StrictRoleSchema).min(1, "Must have at least 1 role"),
});

// ── Shared Anti-AI Guidance ────────────────────────────────────
// Bakes the research-report findings into every generation prompt so we do
// not rely solely on the post-hoc humanize pass.

const BUZZWORD_BAN =
  "spearheaded, orchestrated, leveraged, leveraging, utilize, utilized, utilizing, facilitated, championed, pioneered, revolutionized, cutting-edge, best-in-class, world-class, robust, seamless, synergy, synergized, holistic, paradigm, state-of-the-art";

const ANTI_AI_RULES = `
ANTI-AI DETECTION RULES (violating these makes your output obviously AI-written):

HIGHEST-PRIORITY RULE — PERSONAL CONTEXT MARKERS (this is what real
engineering resumes look like; AI resumes skip it):
- AT LEAST 40% of bullets in EACH role must contain a personal context
  marker that grounds the work in a specific time, ceremony, or team.
- Each role with 5+ bullets MUST include at least TWO quarter+year
  anchors (e.g. "Q3 2022", "Q1 2021", "Q4 2023"). Pick quarters
  that fall inside the role's date range. Distribute across the role,
  not all on the same bullet.
- Valid context markers (use a MIX of these, don't lean on only one type):
    * Temporal anchors: "Q1 2022", "Q3 2023", "in early 2024",
      "late Q4 2021".
    * Agile / scrum ceremonies: "during sprint planning", "at sprint
      demo", "in the Q3 retrospective", "during backlog refinement",
      "at Q2 PI planning", "during grooming for epic X",
      "in the Q2 release-cycle standup", "during the Q4 RC hardening".
    * User-story / estimation vocabulary: "broke the epic into 5
      user stories", "pointed at 13 story points", "pulled 3 tickets
      from the Q3 backlog", "sized the spike at 5 points", "split
      the story across 2 sprints".
    * Team / squad names: "the payments team", "the risk platform
      squad", "the settlements team", "the on-call rotation",
      "the checkout pod".
    * Release / milestone tags: "during the Q2 release cycle",
      "for the v4.2 release", "in the Q3 hardening freeze",
      "before the Black Friday cutover".
    * Stakeholder groups: "with the QA engineers", "for the
      compliance team", "with product management during the Q3
      roadmap review".
- Blend markers naturally into the bullet. They should feel like a
  detail an engineer would actually remember and write, not like a
  tacked-on label.

OTHER ANTI-AI RULES:
- NEVER use these buzzwords: ${BUZZWORD_BAN}.
- KEEP RESUME REGISTER: write like a formal resume, not like a Slack
  message, standup, or blog post. Do NOT use informal/narrative verbs
  such as "unblocked", "ballooned", "tackled", "hacked", "kicked off",
  "rolled up", "nailed", "knocked out", "smashed", "crushed", "slammed",
  "wrangled".
- AVOID colorful narrative metaphors for neutral facts: do NOT write
  that metrics "ballooned", "skyrocketed", "plummeted", "exploded",
  "soared", "tanked", "crashed". Use plain verbs: "grew", "rose",
  "climbed", "fell", "dropped", "reached".
- NEVER use em dashes (—) or en dashes (–). Use commas, periods, or
  semicolons.
- NEVER reuse any JD phrase of 6+ consecutive words verbatim.
- NEVER write "X, resulting in Y" or "X, while Y-ing" — these are
  ChatGPT signatures.
- NEVER start two consecutive bullets with the same verb.
- Vary sentence shape: mix action-first, impact-first, context-first,
  and problem-first patterns across a role.
- Bullet lengths MUST vary visibly: some short (11-15 words, single
  clause, period ok at the end), most medium (22-28 words), a few
  longer (30-34 words). Uniform-length bullets = instantly flagged
  as AI.
- Fragments are allowed on SHORT bullets, e.g.
  "Owned the CI pipeline. 400+ builds/month, 99.2% green."`;

const FEWSHOT_EXAMPLES = `
FEW-SHOT EXAMPLES (AI-sounding → humanized, plus framing for platform scale):

AI:  "Spearheaded the development of innovative software solutions to optimize efficiency."
OK:  "Built a Python ETL that replaced 6 spreadsheets, cutting manual entry by 10 hours/week."

AI:  "Driven leader with expertise in full-stack development, managing cross-functional teams."
OK:  "Led 4 engineers on the payments team to ship the new checkout flow, lifting conversion 8%."

AI:  "Strong analytical skills used to improve financial performance and drive strategic initiatives."
OK:  "Reworked the Q2 forecasting model, closing a recurring $120K variance against plan."

AI:  "Leveraged cutting-edge cloud technologies to build robust, scalable solutions."
OK:  "Moved the job queue from RabbitMQ to SQS, halving infra cost and smoothing peak-hour spikes."

SCALE FRAMING EXAMPLES (Category B — platform scale cited, IC action kept
distinct, plausible for the employer):

Employer: Truist Bank (top-10 US bank, public payment-volume scale)
OK:  "Designed REST APIs for payment services using Spring Boot, eliminating
      idempotency errors across 5M+ monthly transactions."
OK:  "Debugged and maintained Spring Boot microservices behind AWS API
      Gateway, handling 12K daily API requests."
BAD: "Processed 5M+ transactions monthly."
     (claims personal authorship of the whole volume)

Employer: 20-person early-stage startup
OK:  "Shipped the billing service, supporting the platform's first 200 paying
      customers without an on-call page for 6 weeks."
BAD: "Built a billing system handling 10M transactions monthly."
     (wildly implausible for a 20-person startup)

Employer: Healthcare plan admin (Fortune 100, e.g. UnitedHealth / Optum)
OK:  "Refined RESTful APIs for the member portal using Spring Boot and
      Spring MVC, supporting 5K+ daily eligibility lookups."

RESCALE EXAMPLES (use sparingly — only when the original number is clearly
off by an order of magnitude from a well-known employer's real scale):

Employer: Google (FAANG, public QPS in the billions)
Original bullet: "Built REST APIs handling 10K requests daily."
Observation:     10K/day is 5+ orders of magnitude below Google's
                 platform scale — almost certainly an admin/internal
                 tool, and the candidate has understated scope.
Rescaled OK:     "Built REST APIs for a Google platform microservice,
                 sustaining ~3M daily requests at sub-50ms p95."
                 → Candidate action preserved ("Built REST APIs").
                 → Scope narrowed to "a Google platform microservice"
                   so the candidate isn't claiming the whole of Google.
                 → Scale (3M/day) is credible for a team-owned service
                   inside Google, within the junior/mid IC scope band.
                 → Reported in invented.scope as:
                   "rescaled from 10K daily to 3M daily to align with
                    Google platform scale".
Rescaled BAD:    "Built REST APIs handling 1B daily requests at Google."
                 → Claims the whole Google traffic; not credible for
                   any individual IC regardless of seniority.

Employer: 15-person early-stage startup
Original bullet: "Shipped billing service handling 10M transactions monthly."
Observation:     10M/month is wildly above early-stage plausibility
                 (band 100-10K). Either a typo or overclaim.
Rescaled OK:     "Shipped billing service supporting the company's
                 first ~800 paying customers through production launch."
                 → Qualitative pivot to avoid fabrication in either
                   direction.
                 → Reported in invented.scope as:
                   "rescaled from 10M monthly transactions to ~800
                    customers to align with early-stage scale".

AGILE / CEREMONY / USER-STORY EXAMPLES (this is what real engineering
resumes sound like — human, specific, grounded in time and team
rituals; aim for ~40% of bullets in a role to carry one of these):

Quarter + release cycle:
OK:  "Stabilized the payments settlement job during the Q3 2022
      release cycle, bringing the nightly SLA from 87% to 99.1%."
OK:  "Owned the Kafka consumer rebalance fix that went out in the
      Q1 2023 hardening freeze, cutting on-call pages by roughly half."

Sprint planning / user stories / story points:
OK:  "Broke the member-eligibility epic into 6 user stories during
      Q2 2022 sprint planning, shipping all 34 points across two
      sprints with zero rollover."
OK:  "Pulled 3 performance tickets from the Q4 backlog, sized them
      at 8 points collectively, and merged all three before the
      sprint demo."
OK:  "Refined and pointed the idempotency-key spike at 5 story
      points in Q3 2023, then led the implementation across the
      settlements team."

Sprint demo / retrospective / backlog grooming:
OK:  "Presented the circuit-breaker rollout at the Q2 sprint demo,
      walking through failover behavior for 4 downstream services."
OK:  "Drove retrospective action items after the Q1 2023 RC outage,
      adding synthetic-monitoring dashboards that caught two
      regressions before the next release."
OK:  "Refactored query-tuning guidance during Q3 2022 backlog
      grooming, cutting review time per story by about 20%."

On-call / RC / release trains:
OK:  "Rotated on the payments on-call roster through Q4 2022,
      resolving 17 production incidents with a median MTTR under
      30 minutes."
OK:  "Owned two RC hardening cycles in 2023, gating 14 services
      through load-testing and integration sign-off with QA."

Stakeholder / team / pod anchors:
OK:  "Paired with the settlements squad during the Q2 sprint on
      Kafka consumer tuning, trimming average lag from 400ms to 80ms."
OK:  "Partnered with the compliance team in Q3 2023 to roll out
      audit-log redaction across 9 member-facing endpoints."

BAD (no temporal or ceremonial anchor at all — generic AI feel):
BAD: "Developed microservices to support business requirements and
      improve system performance."
BAD: "Collaborated with cross-functional teams to deliver
      high-quality software on time."`;

// ── Summary Generator ──────────────────────────────────────────

const SUMMARY_BUZZWORD_CHECK =
  /\b(results-?driven|results-?oriented|highly motivated|dynamic(?: professional)?|proven track record|passionate about (?:driving|delivering)|exceptional|innovative solutions|strong analytical skills|thought leader)\b/i;

export async function generateSummary(
  currentSummary: string,
  jd: JDAnalysis,
  experienceLevel: string,
  profile: CandidateProfile,
  snapshotStore?: SnapshotStore,
): Promise<{
  summary: string;
  inputTokens: number;
  outputTokens: number;
  rewroteForBuzzwords: boolean;
}> {
  // Bucket JD skills into explicit / implicit / missing. "Implicit" means
  // universally backed by an explicit skill (e.g. Spring Boot implies
  // J2EE, REST API development, Mockito, servlet APIs, MVC). Naming
  // implicit skills is honest — recruiters expect them. Only the
  // "missing" bucket is off-limits for the summary.
  const jdRequiredOrPreferred = [
    ...jd.requiredSkills,
    ...jd.preferredSkills,
  ];
  const buckets = categorizeJdSkills(
    jdRequiredOrPreferred,
    profile.technologiesUsed,
  );
  const implicitWithSources = buckets.implicit.map((s) => {
    const srcs = buckets.implicitSources[s];
    return srcs && srcs.length > 0
      ? `${s} (backed by ${srcs.join(" + ")})`
      : s;
  });

  const prompt = `Rewrite this resume summary for a ${jd.position} role at ${jd.company}.

CURRENT SUMMARY:
${currentSummary}

${candidateProfileBlock(profile)}

JD CONTEXT:
- Domain: ${jd.domainFocus}
- Required Skills: ${jd.requiredSkills.join(", ")}
- Preferred Skills: ${jd.preferredSkills.join(", ")}
- Key Responsibilities: ${jd.keyResponsibilities.slice(0, 5).join("; ")}
- Experience Level: ${experienceLevel}

TECH ALIGNMENT (ground truth — three buckets):

1) JD skills EXPLICITLY in the candidate's base resume
   (strongest signal — prefer these when both are available):
   ${buckets.explicit.length ? buckets.explicit.join(", ") : "(none)"}

2) JD skills IMPLICITLY backed by an explicit skill
   (safe and honest to claim — these are universally implied by the
   explicit tech; naming them is EXPECTED by recruiters, not
   fabrication; e.g. a Spring Boot developer correctly claims J2EE
   and REST API development):
   ${implicitWithSources.length ? implicitWithSources.join("; ") : "(none)"}

3) JD skills the candidate does NOT have anywhere
   (NEVER claim these — claiming a tool/product the candidate has
   never touched is fabrication and creates a contradiction with the
   Experience section):
   ${buckets.missing.length ? buckets.missing.join(", ") : "(none — full coverage)"}

RULES:
- 2-3 sentences MAXIMUM. Punchy and scannable — recruiters spend 6 seconds.
- First sentence: who you are + years of experience + core domain.
- Second sentence: 3-5 most relevant technical skills chosen ONLY from
  buckets 1 and 2 above. Prefer bucket 1 (explicit) — pull from bucket
  2 (implicit) only when the explicit coverage doesn't carry the
  JD-relevant signal on its own. NEVER name anything from bucket 3 —
  that is resume fraud.
- Optional third sentence: one standout achievement or differentiator.
- Mirror JD language and priorities naturally. Do NOT paste long JD phrases.
- Do NOT list every skill — that's what the Skills section is for.
- Do NOT start with "Results-driven", "Highly motivated", "Dynamic", "Passionate about".
- Do NOT use "proven track record", "exceptional", "innovative solutions", "strong analytical skills".
- Years of experience in sentence 1 MUST match the candidate profile's
  ${profile.yearsOfExperience.toFixed(1)} years (round to "${Math.floor(profile.yearsOfExperience)}+ years" for resume phrasing).
${ANTI_AI_RULES}

FORMATTING:
- Return plain text. No LaTeX (\\textbf{}, \\textit{}).
- Use symbols naturally (%, $). Do NOT spell out as words.

Return the summary as a single string.`;

  const result = await callLLM({
    model: models.generation,
    schema: SummaryOutputSchema,
    prompt,
    stage: "summary-generator",
    snapshotStore,
  });

  let finalSummary = result.object.summary;
  let totalIn = result.inputTokens;
  let totalOut = result.outputTokens;
  let rewrote = false;

  // Post-generation buzzword check. One-shot rewrite if flagged.
  if (SUMMARY_BUZZWORD_CHECK.test(finalSummary)) {
    console.log(
      `[summary-generator] Buzzwords detected, running one-shot rewrite.`,
    );
    try {
      const rewritePrompt = `Rewrite the following resume summary to remove AI-cliché phrases while keeping every fact, skill, and metric identical.

SUMMARY TO FIX:
${finalSummary}

BANNED phrases (rewrite around them): results-driven, results-oriented, highly motivated, dynamic, proven track record, passionate about driving, exceptional, innovative solutions, strong analytical skills, thought leader, ${BUZZWORD_BAN}.

RULES:
- Keep the same length and structure (2-3 sentences).
- Keep all skills, years, and metrics.
- Plain conversational language. No buzzwords.
- No em dashes, no en dashes.

Return a single string.`;

      const rewriteResult = await callLLM({
        model: models.repair,
        schema: SummaryOutputSchema,
        prompt: rewritePrompt,
        stage: "summary-generator-rewrite",
        snapshotStore,
      });
      finalSummary = rewriteResult.object.summary;
      totalIn += rewriteResult.inputTokens;
      totalOut += rewriteResult.outputTokens;
      rewrote = true;
    } catch (err) {
      console.warn(
        `[summary-generator] Buzzword rewrite failed, keeping original: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const parsed = StrictSummarySchema.safeParse({ summary: finalSummary });
  if (!parsed.success) {
    console.warn(
      `[summary-generator] Strict validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}. Using LLM output as-is.`,
    );
  }

  return {
    summary: finalSummary,
    inputTokens: totalIn,
    outputTokens: totalOut,
    rewroteForBuzzwords: rewrote,
  };
}

// ── Invention Policy Block ─────────────────────────────────────
// Injected into experience prompts as concrete numbers so the LLM cannot
// anchor to a tier floor.

function inventionPolicyBlock(profile: CandidateProfile): string {
  const bands = inventionBands(profile.yearsOfExperience);
  const yoeStr = profile.yearsOfExperience.toFixed(1);
  return `METRIC INVENTION POLICY (two distinct categories — read carefully):
Candidate has exactly ${yoeStr} years of total experience (source: ${profile.yoeSource}).

Users often forget to include numbers in their base resume. Part of your
job is to restore credible, believable metrics. There are two very
different categories of metrics, with different rules:

──────────────────────────────────────────────────────────────────────
CATEGORY A — IC-OWNED IMPACT (the candidate PERSONALLY caused this):
  improvement percentages, latency cuts, coverage raises, defect
  reductions, cycle time cuts, team size led / mentored / paired with.

  INVENT when the plan marks a bullet "metric: REQUIRED" and the
  original has no such number. Bounded by THIS candidate's YoE
  (hard ceilings, never exceed):
    - Improvement %:   ${bands.improvementPctMin}-${bands.improvementPctMax}%   (HARD MAX ${bands.improvementPctMax}%)
    - Team size:       ${bands.teamSizeMin}-${bands.teamSizeMax} people   (HARD MAX ${bands.teamSizeMax})

  Default toward the middle of the range. The upper end is reserved for
  the candidate's most substantial or most recent work. Prefer odd/non-
  round numbers ("22%", "17 min", "3 to 5 defects") over uniform round
  ones — uniform round numbers are an AI tell.

──────────────────────────────────────────────────────────────────────
CATEGORY B — SYSTEM / EMPLOYER SCALE (a property of the PRODUCT the
  candidate worked on, NOT of the candidate themselves):
  daily/monthly request counts, transaction volumes, user / customer
  counts, data volume, revenue handled, rows / events processed.

  These numbers ARE allowed and encouraged — a Truist engineer's API
  work is more credible framed against Truist's real payment volume.
  BUT they must be framed so the scale applies to the platform/system,
  NOT to the candidate's personal authorship, and the number must be
  plausible for the employer's known size.

  RULES:
  1. If the ORIGINAL brief has a scale number AND it is PLAUSIBLE for
     the employer (within the band for that employer's size), PRESERVE
     it verbatim. Never round, inflate, or shrink.
  2. If the ORIGINAL brief has NO scale number AND the candidate's
     employer is a well-known large org (Fortune 500, big bank, big
     tech, major healthcare/insurance, etc.), you MAY cite a
     realistic PLATFORM-LEVEL scale number ONCE in the bullet,
     PROVIDED the bullet clearly separates "what I did" from "the
     system's scale".
  3. RESCALE MISALIGNED NUMBERS (high bar — use sparingly):
     If the ORIGINAL scale number is at least ONE ORDER OF MAGNITUDE
     OFF from the employer's plausible band, AND you are confident
     about the employer's real scale (well-known company, public
     numbers), you MAY adjust the scale number. Most commonly this
     means bumping conservatively-written numbers UP at known giants
     (e.g. "10K req/day at Google" is almost certainly a single
     admin/internal tool, and the candidate has likely understated
     the platform context they operated within). Less commonly, it
     means adjusting DOWN when a candidate overclaimed at a small
     employer.
     Required safeguards when rescaling:
       a. Preserve the candidate's specific ACTION verbatim — only
          the scale and its framing change, never WHAT the candidate
          did.
       b. Frame the rescaled number as the PLATFORM's scale (a
          service/component WITHIN the larger platform), never as the
          candidate's personal output. A 2-year IC at Google did not
          personally scale Google's 1B-QPS systems; they worked on a
          team-level service within it.
       c. Cap by the candidate's YoE — more experience allows larger
          scope framing. A junior is framed at team-service scope
          (1M-10M range inside a FAANG), not platform-wide scope.
       d. Report before → after in "invented.scope" with the exact
          text "rescaled from <original> to <new> to align with
          <employer> platform scale".
  4. Stay within plausible ranges for the employer type:
       - Early-stage startup (<50 people):  100 - 10K
       - Scale-up / mid-size company:       10K - 1M
       - Large enterprise (500-10K emp):    100K - 10M
       - Fortune 500, top-10 bank, FAANG:   1M - 500M
     If you don't confidently know the employer's size, DO NOT invent
     or rescale. Prefer qualitative ("bank-scale volume", "production
     traffic").
  5. Frame correctly — scale is the PLATFORM's, not the IC's:
       GOOD: "Designed REST APIs for payment services, eliminating
              idempotency errors across 5M+ monthly transactions."
              → IC action: "Designed REST APIs"
              → Platform scale: "5M+ monthly transactions"
              → Clear separation; scale is a property of the platform.
       GOOD: "Maintained Spring Boot services behind AWS API Gateway,
              handling 12K daily API requests."
              → IC action: "Maintained Spring Boot services"
              → Platform scale: "12K daily API requests"
       GOOD (rescaled upward at Google, scope narrowed to the
             candidate's actual service): "Owned a search suggestion
              microservice within Google's web platform, serving
              roughly 3M queries daily with sub-50ms p95."
              → Candidate's personal scope: one microservice.
              → Platform scale: 3M daily queries (realistic for a
                team-level service inside Google's ecosystem).
       BAD:  "Processed 5M+ transactions monthly."
              → Sounds like the candidate personally moved 5M txns.
       BAD:  "Built a platform handling 5M+ transactions."
              → Wrong if the platform predates the candidate by years.
       BAD:  "Scaled Google to 1B requests per day."
              → No IC, regardless of seniority, did this solo.
  6. At most ONE Category-B scale number per bullet.
  7. Every invented OR rescaled Category-B number MUST be reported in
     the "invented" field under "scope" so the user can review it.
     Preserved verbatim numbers are NOT inventions — leave scope null
     for those.

──────────────────────────────────────────────────────────────────────
ABSOLUTE RULES (both categories):
- NEVER exceed the HARD MAX of any Category-A band.
- NEVER cite Category-B scale outside the plausible range for the
  employer; when in doubt, stay qualitative.
- NEVER invent project names, clients, employer names, stakeholder
  names, or technologies not in the candidate profile's known tech list.
- NEVER invent metrics for bullets the plan does NOT mark "metric: REQUIRED"
  (those stay qualitative).
- ALWAYS report every invented Category-A number in "invented.metric",
  every invented Category-B scale in "invented.scope", and any invented
  qualitative context (team name, quarter, release) in "invented.context".
  Preserved numbers from the original brief are NOT inventions — leave
  those fields null for preserved content.`;
}

function candidateProfileBlock(profile: CandidateProfile): string {
  // Expose the implicit-skill set so experience bullets can honestly
  // mention concepts the candidate demonstrably knows (e.g. "REST API"
  // for a Spring Boot developer) without being blocked as fabrication.
  // Capped at 25 entries to keep the prompt tight.
  const implicit = implicitOnly(profile.technologiesUsed).slice(0, 25);
  return `CANDIDATE PROFILE (ground truth — do not contradict):
- Total experience: ${profile.yearsOfExperience.toFixed(1)} years (${profile.yoeSource}).
- Technologies EXPLICITLY listed in base resume (prefer these in bullets):
  ${profile.technologiesUsed.join(", ") || "(none detected)"}
- Technologies IMPLICITLY known (safe to mention when truthful; these are
  universally implied by the explicit tech — e.g. Spring Boot implies
  J2EE and REST API development):
  ${implicit.length ? implicit.join(", ") : "(none)"}
- Dominant impact areas: ${profile.domainCategories.join(", ") || "(mixed)"}
- RULE: never cite a discrete product (Grafana, Elasticsearch, Kibana,
  MongoDB, etc.) that is NOT in either list above — that is fabrication.`;
}

// ── Per-role temporal/ceremony anchors ─────────────────────────
//
// Enumerate valid (quarter, year) pairs that fall inside this role's
// actual date range. Injected into the per-role prompt so the LLM anchors
// context markers in real quarters (e.g. "Q3 2022") instead of either
// skipping them or hallucinating quarters outside the role window.
//
// We also suggest a target count of markers for the role based on the
// bullet count. 40% of bullets in a role should carry a context marker;
// of those, at least two should be quarter+year specifically.
function formatRoleAnchors(heading: string, bulletCount: number): string {
  const range = extractDateRange(heading);
  if (!range) {
    return `ROLE CONTEXT ANCHORS:
- Could not parse dates from this role heading.
- Use team-name, ceremony-name, or release-cycle markers instead of
  quarter+year (e.g. "during sprint planning", "at the sprint demo",
  "with the on-call rotation").
- At least ${Math.max(2, Math.round(bulletCount * 0.4))} of ${bulletCount} bullets must carry SOME personal context marker.`;
  }

  // Build quarter list from fractional-year start/end (inclusive on both
  // ends). Cap at ~16 quarters to keep the prompt tight on long roles.
  const startY = Math.floor(range.startYear);
  const startQ = Math.min(3, Math.floor((range.startYear - startY) * 4));
  const endY = Math.floor(range.endYear);
  const endQ = Math.min(3, Math.floor((range.endYear - endY) * 4));

  const quarters: string[] = [];
  let y = startY;
  let q = startQ;
  while (y < endY || (y === endY && q <= endQ)) {
    quarters.push(`Q${q + 1} ${y}`);
    q++;
    if (q > 3) {
      q = 0;
      y++;
    }
    if (quarters.length >= 16) break;
  }

  const targetMarkers = Math.max(2, Math.round(bulletCount * 0.4));
  const minQuarterMarkers = bulletCount >= 5 ? 2 : 1;

  return `ROLE CONTEXT ANCHORS (use these to ground bullets in real time + team rituals):
- Role date range (parsed): ${range.startYear.toFixed(2)} to ${range.endYear.toFixed(2)}
- Valid quarter anchors (only pick from this list — do NOT invent
  quarters outside the role's range):
    ${quarters.join(", ")}
- TARGET: at least ${targetMarkers} of ${bulletCount} bullets must carry some
  personal context marker (quarter+year, agile ceremony, team/squad name,
  release cycle, or stakeholder group).
- Of those, at least ${minQuarterMarkers} bullet${minQuarterMarkers === 1 ? "" : "s"} in this role MUST use a
  specific quarter+year from the list above.
- Distribute anchors across different bullets — do NOT stack two
  quarters on the same bullet, and do NOT reuse the same quarter in
  multiple bullets in the same role.
- Anchors must feel natural, not tacked on. Good: "during Q3 2022
  sprint planning, broke the epic into 5 stories...". Bad: "Did X. Q3 2022."`;
}

// ── Per-bullet instruction block ───────────────────────────────

function formatBriefsAndPlans(
  briefs: BulletBrief[],
  plans: BulletPlan[],
): string {
  const lines: string[] = [];
  for (let i = 0; i < briefs.length; i++) {
    const b = briefs[i];
    const p = plans[i];
    lines.push(`
BULLET [${b.roleIndex}-${b.bulletIndex}]
  ORIGINAL: "${b.rawText}"
  brief: action="${b.action}", tech=[${b.technologies.join(", ")}], metric=${b.metric ? `"${b.metric}"` : "none"}, scope=${b.scope ? `"${b.scope}"` : "none"}, project=${b.projectTag ? `"${b.projectTag}"` : "none"}
  plan: ${formatPlanForPrompt(p)}`);
  }
  return lines.join("\n");
}

// ── Batch Experience Generator ─────────────────────────────────

export async function generateExperience(
  roles: ParsedRole[],
  jd: JDAnalysis,
  experienceLevel: string,
  profile: CandidateProfile,
  snapshotStore?: SnapshotStore,
): Promise<{
  roles: GeneratedRole[];
  inputTokens: number;
  outputTokens: number;
  bullets: ExperienceBullet[][]; // full structured output for trace
}> {
  // Build briefs + plans up front (deterministic)
  const rolesBriefs = roles.map((role, ri) =>
    buildRoleBriefs(
      role.bullets,
      ri,
      [...jd.requiredSkills, ...jd.preferredSkills],
    ),
  );

  const plans = buildPlans({
    rolesBriefs,
    jobIdSeed: `${jd.company}|${jd.position}|${jd.jobId || "nojob"}`,
  });

  // Build per-role briefing block
  const rolesContext = roles
    .map((role, i) => {
      const lines = role.heading.split("\n").filter((l) => l.trim());
      return `ROLE ${i}: ${lines.join(" | ")}
${formatRoleAnchors(role.heading, role.bullets.length)}
${formatBriefsAndPlans(rolesBriefs[i], plans[i])}`;
    })
    .join("\n\n");

  const prompt = `You are rewriting resume experience bullets for a ${jd.position} role at ${jd.company}.

The candidate's base resume is the source of truth. Your job is to rewrite
each bullet using the pre-computed PLAN (length / opening verb / sentence
pattern / metric requirement) so the final resume has visible burstiness
and passes AI-detection checks. You work FROM structured briefs, not
free prose.

${candidateProfileBlock(profile)}

${inventionPolicyBlock(profile)}

${ANTI_AI_RULES}

${FEWSHOT_EXAMPLES}

JD CONTEXT:
- Position: ${jd.position} at ${jd.company}
- Domain: ${jd.domainFocus}
- Required Skills: ${jd.requiredSkills.join(", ")}
- Preferred Skills: ${jd.preferredSkills.join(", ")}
- Key Responsibilities: ${jd.keyResponsibilities.join("; ")}
- JD-declared Level: ${experienceLevel}
- Key Phrases to mirror (do not paste verbatim): ${jd.keyPhrases.join(", ")}

ROLES AND PER-BULLET PLANS:
${rolesContext}

HARD CONSTRAINTS:
- Keep the SAME number of bullets per role.
- Each bullet must start with the PLAN's "opening verb" (tense may vary).
- Each bullet must fall within the PLAN's word band (±1 word tolerance).
- Each bullet must follow the PLAN's sentence pattern.
- Each bullet must preserve every technology in "PRESERVE technologies".
- Each bullet must preserve every metric in "PRESERVE metric verbatim".
- Each bullet must preserve the project name in "PRESERVE project name".
- Each role must honor its ROLE CONTEXT ANCHORS block: hit the target
  number of context markers, using the listed valid quarters only, and
  distributing markers across different bullets.
- Weave required/preferred JD skills into bullets where truthful; list
  them in that bullet's "keywordsUsed" array.
- Bullets with no real metric AND plan="metric: REQUIRED" may invent ONE
  number per the invention policy. Report what was invented in "invented".
- Bullets with "metric: optional" stay qualitative — show impact without
  numbers. Pick these to break the numeric monotony.
- Do NOT fabricate project names, employers, or technologies outside the
  candidate profile tech list.
- Do NOT modify factual content (what the candidate actually did).

FORMATTING:
- Plain text per bullet. No LaTeX (\\textbf{}, \\textit{}).
- Symbols OK (%, $, &) — they will be escaped automatically.
- No em dashes, no en dashes.

OUTPUT SCHEMA:
Return { roles: [{ roleTitle, company, bullets: [{ text, technologies,
keywordsUsed, invented }] }] }. "invented" is { metric, scope, context }
or null if nothing was added beyond the brief.`;

  const result = await callLLM({
    model: models.generation,
    schema: ExperienceOutputSchema,
    prompt,
    stage: "experience-generator",
    snapshotStore,
  });

  const parsed = StrictExperienceSchema.safeParse(result.object);
  if (!parsed.success) {
    console.warn(
      `[experience-generator] Strict validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}. Proceeding with LLM output.`,
    );
  }

  const bullets = result.object.roles.map((r) => r.bullets);
  const simpleRoles: GeneratedRole[] = result.object.roles.map((r) => ({
    roleTitle: r.roleTitle,
    company: r.company,
    bullets: r.bullets.map((b) => b.text),
  }));

  return {
    roles: simpleRoles,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    bullets,
  };
}

// ── Per-Role Experience Generator ──────────────────────────────

export async function generateExperiencePerRole(
  roles: ParsedRole[],
  jd: JDAnalysis,
  experienceLevel: string,
  profile: CandidateProfile,
  snapshotStore?: SnapshotStore,
): Promise<{
  roles: GeneratedRole[];
  inputTokens: number;
  outputTokens: number;
  bullets: ExperienceBullet[][];
}> {
  let totalIn = 0;
  let totalOut = 0;

  // Plans built ONCE across all roles to keep verb assignment globally unique.
  const rolesBriefs = roles.map((role, ri) =>
    buildRoleBriefs(
      role.bullets,
      ri,
      [...jd.requiredSkills, ...jd.preferredSkills],
    ),
  );
  const plans = buildPlans({
    rolesBriefs,
    jobIdSeed: `${jd.company}|${jd.position}|${jd.jobId || "nojob"}`,
  });

  const generatedRoles: GeneratedRole[] = [];
  const allBullets: ExperienceBullet[][] = [];

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    const lines = role.heading.split("\n").filter((l) => l.trim());
    const briefs = rolesBriefs[i];
    const rolePlans = plans[i];

    const prompt = `You are rewriting resume experience bullets for ONE role for a ${jd.position} role at ${jd.company}.

${candidateProfileBlock(profile)}

${inventionPolicyBlock(profile)}

${ANTI_AI_RULES}

${FEWSHOT_EXAMPLES}

JD CONTEXT:
- Position: ${jd.position} at ${jd.company}
- Domain: ${jd.domainFocus}
- Required Skills: ${jd.requiredSkills.join(", ")}
- Preferred Skills: ${jd.preferredSkills.join(", ")}
- Key Responsibilities: ${jd.keyResponsibilities.join("; ")}
- JD-declared Level: ${experienceLevel}
- Key Phrases to mirror (do not paste verbatim): ${jd.keyPhrases.join(", ")}

ROLE HEADING: ${lines.join(" | ")}

${formatRoleAnchors(role.heading, role.bullets.length)}

PER-BULLET BRIEFS AND PLANS:
${formatBriefsAndPlans(briefs, rolePlans)}

HARD CONSTRAINTS:
- Exactly ${role.bullets.length} bullets (one per brief above).
- Each bullet starts with its PLAN's "opening verb" (tense may vary).
- Each bullet falls within its word band (±1 word tolerance).
- Follows its sentence pattern.
- Preserves all technologies, metrics, and project names from the brief.
- Weaves JD skills where truthful and reports them in "keywordsUsed".
- Respects invention policy — report invented items in "invented" field.
- Honors ROLE CONTEXT ANCHORS above (quarter markers, ceremony anchors,
  team/squad names).

FORMATTING:
- Plain text. No LaTeX, no em/en dashes.
- Symbols OK (%, $) — auto-escaped.

OUTPUT SCHEMA:
Return { roles: [{ roleTitle, company, bullets: [{ text, technologies,
keywordsUsed, invented }] }] } containing exactly ONE role.`;

    const result = await callLLM({
      model: models.generation,
      schema: ExperienceOutputSchema,
      prompt,
      stage: `experience-generator-role-${i + 1}`,
      snapshotStore,
    });

    const generated = result.object.roles[0];
    if (generated) {
      generatedRoles.push({
        roleTitle: generated.roleTitle,
        company: generated.company,
        bullets: generated.bullets.map((b) => b.text),
      });
      allBullets.push(generated.bullets);
    } else {
      generatedRoles.push({
        roleTitle: "",
        company: "",
        bullets: role.bullets,
      });
      allBullets.push(
        role.bullets.map((t) => ({
          text: t,
          technologies: [],
          keywordsUsed: [],
          invented: null,
        })),
      );
    }

    totalIn += result.inputTokens;
    totalOut += result.outputTokens;
  }

  return {
    roles: generatedRoles,
    inputTokens: totalIn,
    outputTokens: totalOut,
    bullets: allBullets,
  };
}

// ── Targeted Bullet Rewrite (hybrid fallback) ──────────────────
// Used when usePerRoleGeneration=false. After a batch draft, we find
// bullets that deviate from their plan (wrong length, missing verb, missing
// preserved tech, AI buzzword, etc.) and rewrite ONLY those in a second
// LLM call. This is one extra call total, not one per bullet.

export interface TargetedRewriteTarget {
  roleIndex: number;
  bulletIndex: number;
  currentText: string;
  plan: BulletPlan;
  brief: BulletBrief;
  reasons: string[];
}

const TargetedRewriteSchema = z.object({
  rewrites: z.array(
    z.object({
      roleIndex: z.number(),
      bulletIndex: z.number(),
      text: z.string().min(10),
      keywordsUsed: z.array(z.string()).default([]),
      invented: z
        .object({
          metric: z.string().nullable(),
          scope: z.string().nullable(),
          context: z.string().nullable(),
        })
        .nullable()
        .default(null),
    }),
  ),
});

export async function targetedBulletRewrite(
  targets: TargetedRewriteTarget[],
  jd: JDAnalysis,
  profile: CandidateProfile,
  snapshotStore?: SnapshotStore,
): Promise<{
  rewrites: Map<string, { text: string; invented: { metric: string | null; scope: string | null; context: string | null } | null; keywordsUsed: string[] }>;
  inputTokens: number;
  outputTokens: number;
}> {
  if (targets.length === 0) {
    return { rewrites: new Map(), inputTokens: 0, outputTokens: 0 };
  }

  const targetsBlock = targets
    .map(
      (t) =>
        `[${t.roleIndex}-${t.bulletIndex}] CURRENT: "${t.currentText}"
  REASONS: ${t.reasons.join("; ")}
  brief: action="${t.brief.action}", tech=[${t.brief.technologies.join(", ")}], metric=${t.brief.metric ? `"${t.brief.metric}"` : "none"}
  plan: ${formatPlanForPrompt(t.plan)}`,
    )
    .join("\n\n");

  const prompt = `You are fixing specific resume bullets that did not meet their generation plan.

${candidateProfileBlock(profile)}

${inventionPolicyBlock(profile)}

${ANTI_AI_RULES}

JD CONTEXT:
- Required Skills: ${jd.requiredSkills.join(", ")}
- Preferred Skills: ${jd.preferredSkills.join(", ")}

BULLETS TO FIX:
${targetsBlock}

RULES:
- Rewrite ONLY the listed bullets. Do NOT add new ones.
- Each rewrite must satisfy its plan: correct opening verb, word band
  (±1 tolerance), sentence pattern, preserved tech/metric/project.
- Do NOT invent metrics unless the plan says "metric: REQUIRED" and the
  original brief has no metric. Use the invention bands above.
- Report invented items in "invented".

Return { rewrites: [{ roleIndex, bulletIndex, text, keywordsUsed, invented }] }.`;

  const result = await callLLM({
    model: models.repair,
    schema: TargetedRewriteSchema,
    prompt,
    stage: "targeted-bullet-rewrite",
    snapshotStore,
  });

  const rewrites = new Map<
    string,
    {
      text: string;
      invented: { metric: string | null; scope: string | null; context: string | null } | null;
      keywordsUsed: string[];
    }
  >();
  for (const fix of result.object.rewrites) {
    rewrites.set(`${fix.roleIndex}-${fix.bulletIndex}`, {
      text: fix.text,
      invented: fix.invented ?? null,
      keywordsUsed: fix.keywordsUsed ?? [],
    });
  }

  return {
    rewrites,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

// ── Deviation Detector for hybrid mode ─────────────────────────
// Flags bullets that violate their plan badly enough to warrant a rewrite.

const BUZZWORD_REGEX = new RegExp(
  "\\b(" +
    BUZZWORD_BAN.split(",").map((w) => w.trim()).filter(Boolean).join("|") +
    ")\\b",
  "i",
);

export function detectDeviations(
  generatedBullets: ExperienceBullet[][],
  briefs: BulletBrief[][],
  plans: BulletPlan[][],
  jd: JDAnalysis,
): TargetedRewriteTarget[] {
  const targets: TargetedRewriteTarget[] = [];

  // Collect all verbs used across the whole resume (for collision detection)
  const allVerbs: string[] = [];
  for (const role of generatedBullets) {
    for (const b of role) {
      allVerbs.push((b.text.trim().split(/\s+/)[0] || "").toLowerCase());
    }
  }
  const verbCounts = new Map<string, number>();
  for (const v of allVerbs) verbCounts.set(v, (verbCounts.get(v) || 0) + 1);

  const highPriorityKw = [...jd.requiredSkills].map((k) => k.toLowerCase());

  for (let ri = 0; ri < generatedBullets.length; ri++) {
    const role = generatedBullets[ri];
    const rolePlans = plans[ri] || [];
    const roleBriefs = briefs[ri] || [];
    for (let bi = 0; bi < role.length; bi++) {
      const b = role[bi];
      const plan = rolePlans[bi];
      const brief = roleBriefs[bi];
      if (!plan || !brief) continue;

      const reasons: string[] = [];
      const words = b.text.split(/\s+/).length;

      // Length deviation (tolerance ±2)
      if (words < plan.targetWordsMin - 2) reasons.push(`too short (${words} words, target ${plan.targetWordsMin}-${plan.targetWordsMax})`);
      if (words > plan.targetWordsMax + 2) reasons.push(`too long (${words} words, target ${plan.targetWordsMin}-${plan.targetWordsMax})`);

      // Verb collision (same opening verb appears >2 times resume-wide)
      const firstVerb = (b.text.trim().split(/\s+/)[0] || "").toLowerCase();
      if ((verbCounts.get(firstVerb) || 0) > 2) {
        reasons.push(`verb "${firstVerb}" collides (used ${verbCounts.get(firstVerb)}x resume-wide)`);
      }

      // Preserved tech lost
      for (const tech of plan.preservedTechnologies) {
        const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`\\b${escaped}\\b`, "i").test(b.text)) {
          reasons.push(`lost preserved tech "${tech}"`);
        }
      }

      // Preserved metric lost
      if (plan.preservedMetric && !b.text.toLowerCase().includes(plan.preservedMetric.toLowerCase())) {
        reasons.push(`lost preserved metric "${plan.preservedMetric}"`);
      }

      // Buzzword present
      if (BUZZWORD_REGEX.test(b.text)) {
        const m = b.text.match(BUZZWORD_REGEX);
        reasons.push(`contains banned buzzword "${m?.[0]}"`);
      }

      // Required JD skill absent AND bullet pretends to use it via keywordsUsed drift
      // (cheap signal: do nothing here, keyword-gap-repair already handles global coverage)

      // Missing metric when plan REQUIRED it
      if (plan.metricRequired && !/\d/.test(b.text)) {
        reasons.push(`plan required a metric but bullet has no number`);
      }

      if (reasons.length > 0) {
        targets.push({
          roleIndex: ri,
          bulletIndex: bi,
          currentText: b.text,
          plan,
          brief,
          reasons,
        });
      }
    }
  }

  return targets;
}
