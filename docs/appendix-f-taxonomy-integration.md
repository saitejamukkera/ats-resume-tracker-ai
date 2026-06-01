## Appendix F: ESCO Taxonomy Integration Plan

### Motivation

The ATS engine currently relies on a ~130-entry hardcoded `skill-variants.ts` map for keyword synonym resolution. This works well for software engineering roles but misses:

- **Cross-industry skills**: Healthcare ("HIPAA", "EMR"), finance ("Bloomberg", "quantitative analysis"), marketing ("SEO", "HubSpot"), mechanical engineering ("SolidWorks", "FEA")
- **Hierarchical relationships**: "container orchestration" → child skills ["Kubernetes", "Docker Swarm", "Nomad"]. Currently: no string match → keyword missed
- **JD skill does not literally appear in resume**: "CI/CD pipelines" vs "GitHub Actions workflows". Taxonomy knows the parent-child relationship

### Research: Free and Production-Ready

| Source | Key Finding |
|---|---|
| **ESCO official download** | EU government, completely free. CSV/JSON, 15,000+ skills, 3,000+ occupations, 28 languages. License: open EU data, commercial use allowed |
| **ESCO data format** | Fields: `conceptUri`, `preferredLabel`, `altLabels` (**`\n`-delimited** because terms may contain commas e.g. "REST, Representational State Transfer"), `description`, `skillType`. Hierarchy in separate `broaderRelationsSkillPillar.csv` file |
| **esco-skill-extractor** (GitHub, MIT license, 25★) | Uses `all-MiniLM-L6-v2` embeddings + cosine similarity at threshold 0.6 for ESCO skill matching. Same model we already have from Phase 3 |
| **Cadient Talent Research (2026)** | Skills taxonomy integration boosts AI match accuracy by up to 84%. Industry standard for Workday/Greenhouse |
| **RecSysHR 2025 (ESCO Paper)** | Two-stage extraction: bi-encoder + taxonomy → cross-encoder refinement. Taxonomy is the backbone |

**Critical insight:** Phase 3 already loaded `all-MiniLM-L6-v2` — we can reuse it for taxonomy fuzzy matching at zero additional model cost.

### SOLID Architecture

```
┌─────────────────────────────────────────────────────┐
│  ITaxonomyProvider (Interface — DIP)                │
│                                                     │
│  normalize(skill: string): string | null             │
│  getCanonicalLabel(uri: string): string | null       │
│  getSynonyms(uri: string): string[]                  │
│  getBroader(uri: string): string[]                   │
│  getNarrower(uri: string): string[]                  │
└─────────────────────────────────────────────────────┘
         ↑                              ↑
         │                              │
┌────────┴──────────────┐    ┌─────────┴─────────────────┐
│ StaticTaxonomyProvider │    │ EmbeddingTaxonomyProvider  │
│                        │    │                            │
│ - Local JSON lookup    │    │ - Reuses Phase 3 model     │
│ - Sub-ms, deterministic│    │ - Cosine similarity > 0.6  │
│ - 15,000 skills covered│    │ - Falls back when static   │
│ - Built at setup time  │    │   lookup misses            │
└────────────────────────┘    └────────────────────────────┘
         ↑                              ↑
         └──────────────┬───────────────┘
               ┌────────┴────────┐
               │ TaxonomyService  │
               │  (composes both)  │
               │  normalize() →    │
               │   1. Static check  │
               │   2. Embed fallback│
               └───────────────────┘
```

### Implementation Steps

#### Step F1 — One-Time Setup Script

**File:** `resume-pipeline/scripts/build-taxonomy.ts` (NEW)

Reads pre-downloaded ESCO CSV files, builds `skills-taxonomy.json` (~1.5MB without descriptions):

```ts
// Run once: npx tsx scripts/build-taxonomy.ts
// Prerequisite: Manually download ESCO from https://esco.ec.europa.eu/en/use-esco/download
// (requires email, no API key). Save the zip or extracted CSV files to:
//   resume-pipeline/resources/esco/
//
// The script reads TWO files:
//   1. skills_en.csv — columns: conceptUri, preferredLabel, altLabels (\n-delimited), description
//   2. broaderRelationsSkillPillar.csv — columns: conceptUri, broaderConceptUri
//
// 1. Parse skills_en.csv:
//    - Build synonym → canonical URI map
//    - altLabels split on \n (NOT comma — terms contain commas)
//    - Strip description field (not used at runtime, saves ~3.5MB)
//
// 2. Parse broaderRelationsSkillPillar.csv:
//    - Build bidirectional hierarchy: broader[] and narrower[]
//    - Compute TRANSITIVE CLOSURE: narrowers include all descendants recursively
//      (grandchild "Helm" appears under "container orchestration")
//
// 3. Output: src/validation/taxonomy/skills-taxonomy.json (~1.5MB)
//    Format:
//    {
//      "synonyms": { "kubernetes": "esco:abc123", "k8s": "esco:abc123", ... },
//      "skills": {
//        "esco:abc123": {
//          "preferredLabel": "Kubernetes",
//          "altLabels": ["K8s", "kube"],
//          "broader": ["esco:parent123"],
//          "narrower": ["esco:child456", "esco:grandchild789"]  // transitive closure
//        }
//      }
//    }
//
// 4. If CSV files are missing, print friendly download instructions and exit
// 5. Add "setup-taxonomy" script to package.json
```

Setup step: `npm run setup-taxonomy`. Checks `resume-pipeline/resources/esco/` for pre-downloaded CSVs. If missing, prints manual download instructions (portal requires email, no API key — cannot be fully automated). Generates JSON, committed to repo (~1.5MB — no Git LFS needed).

#### Step F2 — Provider Interface

**File:** `resume-pipeline/src/validation/taxonomy/provider.ts` (NEW)

```ts
export interface ITaxonomyProvider {
  normalize(skill: string): string | null;
  getCanonicalLabel(uri: string): string | null;
  getSynonyms(uri: string): string[];
  getBroader(uri: string): string[];
  getNarrower(uri: string): string[];
}
```

#### Step F3 — Static Provider

**File:** `resume-pipeline/src/validation/taxonomy/static-provider.ts` (NEW)

```ts
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use fs.readFileSync instead of direct JSON import — avoids ESM assertion
// issues ("type": "module" requires import attributes for JSON)
const raw = fs.readFileSync(join(__dirname, "skills-taxonomy.json"), "utf8");
const skillsTaxonomy = JSON.parse(raw);

export class StaticTaxonomyProvider implements ITaxonomyProvider {
  private readonly synonymMap: Map<string, string>;
  private readonly skillMap: Map<string, SkillEntry>;

  constructor() {
    this.synonymMap = new Map();
    this.skillMap = new Map();
    for (const [uri, entry] of Object.entries(skillsTaxonomy.skills)) {
      const e = entry as SkillEntry;
      this.skillMap.set(uri, e);
      this.synonymMap.set(e.preferredLabel.toLowerCase().trim(), uri);
      for (const alt of e.altLabels ?? []) {
        this.synonymMap.set(alt.toLowerCase().trim(), uri);
      }
    }
  }

  normalize(skill: string): string | null {
    return this.synonymMap.get(skill.toLowerCase().trim()) ?? null;
  }

  getSynonyms(uri: string): string[] {
    const entry = this.skillMap.get(uri);
    if (!entry) return [];
    return [entry.preferredLabel, ...(entry.altLabels ?? [])];
  }

  getCanonicalLabel(uri: string): string | null {
    return this.skillMap.get(uri)?.preferredLabel ?? null;
  }

  getBroader(uri: string): string[] {
    return this.skillMap.get(uri)?.broader ?? [];
  }

  getNarrower(uri: string): string[] {
    return this.skillMap.get(uri)?.narrower ?? [];
  }
}
```

Deterministic, sub-millisecond, zero API calls. Handles 95%+ of taxonomy matches.

#### Step F4 — Taxonomy Service (Composes Providers — OCP)

**File:** `resume-pipeline/src/validation/taxonomy/taxonomy-service.ts` (NEW)

```ts
export class TaxonomyService {
  constructor(private readonly provider: ITaxonomyProvider) {}

  normalize(skill: string): string | null {
    return this.provider.normalize(skill);
  }

  isRelated(skillA: string, skillB: string): boolean {
    const uriA = this.normalize(skillA);
    const uriB = this.normalize(skillB);
    if (!uriA || !uriB) return false;
    if (uriA === uriB) return true;

    // Check hierarchy: is B a direct child of A?
    const narrowers = this.provider.getNarrower(uriA);
    if (narrowers.includes(uriB)) return true;

    // Check: is B a broader parent of A? (reverse)
    const broaders = this.provider.getBroader(uriA);
    if (broaders.includes(uriB)) return true;

    return false;
  }

  // Lazy-initialized singleton
  private static instance: TaxonomyService | null = null;

  static getInstance(): TaxonomyService {
    if (!this.instance) {
      this.instance = new TaxonomyService(new StaticTaxonomyProvider());
    }
    return this.instance;
  }
}
```

#### Step F5 — Scoring Dimension

**File:** `resume-pipeline/src/validation/dimensions/taxonomy-coverage.ts` (NEW)

```ts
import type { ScorerDimension } from "../scorer-dimension.js";
import { keywordExistsInText } from "../utils/word-boundary.js";
import { TaxonomyService } from "../taxonomy/taxonomy-service.js";

const taxonomy = TaxonomyService.getInstance();

export const taxonomyCoverageDimension: ScorerDimension = {
  key: "taxonomyCoverage",
  label: "Taxonomy Match",

  evaluate(ctx): number {
    if (ctx.jd.requiredSkills.length === 0) return 1.0;

    let matched = 0;
    let relevantCount = 0;

    for (const jdSkill of ctx.jd.requiredSkills) {
      const canonicalUri = taxonomy.normalize(jdSkill);
      if (!canonicalUri) continue; // Not in taxonomy — skip, don't penalize

      relevantCount++;

      const synonyms = taxonomy.getSynonyms(canonicalUri);
      const found = synonyms.some((s) => keywordExistsInText(s, ctx.fullText));
      if (found) {
        matched++;
        continue;
      }

      // Check narrowers: does resume have ANY descendent skill?
      // Transitive closure pre-computed at build time — O(1) lookup
      const narrowers = taxonomy.getNarrower(canonicalUri);
      if (narrowers.length > 0) {
        let childMatched = false;
        for (const childUri of narrowers) {
          const childSynonyms = taxonomy.getSynonyms(childUri);
          if (childSynonyms.some((s) => keywordExistsInText(s, ctx.fullText))) {
            childMatched = true;
            break;
          }
        }
        if (childMatched) matched++;
      }
    }

    return relevantCount > 0 ? matched / relevantCount : 1.0;
  },
};
```

Scoring logic:
1. JD says "container orchestration" → normalize → ESCO URI
2. Get narrowers/children: ["Kubernetes", "Docker Swarm"]
3. Check resume for ANY child synonym
4. Resume has "Kubernetes" → MATCH (+1 taxonomy point)

#### Step F6 — Register in System

**File:** `resume-pipeline/src/validation/dimensions/index.ts`

Add import, export, and registration in `defaultDimensions` array.

**File:** `resume-pipeline/src/validation/scorer-factory.ts`

- Phase 2: add `{ key: "taxonomyCoverage", weight: 3 }`, reduce `keywordRelevance: 30 → 27`
- Phase 3: add `{ key: "taxonomyCoverage", weight: 3 }`, reduce `keywordRelevance: 25 → 22`
- Labels: `taxonomyCoverage: "Taxonomy Match"`

### Weight Allocation

| Dimension | Phase 2 Before | Phase 2 After | Phase 3 Before | Phase 3 After |
|---|---|---|---|---|
| `keywordRelevance` | 30 | 27 | 25 | 22 |
| `taxonomyCoverage` | — | **3** | — | **3** |
| **Total** | 107 | 107 | 107 | 107 |

Totals match actual codebase (107 for both phases). Light weight (3/100) because taxonomy is an additive confirmation signal — it catches hierarchical relationships that keyword matching misses, but keyword matching remains the primary detection mechanism.

### Expected Impact (Honeywell Test Case)

| JD Skill | Resume Has | Before | After |
|---|---|---|---|
| "container orchestration" | "Kubernetes, Helm" | MISS | MATCH (taxonomy narrowers) |
| "CI/CD" | "GitHub Actions, Jenkins" | MISS (or keyword variant) | MATCH (taxonomy synonyms) |
| "observability" | "Prometheus, Grafana, Datadog" | MISS | MATCH (taxonomy narrowers) |
| "Agile Scrum" | SAFe/Agile mentioned in experience | DECENT (keyword) | MATCH (taxonomy confirms) |

Estimated gain: **+3-5 points** (79 → 82-84) with reduced run-to-run variance because taxonomy is deterministic.

### Setup Instructions

```bash
# One time: download ESCO and build taxonomy JSON
npm run setup-taxonomy

# This generates: src/validation/taxonomy/skills-taxonomy.json
# File size: ~1.5MB (descriptions stripped). Commit to repo.
```

### Future Enhancement: Embedding Fallback (Phase F-Advanced)

After Phase F is stable, add `EmbeddingTaxonomyProvider` that uses the Phase 3 embedding model for fuzzy matching when the static provider misses:

- Pre-compute embeddings for all 15,000 ESCO skill descriptions during `setup-taxonomy`
- **Storage:** Use raw binary `Float32Array` file (15,000 × 384 × 4 bytes = **~23MB**). Avoid JSON text serialization (~80-100MB). Load via `fs.readFileSync` into `Float32Array` buffer
- **Performance:** 15,000 vector cosine similarity comparisons = ~15ms CPU. For a JD with 15 skills, this blocks the event loop for ~150-200ms. Add an in-memory LRU cache for resolved embedding lookups to avoid recomputation
- At runtime: compute embedding of unknown skill, find closest ESCO skill via cosine similarity (>0.6 threshold)
- Only activated when static lookup misses (rare for tech roles, common for non-tech)

Same `ITaxonomyProvider` interface — zero changes to the scoring dimension. Swap the provider in `TaxonomyService.getInstance()`.

### Design Rationale

| Principle | Applied How |
|---|---|
| **SRP** | Each file has one reason to change. Provider interface = abstraction, static provider = lookup, service = composition, dimension = scoring |
| **OCP** | Add embedding provider later without touching the dimension or interface. Open for extension, closed for modification |
| **DIP** | `TaxonomyService` depends on `ITaxonomyProvider` abstraction, not concrete `StaticTaxonomyProvider`. `taxonomy-coverage.ts` depends on `TaxonomyService` abstraction |
| **ISP** | `ITaxonomyProvider` has 5 focused methods. No dimension needs all of them — each uses only what's relevant |
| **No API dependency** | ESCO data committed as static JSON. Zero runtime API calls, works offline, no rate limits, no costs |
