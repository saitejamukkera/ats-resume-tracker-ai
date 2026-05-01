// src/index.ts
// Express server — single POST /generate endpoint.
// Stateless: receives resume + JD, returns validated LaTeX + cover letter + scores.

import express from "express";
import { runPipeline } from "./pipeline/runner.js";
import type { PipelineInput } from "./schemas/pipeline.js";
import type { PipelineEvent } from "./pipeline/runner.js";
import { DEFAULT_CONFIG } from "./schemas/pipeline.js";
import { RateLimitError } from "./observability/llm-wrapper.js";
import {
  PerRequestKeyProvider,
  ServerKeyProvider,
  CompositeKeyProvider,
  resolveProvider,
  type ProviderKeyProvider,
  type LLMProvider,
} from "./security/key-provider.js";
import { sanitizeObject } from "./security/key-sanitizer.js";
import { validateKeyFormat } from "./security/key-validator.js";

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

// ── Key extraction helper ───────────────────────────────────────
function extractKeyProvider(body: Record<string, unknown>): {
  keyProvider?: ProviderKeyProvider;
  pipelineInput: PipelineInput;
} {
  const { apiKeys, llmProvider, ...pipelineInputRaw } = body;
  const pipelineInput = pipelineInputRaw as unknown as PipelineInput;

  let keyProvider: ProviderKeyProvider | undefined;

  if (apiKeys && typeof apiKeys === "object") {
    const keys = apiKeys as Record<string, string>;
    const hasAnyKey = Object.values(keys).some((v) => v && v.trim().length > 0);

    if (hasAnyKey) {
      const preferred = resolveProvider(
        llmProvider as string | undefined,
        process.env.LLM_PROVIDER,
      );
      const userKp = new PerRequestKeyProvider(keys, preferred);
      const serverKp = new ServerKeyProvider(
        process.env.LLM_PROVIDER as LLMProvider || "google",
      );
      keyProvider = new CompositeKeyProvider(userKp, serverKp);
    }
  }

  return { keyProvider, pipelineInput };
}

// ── Generate Endpoint (original — returns full JSON) ────────────
app.post("/generate", async (req, res) => {
  const startTime = Date.now();

  try {
    const body = req.body as Record<string, unknown>;
    const { keyProvider, pipelineInput } = extractKeyProvider(body);

    // Log sanitized request (no keys)
    const loggable = sanitizeObject(body);
    console.log(
      `[server] POST /generate — JD length: ${(loggable.jobDescription as string)?.length ?? 0}, Resume length: ${(loggable.baseResumeLatex as string)?.length ?? 0}${keyProvider ? " [BYOK]" : ""}`,
    );

    // Validate required fields
    if (!pipelineInput.baseResumeLatex || !pipelineInput.jobDescription) {
      res.status(400).json({
        error: "Missing required fields: baseResumeLatex, jobDescription",
      });
      return;
    }

    const result = await runPipeline(pipelineInput, DEFAULT_CONFIG, undefined, keyProvider);

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

  const body = req.body as Record<string, unknown>;
  const { keyProvider, pipelineInput } = extractKeyProvider(body);

  const loggable = sanitizeObject(body);
  console.log(
    `[server] POST /generate-stream — JD length: ${(loggable.jobDescription as string)?.length ?? 0}, Resume length: ${(loggable.baseResumeLatex as string)?.length ?? 0}${keyProvider ? " [BYOK]" : ""}`,
  );

  if (!pipelineInput.baseResumeLatex || !pipelineInput.jobDescription) {
    res
      .status(400)
      .json({
        error: "Missing required fields: baseResumeLatex, jobDescription",
      });
    return;
  }

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
    const result = await runPipeline(pipelineInput, DEFAULT_CONFIG, sendEvent, keyProvider);
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

// ── Validate Key Endpoint ──────────────────────────────────────
app.post("/validate-key", (req, res) => {
  const body = req.body as Record<string, unknown>;
  const provider = (body.provider as string) || "";
  const apiKey = (body.apiKey as string) || "";

  const validProviders: LLMProvider[] = ["google", "openai", "anthropic"];
  if (!validProviders.includes(provider as LLMProvider)) {
    res.json({ valid: false, message: "Invalid provider." });
    return;
  }

  const result = validateKeyFormat(provider as LLMProvider, apiKey);
  res.json(result);
});

// ── Start Server ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Resume pipeline listening on port ${PORT}`);
  console.log(`[server] Endpoints:`);
  console.log(`[server]   GET  /health`);
  console.log(`[server]   POST /generate`);
  console.log(`[server]   POST /generate-stream (SSE)`);
  console.log(`[server]   POST /validate-key`);
});
