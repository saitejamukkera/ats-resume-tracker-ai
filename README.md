# TrackHire AI

A full-stack application to track job applications and generate AI-tailored resumes using Google Gemini and LaTeX.

## Features

- **Resume Management**: Store base LaTeX resumes.
- **AI Generation**: Generate role-specific resumes based on Job Descriptions.
- **Tracking**: Manage application status (Active, Rejected, etc.).
- **PDF Generation**: Auto-compile LaTeX to PDF.

## Tech Stack

- **Backend**: Spring Boot 4, Java 21, PostgreSQL, Docker (LaTeX support).
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS.
- **AI**: Google Gemini API.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Google Gemini API Key](https://aistudio.google.com/) (free tier available)
- [Node.js 18+](https://nodejs.org/) (for local frontend development)
- [Java 21](https://adoptium.net/) (for local backend development)

---

## Quick Start (Docker)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/Job-Resume-Tracker.git
cd Job-Resume-Tracker
```

### 2. Create Environment File

Copy the example environment file:

**Windows (CMD):**

```cmd
copy .env.example .env
```

**Linux/macOS:**

```bash
cp .env.example .env
```

### 3. Configure Environment Variables

Edit the `.env` file and fill in the values:

```dotenv
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=ats_tracker
GEMINI_API_KEY=your_gemini_api_key_here
SERVER_PORT=8080
```

| Variable            | Description                         |
| ------------------- | ----------------------------------- |
| `POSTGRES_USER`     | PostgreSQL username                 |
| `POSTGRES_PASSWORD` | PostgreSQL password                 |
| `POSTGRES_DB`       | Database name                       |
| `GEMINI_API_KEY`    | Your Google Gemini API key          |
| `SERVER_PORT`       | Backend server port (default: 8080) |

### 4. Run with Docker Compose

```bash
docker-compose up --build
```

This will start:

- **PostgreSQL** database on port `5432`
- **Backend API** on http://localhost:8080

### 5. Run Frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at http://localhost:5173

---

## Local Development Setup

If you prefer running services locally without Docker for the backend:

### 1. Setup Environment Variables

Create a `.env` file in the `backend` folder:

**Windows (CMD):**

```cmd
cd backend
copy .env.example .env
```

**Linux/macOS:**

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your values:

```dotenv
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=ats_tracker
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Start PostgreSQL Only

From the project root:

```bash
docker-compose up postgres -d
```

### 3. Run Backend

```bash
cd backend
./mvnw spring-boot:run
```

**Windows:**

```cmd
cd backend
mvnw.cmd spring-boot:run
```

Backend API will be available at http://localhost:8080

### 4. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at http://localhost:5173

---

## API Endpoints

| Method | Endpoint                       | Description         |
| ------ | ------------------------------ | ------------------- |
| POST   | `/auth/signup`                 | Register a new user |
| POST   | `/auth/login`                  | Login user          |
| GET    | `/oauth2/authorize/{provider}` | OAuth2 login        |

---

## Project Structure

```
Job-Resume-Tracker/
├── backend/                 # Spring Boot backend
│   ├── src/
│   ├── pom.xml
│   ├── Dockerfile
│   └── compose.yaml
├── frontend/                # React + Vite frontend
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml       # Full stack Docker setup
├── .env.example             # Environment template
└── README.md
```

---

## Troubleshooting

### Port already in use

If port 5432 or 8080 is already in use:

```bash
docker-compose down
docker-compose up --build
```

### Database connection issues

Ensure Docker Desktop is running and the PostgreSQL container is healthy:

```bash
docker ps
```

### Frontend can't connect to backend

Make sure the backend is running and CORS is configured for `http://localhost:5173`.

---

## License

MIT License
