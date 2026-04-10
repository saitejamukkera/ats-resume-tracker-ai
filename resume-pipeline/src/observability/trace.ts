// src/observability/trace.ts
// Telemetry — tracks timing, scores, cost, errors per generation.

import { v4 as uuid } from "uuid";
import type {
  GenerationTrace,
  StageTiming,
  PipelineConfig,
  FailedRule,
  RepairResult,
} from "../schemas/pipeline.js";
import { SnapshotStore } from "./debug.js";

export class PipelineTelemetry {
  private traceId: string;
  private startTime: number;
  private stages: StageTiming[] = [];
  private currentStage: { name: string; startTime: number } | null = null;
  private totalLLMCalls = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private errors: Array<{ stage: string; message: string }> = [];
  private failedRules: FailedRule[] = [];
  private repairResults: RepairResult[] = [];

  readonly snapshotStore: SnapshotStore;

  constructor() {
    this.traceId = uuid();
    this.startTime = Date.now();
    this.snapshotStore = new SnapshotStore(this.traceId);
  }

  getTraceId(): string {
    return this.traceId;
  }

  startStage(name: string): void {
    this.currentStage = { name, startTime: Date.now() };
  }

  endStage(
    name: string,
    llmCalls = 0,
    inputTokens = 0,
    outputTokens = 0,
  ): void {
    if (this.currentStage && this.currentStage.name === name) {
      this.stages.push({
        name,
        durationMs: Date.now() - this.currentStage.startTime,
        llmCalls,
        inputTokens,
        outputTokens,
        status: "success",
      });
      this.totalLLMCalls += llmCalls;
      this.totalInputTokens += inputTokens;
      this.totalOutputTokens += outputTokens;
      this.currentStage = null;
    }
  }

  skipStage(name: string, reason: string): void {
    this.stages.push({
      name,
      durationMs: 0,
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      status: "skipped",
      skippedReason: reason,
    });
    if (this.currentStage?.name === name) {
      this.currentStage = null;
    }
  }

  failStage(name: string, error: string): void {
    if (this.currentStage && this.currentStage.name === name) {
      this.stages.push({
        name,
        durationMs: Date.now() - this.currentStage.startTime,
        llmCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        status: "failed",
      });
      this.errors.push({ stage: name, message: error });
      this.currentStage = null;
    }
  }

  recordError(stage: string, message: string): void {
    this.errors.push({ stage, message });
  }

  recordFailedRules(rules: FailedRule[]): void {
    this.failedRules = rules;
  }

  recordRepairResults(results: RepairResult[]): void {
    this.repairResults = results;
  }

  finalize(
    status: "success" | "partial" | "failed",
    scores: { ats: number; impactScore: number },
    validation: {
      totalChecks: number;
      passed: number;
      failed: number;
      repairAttempts: number;
    },
    extra?: {
      config?: PipelineConfig;
      input?: { jdLength: number; rolesCount: number; totalBullets: number };
      impactProfile?: { overallScore: number; metricsRatio: number };
    },
  ): GenerationTrace {
    const snapshots = this.snapshotStore.getAll();

    return {
      traceId: this.traceId,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - this.startTime,
      stages: this.stages,
      scores,
      validation,
      cost: {
        llmCalls: this.totalLLMCalls,
        inputTokens: this.totalInputTokens,
        outputTokens: this.totalOutputTokens,
        totalTokens: this.totalInputTokens + this.totalOutputTokens,
        provider: this.snapshotStore.getProvider(),
        modelsUsed: this.snapshotStore.getModelsUsed(),
      },
      input: extra?.input,
      impactProfile: extra?.impactProfile,
      configSnapshot: extra?.config,
      failedRules: this.failedRules.length > 0 ? this.failedRules : undefined,
      repairResults:
        this.repairResults.length > 0 ? this.repairResults : undefined,
      status,
      errors: this.errors,
    };
  }
}
