# TrackHire AI

A full-stack application to track job applications and generate AI-tailored resumes and cover letters from LaTeX templates.

## Features

- **Resume Management**: Store base LaTeX resumes.
- **AI Generation**: Generate role-specific resumes and cover letters from job descriptions via a multi-stage LLM pipeline.
- **Application Tracking**: Manage application status (Saved, Applied, Interviewing, Offer, Rejected, etc.).
- **Bring Your Own Key (BYOK)**: Users supply their own LLM API keys (Google Gemini, OpenAI, Anthropic) — server keys are optional fallbacks.
- **ATS Scoring Engine**: 13-dimension weighted resume scoring with semantic embeddings, ESCO taxonomy matching, impact detection, keyword stuffing prevention, and format validation.
- **Resume Analysis**: Real-time ATS compatibility scoring with component breakdown shown during generation.
- **PDF/DOCX/TXT Export**: Download resumes and cover letters in multiple formats with intelligent naming (Name_Position_JobID_Type.ext).
- **Admin Analytics**: Per-dimension score breakdown, latency/cost trends, and trace history via protected API endpoints.

## Tech Stack

| Service | Stack |
|---------|-------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS v4, SWR |
| **Backend** | Spring Boot 4.0.2, Java 21, PostgreSQL, Flyway, Maven |
| **Resume Pipeline** | Node.js/Express, TypeScript, Vercel AI SDK (Google Gemini / OpenAI / Anthropic) |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Node.js 18+](https://nodejs.org/) (for local frontend/pipeline development)
- [Java 21](https://adoptium.net/) (for local backend development)
- LLM API key (optional — users can supply their own keys in-app via the Settings page):
  - [Google Gemini](https://aistudio.google.com/) (free tier available)
  - [OpenAI](https://platform.openai.com/)
  - [Anthropic](https://console.anthropic.com/)

---

## Quick Start (Docker — Full Stack)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/Job-Resume-Tracker.git
cd Job-Resume-Tracker
```

### 2. Create Environment File

**Windows (CMD):**
```cmd
copy .env.example .env
```

**Linux/macOS:**
```bash
cp .env.example .env
```

### 3. Configure Environment Variables

Edit `.env` and fill in the required values:

```dotenv
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=ats_tracker
JWT_SECRET=your_jwt_secret
LLM_PROVIDER=google              # google | openai | anthropic
GEMINI_API_KEY=your_api_key_here  # server fallback key (optional with BYOK)
```

| Variable | Required | Description |
|----------|:--------:|-------------|
| `POSTGRES_USER` | Yes | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `POSTGRES_DB` | Yes | Database name |
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `LLM_PROVIDER` | No | Default: `google`. Which provider to use as server fallback |
| `GEMINI_API_KEY` | No | Server fallback API key (leave blank for BYOK-only mode) |
| `OPENAI_API_KEY` | No | Server fallback (if `LLM_PROVIDER=openai`) |
| `ANTHROPIC_API_KEY` | No | Server fallback (if `LLM_PROVIDER=anthropic`) |
| `ENABLE_SEMANTIC_SCORING` | No | Default: `true`. Enables SBERT embedding-based semantic matching (~80MB model download on first run) |
| `ADMIN_API_KEY` | No | Secret key for `/admin/analytics` and `/admin/traces` endpoints |
| `FRONTEND_URL` | No | Default: `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | Google OAuth2 credentials |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | No | GitHub OAuth2 credentials |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | No | SMTP credentials for OTP emails |

See `.env.example` for all available variables.

### 4. Run with Docker Compose

```bash
docker-compose up --build
```

This starts three services:

| Service | Description | URL |
|---------|-------------|-----|
| **PostgreSQL** | Database (host port 5433 → container 5432) | `localhost:5433` |
| **Resume Pipeline** | LLM sidecar for resume generation | `http://localhost:3001` |
| **Backend API** | Spring Boot REST API | `http://localhost:8080` |

### 5. Run Frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at http://localhost:3000

---

## Local Development Setup

Run services individually for faster iteration:

### 1. Set Up Environment Files

**Root `.env`** (for docker-compose):
```bash
cp .env.example .env
# Edit with your values
```

**Backend `.env`** (loaded by Spring Boot via spring-dotenv):
```bash
cd backend
cp .env.example .env
# Edit with: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, JWT_SECRET
```

**Resume Pipeline `.env`** (optional):
```bash
cd resume-pipeline
cp .env.example .env
# Key settings: LLM_PROVIDER, ENABLE_SEMANTIC_SCORING, ADMIN_API_KEY
```

### 2. Start PostgreSQL

```bash
docker-compose up postgres -d
```

### 3. Start Resume Pipeline

```bash
cd resume-pipeline
npm install
npm run dev
```

Pipeline runs on http://localhost:3001

### 4. Start Backend

```bash
cd backend
./mvnw spring-boot:run    # macOS/Linux
mvnw.cmd spring-boot:run  # Windows
```

Backend API runs on http://localhost:8080

### 5. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:3000

In dev mode, Next.js proxies `/api/*` requests to `localhost:8080` (configured in `next.config.ts`).

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register a new user |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/logout` | Logout (invalidate refresh token) |
| POST | `/api/auth/refresh` | Silent JWT refresh |
| POST | `/api/auth/send-otp` | Send OTP for registration verification |
| POST | `/api/auth/verify-otp-register` | Verify OTP and complete registration |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |
| GET | `/api/auth/me` | Get current user info |
| GET/POST | `/api/applications` | List / create job applications |
| GET/PUT/DELETE | `/api/applications/{id}` | Get / update / delete an application |
| POST | `/api/applications/check-duplicate` | Check if a job URL is already tracked |
| POST | `/api/resumes/generate` | Generate tailored resume (calls pipeline) |
| POST | `/api/resumes/generate-stream` | Generate resume via SSE streaming |
| POST | `/api/resumes/parse-jd` | Parse job description without generating |
| GET | `/api/resumes/base` | List user's base LaTeX resumes |
| POST | `/api/resumes/base` | Upload a new base LaTeX resume |
| GET | `/api/resumes/{id}/pdf` | Download generated PDF |
| GET/DELETE | `/api/settings/api-keys` | Manage user API keys |
| POST | `/api/settings/validate-key` | Validate an LLM API key |
| POST | `/api/settings/profile` | Save user profile |

### Admin Analytics (Protected — Bearer Token via `ADMIN_API_KEY`)

| Endpoint | Description |
|---|---|
| `GET /admin/analytics` | System health report: 13-dimension score breakdown, distribution stats (p50/p95), cost/latency trends |
| `GET /admin/traces?limit=N` | Raw generation traces for debugging |

### OAuth2

| Endpoint | Description |
|----------|-------------|
| `/oauth2/authorization/google` | Initiate Google OAuth2 login |
| `/oauth2/authorization/github` | Initiate GitHub OAuth2 login |
| `/login/oauth2/code/google` | Google OAuth2 callback |
| `/login/oauth2/code/github` | GitHub OAuth2 callback |

---

## Project Structure

```
Job-Resume-Tracker/
├── frontend/                 # Next.js 16 App Router
│   ├── app/                  # Route pages (dashboard, settings, auth, etc.)
│   ├── src/
│   │   ├── components/       # React components (auth, dashboard, layout, ui)
│   │   ├── context/          # AuthContext, ThemeContext, ToastContext
│   │   ├── lib/              # api.ts (API client), crypto.ts (AES-256-GCM)
│   │   └── hooks/            # useApiKeys, useDownloader, useTheme
│   ├── next.config.ts
│   └── package.json
├── backend/                  # Spring Boot 4 backend
│   ├── src/
│   │   └── main/
│   │       ├── java/com/fullstack/ATSJobTracker/
│   │       │   ├── controller/   # REST controllers
│   │       │   ├── service/      # Business logic + ResumePipelineClient
│   │       │   ├── model/        # JPA entities
│   │       │   ├── dto/          # Request/Response DTOs
│   │       │   ├── repository/   # Spring Data repositories
│   │       │   ├── security/     # JWT, OAuth2, CSRF, rate limiting
│   │       │   └── exception/    # Custom exceptions
│   │       └── resources/db/migration/  # Flyway migrations (V1-V7)
│   ├── pom.xml
│   ├── Compose.yaml           # Spring Boot's own compose (postgres + backend)
│   └── Dockerfile
├── resume-pipeline/          # LLM sidecar (Express + Vercel AI SDK)
│   ├── src/
│   │   ├── pipeline/         # Pipeline orchestrator (runner.ts)
│   │   ├── stages/           # LLM generation stages (jd-parser, section-generators, gap-repair)
│   │   ├── validation/       # 13-dimension ATS scorer + dimensions/ + taxonomy/ + format validation
│   │   ├── impact/           # Impact detection system (bullet-level scoring)
│   │   ├── security/         # Key providers (BYOK: CompositeKeyProvider)
│   │   ├── observability/    # Telemetry, trace store, analytics (Phase 5), LLM call wrapper
│   │   └── config/           # Model registry (Google, OpenAI, Anthropic)
│   ├── scripts/              # build-taxonomy.ts (ESCO CSV → JSON)
│   └── package.json
├── docker-compose.yml        # Local full-stack compose (postgres + pipeline + backend)
├── deploy-oracle.yml         # Production compose for Oracle Cloud ARM
├── Caddyfile                 # Caddy reverse proxy config (production)
├── .env.example              # Environment template for root docker-compose
└── DEPLOY.md                 # Oracle Cloud + Vercel deployment guide
```

---

## Troubleshooting

### Port already in use

Postgres runs on host port **5433** (not 5432) to avoid conflicts. If 5433, 8080, or 3001 is taken:

```bash
docker-compose down
docker-compose up --build
```

### Database connection issues

Ensure Docker Desktop is running and the PostgreSQL container is healthy:

```bash
docker ps
docker-compose logs postgres
```

### Frontend can't connect to backend

- In dev: Next.js proxies `/api/*` to `localhost:8080` — ensure the backend is running.
- In production: ensure `NEXT_PUBLIC_API_URL` is set to the backend URL.

### Resume generation fails

1. Ensure the resume-pipeline service is running (`docker-compose logs resume-pipeline`).
2. If using server fallback keys, verify `LLM_PROVIDER` and the corresponding API key in `.env` are correct.
3. If using BYOK, add your API key in the app via **Settings → AI Provider**.

---

## License

MIT License
