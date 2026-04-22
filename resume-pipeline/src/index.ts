// src/index.ts
// Express server — single POST /generate endpoint.
// Stateless: receives resume + JD, returns validated LaTeX + cover letter + scores.

import express from "express";
import { runPipeline } from "./pipeline/runner.js";
import type { PipelineInput } from "./schemas/pipeline.js";
import type { PipelineEvent } from "./pipeline/runner.js";
import { DEFAULT_CONFIG } from "./schemas/pipeline.js";
import { RateLimitError } from "./observability/llm-wrapper.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// Parse JSON bodies up to 5MB (resumes can be large)
app.use(express.json({ limit: "5mb" }));

// ── Health Check ────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "resume-pipeline",
    timestamp: new Date().toISOString(),
  });
});

// ── Generate Endpoint (original — returns full JSON) ────────────
app.post("/generate", async (req, res) => {
  const startTime = Date.now();

  try {
    const body = req.body as PipelineInput;

    // Validate required fields
    if (!body.baseResumeLatex || !body.jobDescription) {
      res.status(400).json({
        error: "Missing required fields: baseResumeLatex, jobDescription",
      });
      return;
    }

    console.log(
      `[server] POST /generate — JD length: ${body.jobDescription.length}, Resume length: ${body.baseResumeLatex.length}`,
    );

    const result = await runPipeline(body, DEFAULT_CONFIG);

    console.log(
      `[server] Generation complete in ${Date.now() - startTime}ms — ATS: ${result.atsScore}`,
    );

    res.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[server] Generation failed after ${Date.now() - startTime}ms:`,
      msg,
    );

    if (error instanceof RateLimitError) {
      res.status(429).json({
        error: "Rate limit exceeded",
        message: `API rate limit exceeded. Please try again in ${error.retryAfterSeconds} seconds.`,
        retryAfterSeconds: error.retryAfterSeconds,
      });
    } else {
      res.status(500).json({
        error: "Pipeline execution failed",
        message: msg,
      });
    }
  }
});

// ── SSE Streaming Endpoint ──────────────────────────────────────
// Returns Server-Sent Events as each pipeline stage completes.
// Key events: jd-parsed, resume-ready (resume usable), complete (with cover letter).
app.post("/generate-stream", async (req, res) => {
  const startTime = Date.now();

  const body = req.body as PipelineInput;
  if (!body.baseResumeLatex || !body.jobDescription) {
    res
      .status(400)
      .json({
        error: "Missing required fields: baseResumeLatex, jobDescription",
      });
    return;
  }

  console.log(
    `[server] POST /generate-stream — JD length: ${body.jobDescription.length}, Resume length: ${body.baseResumeLatex.length}`,
  );

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx buffering
  });

  const sendEvent = (event: PipelineEvent) => {
    res.write(
      `event: ${event.type}\ndata: ${JSON.stringify(event.data || {})}\n\n`,
    );
  };

  try {
    const result = await runPipeline(body, DEFAULT_CONFIG, sendEvent);
    // The runner emits a 'complete' event with cover letter + scores.
    // No need to send another one here.
    console.log(
      `[server] Stream complete in ${Date.now() - startTime}ms — ATS: ${result.atsScore}`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[server] Stream failed after ${Date.now() - startTime}ms:`,
      msg,
    );

    if (error instanceof RateLimitError) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          error: `API rate limit exceeded. Please try again in ${error.retryAfterSeconds} seconds.`,
          retryAfterSeconds: error.retryAfterSeconds,
          rateLimited: true,
        })}\n\n`,
      );
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
    }
  } finally {
    res.end();
  }
});

// ── Start Server ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Resume pipeline listening on port ${PORT}`);
  console.log(`[server] Endpoints:`);
  console.log(`[server]   GET  /health`);
  console.log(`[server]   POST /generate`);
  console.log(`[server]   POST /generate-stream (SSE)`);
});
