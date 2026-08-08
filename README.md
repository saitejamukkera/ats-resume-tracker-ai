# TrackHire AI

TrackHire AI is a job-application tracker with an AI resume-tailoring workflow. It stores a user's LaTeX resume bases, turns a job description into a targeted resume and cover letter, scores the result for ATS fit, and keeps the generated documents alongside the application.

The repository is a three-service monorepo: a Next.js web client, a Spring Boot API backed by PostgreSQL, and a stateless Node/Express LLM pipeline. The compose stack starts the database, API, and pipeline; the frontend is run separately during local development.

## What it does

- Tracks applications, including company, position, job ID, location, description, outcome, dates, and notes.
- Stores per-user base LaTeX resumes and preserves their structural sections while tailoring summary, skills, and experience content.
- Parses job descriptions for role metadata, required and preferred skills, responsibilities, experience level, and key phrases.
- Generates a tailored resume and cover letter, with a streaming path that makes the resume available before the cover letter is finished.
- Scores generated resumes with configurable, weighted ATS dimensions; exposes required/preferred skill gaps, hard-requirement knockouts, and a component-level breakdown.
- Supports PDF, DOCX, and cover-letter exports, plus an editable LaTeX workspace with PDF synchronization diagnostics.
- Supports email/password authentication, refresh tokens, password reset/OTP flows, and Google or GitHub OAuth.
- Supports Bring Your Own Key (BYOK) for Google, OpenAI, and Anthropic, with optional server-side fallback keys.

## Architecture

```text
Browser (Next.js :3000)
        │  /api/* in development is proxied to :8080
        ▼
Spring Boot API (:8080) ───────────────► PostgreSQL (:5433 host / :5432 container)
        │
        │ RESUME_PIPELINE_URL
        ▼
Resume pipeline (Express :3001) ───────► selected LLM provider
        │                                Google / OpenAI / Anthropic
        └───────────────────────────────► local embedding model (optional)
```

| Directory | Purpose | Main technologies |
|---|---|---|
| `frontend/` | Browser application | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, SWR |
| `backend/` | Authenticated REST API, persistence, document handling | Spring Boot 4.0.2, Java 21, PostgreSQL, Flyway, Maven |
| `resume-pipeline/` | Stateless LLM generation and ATS scoring sidecar | Express 5, TypeScript, Vercel AI SDK, Hugging Face Transformers |

## Resume generation pipeline

The pipeline accepts a base LaTeX resume and a job description. It deliberately keeps job-specific generation separate from persistence: the Spring API owns user/application data while the pipeline returns the generated artifact and scoring data.

1. Parses the LaTeX resume into its header, summary, skills, experience, projects, education, and section order.
2. Extracts a deterministic candidate technology profile from the source resume.
3. Uses an LLM to parse the job description.
4. Generates a role-specific summary and experience bullets, preserving the original number of bullets per role. It then prioritizes relevant existing skills and only injects skills it can verify from the candidate's material.
5. Validates output constraints and tries bounded bullet repairs when critical problems are found.
6. Runs a bounded impact-lift loop, scores the resume, and—when the score is below 85—performs up to two keyword-gap repair passes. It stops a repair sequence when a pass does not improve the score.
7. Trims overlong bullets, selects phrases for emphasis, assembles LaTeX, generates DOCX when possible, and re-scores the assembled output for format validation.
8. Emits the resume-ready event, then generates the cover letter. Non-critical generation failures degrade to a partial result where possible.

### ATS scoring

The scorer is pluggable and uses 14 dimensions in the current implementation:

- Keyword relevance and preferred-skill relevance
- Optional embedding-based semantic similarity
- Bullet impact, metrics usage, action verbs, and bullet-length health
- Keyword placement, section completeness, and LaTeX/ATS format checks
- Skill-to-experience coherence, experience-level match, and education-level match
- ESCO taxonomy coverage

It also uses variant-aware, word-boundary skill matching; a document-length-relative keyword-density penalty; and a hard-requirement knockout gate. The ESCO taxonomy includes synonym and hierarchy matching, and `all-MiniLM-L6-v2` embeddings are loaded locally when semantic scoring is enabled. Semantic scoring can be disabled with `ENABLE_SEMANTIC_SCORING=false`.

## Prerequisites

- Docker Desktop, for PostgreSQL or the compose stack
- Node.js 18+ for the frontend and pipeline
- Java 21 for the backend
- An API key for Google, OpenAI, or Anthropic if you plan to generate content. A user can provide one in Settings (BYOK), or you can configure a server fallback key.

For PDF compilation outside the backend container, a LaTeX distribution must be available on the backend host. Docker development uses the backend image's installed tooling.

## Quick start

### 1. Clone and configure the root environment

```bash
git clone https://github.com/<your-account>/Job-Resume-Tracker.git
cd Job-Resume-Tracker
cp .env.example .env
```

On Windows CMD, use `copy .env.example .env` instead. Set at least the database credentials and JWT secret in `.env`:

```dotenv
POSTGRES_USER=postgres
POSTGRES_PASSWORD=replace-with-a-strong-password
POSTGRES_DB=ats_tracker
JWT_SECRET=replace-with-a-long-random-secret
```

Server keys are optional when users supply their own. For the compose stack, set the selected provider and its matching key variable. The compose file passes `GEMINI_API_KEY` to the pipeline as `GOOGLE_GENERATIVE_AI_API_KEY`; use that variable name in the root `.env` for a Google fallback key.

```dotenv
LLM_PROVIDER=google                 # google | openai | anthropic
GEMINI_API_KEY=                     # Google fallback for docker-compose
OPENAI_API_KEY=                     # OpenAI fallback
ANTHROPIC_API_KEY=                  # Anthropic fallback
ENABLE_SEMANTIC_SCORING=true
ADMIN_API_KEY=replace-with-admin-secret
```

See [`.env.example`](.env.example) for cookie, OAuth, SMTP, and frontend URL settings. Keep all `.env` files out of source control.

### 2. Start the API services

```bash
docker-compose up --build
```

This starts:

| Service | Address |
|---|---|
| PostgreSQL | `localhost:5433` |
| Resume pipeline | `http://localhost:3001` |
| Spring API | `http://localhost:8080` |

The first pipeline start with semantic scoring enabled downloads the embedding model and caches it in the `resume_pipeline_hf_cache` Docker volume.

### 3. Start the frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. When `NEXT_PUBLIC_API_URL` is blank, the Next.js rewrite sends `/api/*` requests to `http://localhost:8080`, which keeps CSRF cookies same-origin in local development.

## Run services individually

Use this setup for faster service-level iteration.

```bash
# Terminal 1: database only (uses root .env)
docker-compose up postgres -d

# Terminal 2: pipeline
cd resume-pipeline
cp .env.example .env
npm install
npm run dev

# Terminal 3: Spring API
cd backend
cp .env.example .env
./mvnw spring-boot:run       # macOS/Linux
# mvnw.cmd spring-boot:run   # Windows

# Terminal 4: web app
cd frontend
cp .env.example .env
npm install
npm run dev
```

For a local backend, its `.env` needs database credentials, `JWT_SECRET`, and optionally `RESUME_PIPELINE_URL` (defaults to `http://localhost:3001`). The backend's default local JDBC URL uses PostgreSQL port `5432`; when using the root compose PostgreSQL, set `SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/<POSTGRES_DB>` in `backend/.env`.

## Authentication and BYOK

Protected API routes use JWT authentication, a refresh-token cookie flow, CSRF cookies/header validation, CORS with credentials, BCrypt password hashing, and rate limiting. Google and GitHub OAuth are enabled when their client credentials are configured. The frontend performs silent refresh on `401` responses and treats the protected route group as client-guarded.

For BYOK, keys are sent only for the generation request and are preferred over server fallback keys. The frontend can retain selected provider keys in browser storage encrypted with AES-256-GCM using Web Crypto/PBKDF2; they are not persisted by the backend. API keys can also be validated before use. BYOK protects server key sharing, but browser-held keys remain subject to the security of the user's browser/profile.

## API surface

All `/api/**` routes except `/api/auth/**` require authentication.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/auth/csrf` | Establish a CSRF token cookie |
| `POST` | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/refresh` | Account and session operations |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/send-otp`, `/api/auth/verify-otp-register` | Registration verification |
| `POST` | `/api/auth/forgot-password`, `/api/auth/reset-password` | Password reset |
| `GET`, `POST` | `/api/applications` | List or create applications |
| `GET`, `PUT`, `DELETE` | `/api/applications/{id}` | Read, update, or remove an application |
| `POST` | `/api/applications/check-duplicate` | Detect an already-tracked job URL |
| `GET`, `POST` | `/api/profile` | Read or save a user profile |
| `POST` | `/api/settings/validate-key` | Validate an LLM API key through the pipeline |
| `GET`, `POST` | `/api/resumes/base` | List or upsert a base resume |
| `GET` | `/api/resumes/base/count` | Count base resumes |
| `POST` | `/api/resumes/generate-from-jd` | Generate application metadata from a job description |
| `POST` | `/api/resumes/generate-from-jd/stream` | Stream job-description generation events (SSE) |
| `POST` | `/api/resumes/generate/{applicationId}` | Generate and persist a tailored resume and cover letter |
| `PUT` | `/api/resumes/{applicationId}/content` | Save edited resume/cover-letter content |
| `GET` | `/api/resumes/{applicationId}/pdf`, `/docx` | Download the generated resume |
| `GET` | `/api/resumes/{applicationId}/cover-letter`, `/cover-letter/pdf`, `/cover-letter/docx` | Read or download the cover letter |
| `GET` | `/api/resumes/{applicationId}/pdf-sync` | Compile PDF and return source-to-PDF synchronization data/diagnostics |

The pipeline is internally addressed by the backend and exposes `GET /health`, `POST /generate`, `POST /generate-stream` (SSE), `POST /parse-jd`, and `POST /validate-key`. Its admin endpoints require `Authorization: Bearer <ADMIN_API_KEY>`:

```bash
curl -H "Authorization: Bearer $ADMIN_API_KEY" http://localhost:3001/admin/analytics
curl -H "Authorization: Bearer $ADMIN_API_KEY" 'http://localhost:3001/admin/traces?limit=10'
```

`/admin/analytics` reports score distributions, component breakdowns, and cost/latency information. `/admin/traces` returns recent pipeline traces (up to 100 per request).

## Data and migrations

PostgreSQL holds users, refresh tokens, resume bases, applications, and user profiles. Flyway applies the migrations in `backend/src/main/resources/db/migration/`; the current migration set is V1 through V10. Applications persist generated LaTeX, cover-letter content, optional generated DOCX data, ATS/impact scores, a score version, and a JSONB score breakdown.

Add schema changes as a new versioned migration—do not modify an already-applied migration.

## Useful commands

```bash
# Frontend
cd frontend && npm run lint
cd frontend && npm run build

# Resume pipeline
cd resume-pipeline && npm run typecheck
cd resume-pipeline && npm run test
cd resume-pipeline && npm run build
cd resume-pipeline && npm run setup-taxonomy  # rebuilds ESCO taxonomy JSON
cd resume-pipeline && npm run eval-ats

# Backend
cd backend && ./mvnw test
cd backend && ./mvnw package
```

## Project layout

```text
frontend/
  app/                         Next.js routes (auth, dashboard, settings, applications)
  src/components/              dashboard, editor, download, and UI components
  src/context/                 authentication, theme, and toast providers
  src/lib/api.ts               CSRF-aware API client with refresh handling
  src/lib/crypto.ts            encrypted local BYOK key storage
backend/
  src/main/java/.../controller REST endpoints
  src/main/java/.../service    generation client, document, auth, and application services
  src/main/java/.../security   JWT, CSRF, OAuth, and rate-limit configuration
  src/main/resources/db/migration/  Flyway migrations
resume-pipeline/
  src/pipeline/runner.ts       generation orchestrator and SSE events
  src/stages/                  parsing, generators, repair, assembly, DOCX, cover letter
  src/validation/              scorer, dimensions, taxonomy, embeddings, format checks
  src/observability/           traces and analytics
  scripts/build-taxonomy.ts    ESCO taxonomy builder
docker-compose.yml             local database + pipeline + API stack
deploy-oracle.yml              production-oriented Oracle/Caddy stack
```

## Troubleshooting

**Port conflict.** PostgreSQL is intentionally mapped to host port `5433`; the API and pipeline use `8080` and `3001`. Check active containers with `docker-compose ps` and logs with `docker-compose logs <service>`.

**Frontend cannot reach the API.** In local development, leave `NEXT_PUBLIC_API_URL` empty and run the backend on `8080`. For a separately hosted frontend, set it to the API origin and set backend `FRONTEND_URL`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, and `COOKIE_SAME_SITE` consistently.

**Generation fails.** Check `docker-compose logs resume-pipeline` (or the pipeline terminal), confirm the selected `LLM_PROVIDER` has a valid fallback key, or add and validate a BYOK key in Settings. The pipeline accepts JSON request bodies up to 5 MB.

**Semantic model is unavailable.** Set `ENABLE_SEMANTIC_SCORING=false` to continue without embeddings, or allow the first startup to download and cache the model.

**PDF export fails.** Inspect the PDF-sync diagnostics for LaTeX errors and ensure TeX tooling is present in non-container backend environments.

## Deployment

`deploy-oracle.yml` and `Caddyfile` are provided for an Oracle Cloud ARM deployment with Caddy handling HTTPS. The frontend can be deployed independently; configure `NEXT_PUBLIC_API_URL` for its public backend URL. See [`DEPLOY.md`](DEPLOY.md) for the deployment guide.

## License

MIT
