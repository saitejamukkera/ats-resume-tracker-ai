# Job Application Tracking System (ATS)

A full-stack application to track job applications and generate AI-tailored resumes using Google Gemini and LaTeX.

## Features

- **Resume Management**: Store base LaTeX resumes.
- **AI Generation**: Generate role-specific resumes based on Job Descriptions.
- **Tracking**: Manage application status (Active, Rejected, etc.).
- **PDF Generation**: Auto-compile LaTeX to PDF.

## Tech Stack

- **Backend**: Spring Boot 3, Java 17, PostgreSQL, Docker (LaTeX support).
- **Frontend**: React, TypeScript, Vite, Shadcn UI.
- **AI**: Google Gemini API.

## Prerequisites

- Docker Desktop
- Google Gemini API Key

## Setup

1.  **Environment Variables**:
    Copy `.env.example` to `.env` and set your `GEMINI_API_KEY`.

    ```bash
    cp .env.example .env
    ```

2.  **Run with Docker**:
    ```bash
    docker-compose up --build
    ```

    - Backend: http://localhost:8080
    - Frontend: http://localhost:5173

## Development

- **Backend**: `mvn spring-boot:run` (Requires local Java 17 + LaTeX)
- **Frontend**: `npm run dev` (Requires Node.js 18+)
