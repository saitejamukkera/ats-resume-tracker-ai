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
import type { ParsedRole, GeneratedRole } from "../schemas/pipeline.js";
import type { SnapshotStore } from "../observability/debug.js";
import type { CandidateProfile } from "./candidate-profile.js";
import { inventionBands, extractDateRange } from "./candidate-profile.js";
import { categorizeJdSkills, implicitOnly } from "./implicit-skills.js";
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

const FILLER_PATTERN_BAN = `
FILLER PATTERN BAN (these phrases add ZERO value — delete them, never generate them):
- "using data structures and algorithms"
- "using system design principles"
- "using design patterns"
- "using best practices" / "following best practices"
- "in an agile/scrum environment"
- "following agile methodology"
- "adhering to coding standards"
- "collaborated with cross-functional teams" (unless tied to a specific outcome)
- "participated in agile ceremonies"
- "contributed to team success/goals"
- "ensuring code quality" / "ensuring high quality"
- "various tasks/projects/responsibilities"
- "day-to-day operations/tasks"
- "during sprint planning" (when used as padding without specific content)
These are resume noise. If a phrase could appear on ANY engineer's resume
at ANY company, it's filler. Cut it.`;

const OUTCOME_FIRST_RULES = `
OUTCOME-FIRST WRITING (this is the #1 improvement that separates strong resumes):

THE RULE: Every bullet must answer "what CHANGED because of your work?"
Stop describing work. Start proving outcomes.

TIER A BULLETS (aim for 80% of all bullets):
  - Lead with a measurable outcome or clear result
  - Include scale, performance, or system-level impact
  - Have a before/after or percentage improvement
  Examples:
    "Reduced P95 latency from [X]ms to [Y]ms by consolidating Redis caching across high-frequency query paths."
    "Decreased CI/CD pipeline runtime from [X] to [Y] minutes by restructuring GitHub Actions with Docker layer caching."
    "Reduced defect escape rate to production by raising automated test coverage from [X]% to [Y]% with JUnit 5."

TIER B BULLETS (limit to ~20%):
  - Have an action with some context but weaker impact signal
  - Acceptable for supporting bullets, but push toward Tier A when possible
  Examples:
    "Established OpenTelemetry distributed tracing across microservices, reducing mean time to root-cause by about [X]%."

TIER C BULLETS (DELETE or rewrite — never generate these):
  - Normal engineering work described without any outcome
  - Process/collaboration bullets with no measurable result
  - "Diagnosed 3-5 defects per sprint" — that's just doing your job
  - "Collaborated with the team to deliver" — says nothing
  - "Built APIs serving 3K users" — weak without impact

STRUCTURE PREFERENCE (in order of strength):
  1. OUTCOME-FIRST: "Reduced X by Y% by implementing Z" (STRONGEST)
  2. ACTION-THEN-IMPACT: "Implemented Z, reducing X by Y%" (GOOD)
  3. CONTEXT-THEN-OUTCOME: "During Q3 hardening, decreased on-call pages by [X]% by adding circuit breakers" (GOOD with context)
  4. ACTION-ONLY: "Configured Redis caching for volunteer endpoints" (WEAK — always add "...reducing queries by [X]%")

THE 6-SECOND TEST: A recruiter skims your resume in 6 seconds.
If they can't see concrete impact in the first 3-4 words of each
bullet, you've lost them. Front-load the outcome.`;

const CATEGORY_PRIORITY_RULES = `
80/20 CATEGORY PRIORITIZATION (what a recruiter actually cares about):

The resume must feel like: "this person improves high-scale systems."
NOT like: "this person does general engineering work."

HIGH-VALUE BULLETS (aim for 80% of all bullets — these get you interviews):
  - Performance: latency cuts, throughput gains, cache optimization, P95/P99
  - Scale: request volumes, transaction processing, user counts, data volume
  - Reliability: fault tolerance, circuit breakers, uptime, incident response
  - Security: auth hardening, JWT/OAuth, encryption, compliance
  - Cost: infrastructure savings, efficiency gains

LOW-VALUE BULLETS (limit to 20% MAX — these dilute your strongest story):
  - Process: PR review cycle time, sprint metrics, review guidelines
  - Quality (generic): defect counts per sprint, test coverage (unless framed as system impact)
  - Team: mentoring, collaboration, documentation (unless tied to measurable outcome)
  - Delivery: shipping features, release management (unless tied to velocity/scale)

KILL LIST — never generate these patterns:
  - "Diagnosed defects per sprint" → doing your job, not improving a system
  - "Reduced PR review cycle time by [X]%" → process work, not engineering impact
  - "Collaborated with the team" → says nothing about what you built
  - "Presented at sprint demo" → ceremony attendance, not achievement
  - "Built APIs serving [X]K users" → weak without latency/throughput impact

REFRAME LOW-VALUE INTO HIGH-VALUE:
  Instead of: "Reduced PR review cycle time by [X]%"
  Write:      (DELETE this bullet and replace with a performance/scale bullet)

  Instead of: "Diagnosed defects per sprint"
  Write:      (DELETE — or reframe as: "Resolved payment-flow regressions per sprint cycle, maintaining zero defect carryover across production releases")

  Instead of: "Deployed test coverage suites"
  Write:      "Reduced defect escape rate to production by raising test coverage from [X]% to [Y]% with JUnit 5" (frames quality as RELIABILITY impact)`;

const KEYWORD_INTEGRATION_RULES = `
MISSING JD KEYWORD INTEGRATION (weave missing tech WITH impact):

When the JD requires a technology (e.g. Kafka, Redis, Kubernetes) that
the candidate's base resume lists in skills but NOT in experience bullets,
you MUST naturally weave it into the most relevant experience bullet
WITH demonstrated impact. Never just name-drop.

STRATEGY FOR WEAVING MISSING KEYWORDS:
1. Find bullets where the technology would naturally appear:
   - Kafka → payment processing, event-driven workflows, async pipelines
   - Redis → caching, session management, rate limiting
   - Kubernetes → deployment, scaling, container orchestration
2. Replace a low-value bullet or filler phrase with the keyword + impact:
   - Replace "using system design principles" with "using Kafka event streams"
   - Replace "with efficient lookup algorithms" with "with Redis caching"
3. Always pair the keyword with a measurable outcome:
   BAD:  "...using Kafka for message processing."
   GOOD: "...publishing payment events to Kafka topics, reducing settlement
          lag from batch to near-real-time processing."
   BAD:  "...with Redis caching."
   GOOD: "...with Redis caching, reducing P95 response latency from [X]ms to [Y]ms."

PRIORITY: If you must choose between keeping a low-value process bullet
and replacing it with a keyword+impact bullet, ALWAYS replace.`;

const ANTI_AI_RULES = `
ANTI-AI DETECTION RULES (violating these makes your output obviously AI-written):

${OUTCOME_FIRST_RULES}

${CATEGORY_PRIORITY_RULES}

${KEYWORD_INTEGRATION_RULES}

${FILLER_PATTERN_BAN}

OTHER ANTI-AI RULES:
- NEVER use these buzzwords: ${BUZZWORD_BAN}.
- NO PERSONAL PRONOUNS: Write like a formal resume. Do NOT use personal pronouns like "I", "my", or "me".
- KEEP RESUME REGISTER: Do NOT use informal/narrative verbs such as "unblocked", "ballooned", "tackled", "hacked", "kicked off", "rolled up", "nailed", "knocked out", "smashed", "crushed", "slammed", "wrangled".
- AVOID colorful narrative metaphors for neutral facts: do NOT write that metrics "ballooned", "skyrocketed", "plummeted", "exploded", "soared", "tanked", "crashed". Use plain verbs: "grew", "rose", "climbed", "fell", "dropped", "reached".
- NEVER use em dashes (—) or en dashes (–). Use commas, periods, or semicolons.
- NEVER reuse any JD phrase of 6+ consecutive words verbatim.
- NEVER write "X, resulting in Y" or "X, while Y-ing".
- BULLET LENGTH: The optimal length is 1 to 2 lines per bullet (roughly 15 to 35 words). NEVER exceed 2 lines.
- USE XYZ / STAR METHODOLOGY: [Action Verb] + [Task/Project] + [Context/Tech Stack/How] + [Measurable Result]. Every bullet must clearly state the technologies used to achieve the outcome.
- VARY SENTENCE STRUCTURE: Mix short, punchy statements with descriptive ones, while staying within the 1-2 line limit.
- USE EVERYDAY LANGUAGE: Swap high-level AI phrases for normal terms (e.g. use "used" instead of "utilized"). Eliminate fluff like "various", "numerous", "exceptional" or "proven track record".
- BE CONCRETE: Name specific concrete tools, frameworks, metrics, and outcomes clearly instead of making broad theoretical claims."`;

const FEWSHOT_EXAMPLES = ``;

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
  const jdRequiredOrPreferred = [...jd.requiredSkills, ...jd.preferredSkills];
  const buckets = categorizeJdSkills(
    jdRequiredOrPreferred,
    profile.technologiesUsed,
  );
  const implicitWithSources = buckets.implicit.map((s) => {
    const srcs = buckets.implicitSources[s];
    return srcs && srcs.length > 0 ? `${s} (backed by ${srcs.join(" + ")})` : s;
  });

  // Detect the JD's primary domain for positioning
  const domainKeywords = {
    payments: /\b(payment|transaction|fintech|billing|checkout|settlement|ACH|wire transfer)\b/i,
    banking: /\b(banking|financial|bank|lending|credit|debit|mortgage)\b/i,
    healthcare: /\b(health|medical|HIPAA|clinical|patient|EHR|pharmacy)\b/i,
    ecommerce: /\b(ecommerce|e-commerce|retail|shopping|marketplace|cart)\b/i,
    cloud: /\b(cloud|infrastructure|platform|SaaS|IaaS|PaaS)\b/i,
  };
  const jdText = `${jd.domainFocus} ${jd.keyResponsibilities.join(" ")} ${jd.keyPhrases.join(" ")}`;
  const detectedDomains = Object.entries(domainKeywords)
    .filter(([, pattern]) => pattern.test(jdText))
    .map(([domain]) => domain);
  const primaryDomain = detectedDomains[0] || jd.domainFocus || "distributed systems";

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

POSITIONING STRATEGY (critical — this is what makes the summary land):
The summary must position the candidate as a SPECIALIST, not a generalist.
- Primary domain detected from JD: "${primaryDomain}"
- The candidate should read as: "backend engineer who improves ${primaryDomain} systems at scale"
- NOT as: "general backend engineer who knows many things"
- Lead with the domain and the candidate's strongest outcome area
  (performance optimization, fault tolerance, high-availability systems, etc.)
- The summary should make a hiring manager think: "this person has done
  exactly what we need" within the first 6 seconds of reading.

RULES:
- 2-3 sentences MAXIMUM. Punchy and scannable — recruiters spend 6 seconds.
- First sentence: who you are + years of experience + SPECIFIC domain positioning
  (e.g. "Backend Software Engineer with ${Math.floor(profile.yearsOfExperience)}+ years designing
  high-throughput ${primaryDomain} systems" — NOT "Software Engineer with experience").
- Second sentence: 3-5 most relevant technical skills chosen ONLY from
  buckets 1 and 2 above, framed around the JD's key responsibilities.
  Prefer bucket 1 (explicit). NEVER name anything from bucket 3.
- Optional third sentence: one standout achievement that proves domain expertise
  (e.g. "Consistently delivers against high-availability SLAs across
  AWS-hosted ${primaryDomain} infrastructure.").
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
  return "";
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
    buildRoleBriefs(role.bullets, ri, [
      ...jd.requiredSkills,
      ...jd.preferredSkills,
    ]),
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
- Keep length concise (Target 1 to 2 lines, exactly 15 to 35 words). NEVER exceed 2 lines. 
- Do NOT use personal pronouns like "I", "my", or "me".
- YOU MUST PRESERVE all technologies, metrics, and project names listed in the brief. Do not drop any technologies from the "tech=" array.
- MAXIMIZE ATS SCORE (HARD TECH ONLY): Aggressively weave as many concrete technologies, languages, and frameworks from the JD into the bullets as truthfully possible. Do NOT inject soft skills or abstract concepts (e.g., "algorithms", "design patterns"). List injected keywords in "keywordsUsed".
- You MAY invent realistic metrics (e.g. latency improvement, DB queries reduced) if a bullet needs impact. Report what you invented in "invented".
- ONLY invent standard engineering metrics: latency (ms), throughput (requests/sec), reduction in database queries/CPU (%), pipeline build time (minutes), or test coverage (%).
- NEVER quantify abstract concepts (e.g., do NOT invent "reduced auth bypass risk by 40%", "increased security by 20%", or "improved user experience by 30%").
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
    buildRoleBriefs(role.bullets, ri, [
      ...jd.requiredSkills,
      ...jd.preferredSkills,
    ]),
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

JD CONTEXT:
- Position: ${jd.position} at ${jd.company}
- Domain: ${jd.domainFocus}
- Required Skills: ${jd.requiredSkills.join(", ")}
- Preferred Skills: ${jd.preferredSkills.join(", ")}
- Key Responsibilities: ${jd.keyResponsibilities.join("; ")}
- JD-declared Level: ${experienceLevel}
- Key Phrases to mirror (do not paste verbatim): ${jd.keyPhrases.join(", ")}

ROLE HEADING: ${lines.join(" | ")}

PER-BULLET BRIEFS AND PLANS:
${formatBriefsAndPlans(briefs, rolePlans)}

HARD CONSTRAINTS:
- Exactly ${role.bullets.length} bullets (one per brief above).
- Keep length concise (Target 1 to 2 lines, exactly 15 to 35 words). NEVER exceed 2 lines.
- Do NOT use personal pronouns like "I", "my", or "me".
- YOU MUST PRESERVE all technologies, metrics, and project names listed in the brief. Do not drop any technologies from the "tech=" array.
- MAXIMIZE ATS SCORE (HARD TECH ONLY): Aggressively weave as many concrete technologies, languages, and frameworks from the JD into the bullets as truthfully possible. Do NOT inject soft skills or abstract concepts (e.g., "algorithms", "design patterns"). List injected keywords in "keywordsUsed".
- You MAY invent realistic metrics (e.g. latency improvement) if a bullet needs impact. Report what you invented in "invented".
- ONLY invent standard engineering metrics: latency (ms), throughput (requests/sec), reduction in database queries/CPU (%), pipeline build time (minutes), or test coverage (%).
- NEVER quantify abstract concepts (e.g., do NOT invent "reduced auth bypass risk by 40%", "increased security by 20%", or "improved user experience by 30%").

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
  rewrites: Map<
    string,
    {
      text: string;
      invented: {
        metric: string | null;
        scope: string | null;
        context: string | null;
      } | null;
      keywordsUsed: string[];
    }
  >;
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
- Keeps them concise and human-written. Do not overly complicate verbs.
- YOU MUST PRESERVE all technologies, metrics, and project names listed in the brief. Do not drop any technologies from the "tech=" array.
- You MAY invent realistic metrics if the bullet needs impact. Report what you invented in "invented".
- ONLY invent standard engineering metrics: latency (ms), throughput (requests/sec), reduction in database queries/CPU (%), pipeline build time (minutes), or test coverage (%).
- NEVER quantify abstract concepts (e.g., do NOT invent "reduced auth bypass risk by 40%", "increased security by 20%", or "improved user experience by 30%").

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
      invented: {
        metric: string | null;
        scope: string | null;
        context: string | null;
      } | null;
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
    BUZZWORD_BAN.split(",")
      .map((w) => w.trim())
      .filter(Boolean)
      .join("|") +
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

      // Length deviation
      if (words > 40)
        reasons.push(
          `too long (${words} words, keep it under 40 words)`,
        );



      // Preserved tech lost
      for (const tech of plan.preservedTechnologies) {
        const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`\\b${escaped}\\b`, "i").test(b.text)) {
          reasons.push(`lost preserved tech "${tech}"`);
        }
      }

      // Preserved metric lost
      if (
        plan.preservedMetric &&
        !b.text.toLowerCase().includes(plan.preservedMetric.toLowerCase())
      ) {
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
