# AGENTS.md

## Architecture

This is a three-service monorepo:

| Directory | Stack | Port |
|-----------|-------|------|
| `frontend/` | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS v4 | 3000 |
| `backend/` | Spring Boot 4.0.2, Java 21, PostgreSQL, Flyway, Maven | 8080 |
| `resume-pipeline/` | Node.js/Express, TypeScript, Vercel AI SDK (Google/OpenAI/Anthropic) | 3001 |

The resume-pipeline is a stateless LLM sidecar called by the backend via `RESUME_PIPELINE_URL`. It has its own `.env` with `LLM_PROVIDER` and provider API keys.

## Commands

```bash
# Frontend (Next.js)
cd frontend && npm run dev          # dev server
cd frontend && npm run build        # production build
cd frontend && npm run lint         # ESLint (v9 flat config)

# Backend (Spring Boot / Maven)
cd backend && ./mvnw spring-boot:run   # macOS/Linux
cd backend && mvnw.cmd spring-boot:run # Windows

# Resume-pipeline (Node.js)
cd resume-pipeline && npm run dev      # tsx watch
cd resume-pipeline && npm run build    # tsc
cd resume-pipeline && npm run typecheck # tsc --noEmit

# Docker (local full stack: postgres + resume-pipeline + backend)
docker-compose up --build       # from repo root

# Docker (just postgres, for local backend dev)
docker-compose up postgres -d
```

There are no test scripts configured in any sub-project. No CI workflows exist in `.github/workflows/`.

## Environment Variables

Three sets of `.env` files, all gitignored (only `.env.example` files are tracked):

1. **Root `.env`** — used by `docker-compose.yml`. Variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET`, `GEMINI_API_KEY`, `LLM_PROVIDER`, `FRONTEND_URL`, OAuth keys, SMTP keys, cookie settings. See `.env.example`.

2. **`backend/.env`** — loaded by Spring Boot via `spring-dotenv` (me.paulschwarz:spring-dotenv:4.0.0). Simpler subset of the root env. See `backend/.env.example`.

3. **`resume-pipeline/.env`** — `LLM_PROVIDER` (default: `google`), optional provider keys (`GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`), `PORT=3001`, `NODE_ENV`, `ENABLE_SEMANTIC_SCORING=true`, `ADMIN_API_KEY`.

4. **`frontend/.env`** — only `NEXT_PUBLIC_API_URL`. In dev, leave blank (Next.js rewrites proxy `/api/*` to `localhost:8080`). In production, set to the backend URL.

### Pipeline Commands

```bash
cd resume-pipeline

# Core
npm run dev            # tsx watch (hot reload)
npm run build          # tsc
npm run typecheck      # tsc --noEmit

# Taxonomy (one-time setup — downloads ~9MB ESCO CSV, builds ~19MB JSON)
npm run setup-taxonomy # generates src/validation/taxonomy/skills-taxonomy.json

# Admin analytics (requires ADMIN_API_KEY in .env)
curl -H "Authorization: Bearer <key>" http://localhost:3001/admin/analytics
curl -H "Authorization: Bearer <key>" http://localhost:3001/admin/traces?limit=5
```

## Docker Compose Files

Two compose files with different purposes:

- **`docker-compose.yml`** (root) — local dev: postgres (`:5433` on host → `:5432` in container), resume-pipeline (`:3001`), backend (`:8080`). Postgres uses external volume `backend_postgres_data`.
- **`deploy-oracle.yml`** — production on Oracle Cloud ARM with Caddy for HTTPS. Not used locally.
- **`backend/Compose.yaml`** — Spring Boot's built-in compose support (via `spring-boot-docker-compose` dependency). Starts postgres + backend.

Note: **Postgres is on host port 5433** (not default 5432) to avoid conflicts.

## Key Architecture Details

### BYOK (Bring Your Own Key)

Users supply their own LLM API keys via the Settings page (encrypted in localStorage with AES-256-GCM). Server-side keys in `.env` are optional fallbacks. The `resume-pipeline` uses `CompositeKeyProvider`: tries user keys first, falls back to server env keys.

### Auth

- Spring Security with JWT (jjwt 0.12.6) + refresh tokens.
- OAuth2 via Google and GitHub.
- **No Next.js middleware** — auth is client-side via `AuthContext`. The `(protected)` route group has a client-side guard in `DashboardClientLayout.tsx`.
- CSRF: Spring sends `XSRF-TOKEN` cookie. The frontend `api.ts` reads it and attaches `X-XSRF-TOKEN` header on mutating requests.
- Silent JWT refresh: the frontend refreshes on 401, with deduplication for concurrent requests.

### Database

Flyway migrations in `backend/src/main/resources/db/migration/` (7 versioned scripts, V1-V7). Any schema change must go in a new `V{N}__description.sql` file there.

### Frontend Data Fetching

SWR (`swr` package v2.4.0) for client-side data fetching. The API client is in `frontend/src/lib/api.ts` (~582 lines) — all backend calls go through this file.

### Resume Generation Flow

Frontend → Backend (`POST /api/resumes/generate`) → Backend calls resume-pipeline → Pipeline runs 10+ deterministic + LLM stages → Returns Latex + cover letter + scores.

### ATS Scoring Engine

The resume-pipeline contains a production-grade ATS (Applicant Tracking System) scoring engine with 13 weighted dimensions. Architecture is fully pluggable via `ScorerDimension` interface (SOLID: OCP + DIP).

**Scoring Pipeline Flow:**
```
JD Text → [Stage 2: JD Parser] → JDAnalysis { requiredSkills[], preferredSkills[], ... }
         → [Stage 3: Section Generators] → GeneratedSections { summary, skills, experience }
         → [Stage 4: Validator + Repair] → impact profiles
         → [Stage 4.5: ATS Scorer] → 13-dimension weighted score (0-100)
         → [Stage 4.6: Keyword Gap Repair] → capped at 8 keywords, anti-stuffing
         → [Stage 5: LaTeX Assembly] → post-assembly format validation
```

**13 Scoring Dimensions** (weights vary by Phase 2/Phase 3 with embeddings):

| Dimension | Weight | Description |
|---|---|---|
| `keywordRelevance` | 22-27 | % JD required skills found (word-boundary + variant-aware) |
| `semanticSimilarity` | 0-15 | SBERT embedding cosine similarity (Phase 3 only) |
| `preferredRelevance` | 8-10 | % JD preferred skills found |
| `impactScore` | 12-14 | Bullet-level impact scoring (verb, metric, causality) |
| `metricsRatio` | 8-9 | % bullets with quantifiable numbers |
| `actionVerbRatio` | 6-7 | % bullets starting with strong verbs |
| `keywordPlacement` | 6-7 | % skills in summary + first 2 bullets |
| `sectionCompleteness` | 7-8 | 6-section completeness check |
| `formatScore` | 7-8 | LaTeX format validation (headings, contact, dates) |
| `skillExperienceCoherence` | 5-6 | Skills in both skills section AND experience |
| `experienceLevelMatch` | 4 | JD experience level vs resume role count |
| `educationLevelMatch` | 4 | JD education requirement vs resume degree (regex detection) |
| `taxonomyCoverage` | 3 | ESCO taxonomy synonym + hierarchy matching (15K skills) |

**Key Features:**
- **Semantic embeddings**: `all-MiniLM-L6-v2` via `@huggingface/transformers` — runs locally, 0 API cost
- **ESCO taxonomy**: 99,624 synonyms across 13,939 skills with transitive hierarchy closure
- **Variant-aware matching**: Word-boundary regex + skill variant expansion (200+ tech terms)
- **Density penalty**: Prevents ATS keyword stuffing (multiplier on keywordRelevance)
- **Post-assembly format validation**: Checks for ATS-hostile LaTeX artifacts
- **Category-preserving augmentation**: JD parser separates required vs preferred, gap repair respects boundaries

**Scoring Architecture:**
```
resume-pipeline/src/validation/
├── ats-scorer.ts              # Pure core scorer + async wrapper
├── scorer-dimension.ts         # ScorerDimension interface + ScoringContext
├── scorer-factory.ts           # createScorer() + 13-dim weight tables
├── scoring-context.ts          # buildScoringContext()
├── dimensions/                 # 13 pluggable dimension files
├── taxonomy/                   # ESCO integration (ITaxonomyProvider, StaticProvider, TaxonomyService)
│   └── skills-taxonomy.json    # 99K synonyms, 14K skills (generated via setup-taxonomy)
├── skill-variants.ts           # 200+ tech term variants (exported PREDEFINED_VARIANTS)
├── format-validator.ts         # LaTeX format checks
├── utils/
│   ├── word-boundary.ts        # C++/C#/.NET-safe word boundary matching
│   ├── density-penalty.ts      # Document-length-relative stuffing detection
│   └── latex-stripper.ts       # LaTeX → plain text extraction
└── embedding-matcher.ts        # SBERT similarity compute
```

**Admin Analytics (Phase 5):**
- `GET /admin/analytics` — dimension breakdown, score distributions, cost trends (bearer token auth via `ADMIN_API_KEY`)
- `GET /admin/traces?limit=N` — raw trace data
- `InMemoryTraceStore` — circular buffer, last 1000 generations
- Analyzers: dimension, score, cost/latency (plugged into `buildHealthReport()`)

**Key Design Decisions:**
- **Temperature=0** for extraction (OpenAI: `gpt-5.4-nano`, non-reasoning, respects temperature)
- **JD Parser** uses few-shot examples with `"""` delimiters for deterministic extraction
- **Gap repair capped at 8 keywords** per pass with pass-aware skipping (2 passes max)
- **Format validation degrades gracefully** to 0.85 when LaTeX not yet assembled
- **Density penalty is a multiplier**, not a standalone dimension
- **Score persistence**: Backend stores `ats_score`, `impact_score`, `score_version`, `score_breakdown` (JSONB) via Flyway V8 migration

## Other Notes

- **Java uses Lombok** — ensure IDE annotation processing is enabled.
- **Next.js `experimental.optimizePackageImports`** is configured for `lucide-react` and `framer-motion` in `next.config.ts`.
- **Theme**: dark/light toggle stored in `localStorage` as `ats-theme` key, managed by `ThemeContext`.
- **Deployment docs**: see `DEPLOY.md` for Oracle Cloud (backend) + Vercel (frontend) deployment instructions. Not needed for local development.
