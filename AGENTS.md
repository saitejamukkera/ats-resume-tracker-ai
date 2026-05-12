# AGENTS.md

## Architecture

This is a three-service monorepo:

| Directory | Stack | Port |
|-----------|-------|------|
| `frontend/` | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS v4 | 3000 (prod) / 5173? |
| `backend/` | Spring Boot 4.0.2, Java 21, PostgreSQL, Flyway, Maven | 8080 |
| `resume-pipeline/` | Node.js/Express, TypeScript, Vercel AI SDK (Google/OpenAI/Anthropic) | 3001 |

The resume-pipeline is a stateless LLM sidecar called by the backend via `RESUME_PIPELINE_URL`. It has its own `.env` with `LLM_PROVIDER` and provider API keys.

**The README is stale** — it says "React + Vite" but the actual frontend is Next.js App Router. Trust the code over the README.

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

3. **`resume-pipeline/.env`** — `LLM_PROVIDER` (default: `google`), optional provider keys (`GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`), `PORT=3001`, `NODE_ENV`.

4. **`frontend/.env`** — only `NEXT_PUBLIC_API_URL`. In dev, leave blank (Next.js rewrites proxy `/api/*` to `localhost:8080`). In production, set to the backend URL.

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

## Other Notes

- **Java uses Lombok** — ensure IDE annotation processing is enabled.
- **Next.js `experimental.optimizePackageImports`** is configured for `lucide-react` and `framer-motion` in `next.config.ts`.
- **Theme**: dark/light toggle stored in `localStorage` as `ats-theme` key, managed by `ThemeContext`.
- **Deployment docs**: see `DEPLOY.md` for Oracle Cloud (backend) + Vercel (frontend) deployment instructions. Not needed for local development.
