import { HttpException, Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { performance } from "node:perf_hooks";
import { DataSource } from "typeorm";
import type { ActivityOutcome, ActivityType } from "./activity-log.types.js";

@Injectable()
export class ActivityLogService implements OnModuleInit, OnModuleDestroy {
  private cleanup: ReturnType<typeof setInterval> | undefined;
  constructor(@Inject(DataSource) private readonly source: DataSource | null) {}

  async track<T>(context: { channelId: string; activityType: ActivityType }, work: () => Promise<T>, classify: (value: T) => ActivityOutcome = () => ({ result: "success" })): Promise<T> {
    const startedAt = new Date();
    const timer = performance.now();
    let outcome: ActivityOutcome = { result: "success" };
    let responseStatus = 200;
    try {
      const value = await work();
      outcome = classify(value);
      return value;
    } catch (error) {
      responseStatus = error instanceof HttpException ? error.getStatus() : 500;
      outcome = { result: "failure", failureStage: "request", errorCode: responseStatus < 500 ? "REQUEST_REJECTED" : "PROCESSING_FAILED" };
      throw error;
    } finally {
      const finishedAt = new Date();
      const durationMs = Math.round(performance.now() - timer);
      if (this.source) {
        try {
          // 기존 세션도 계정 참조를 보장하고, 저장된 프로필은 변경하지 않는다.
          await this.source.query(`
            WITH account AS (
              INSERT INTO recap.chzzk_accounts (channel_id) VALUES ($1) ON CONFLICT (channel_id) DO NOTHING
            )
            INSERT INTO recap.activity_logs
              (channel_id, activity_type, started_at, finished_at, duration_ms, result, response_status, failure_stage, error_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [context.channelId, context.activityType, startedAt, finishedAt, durationMs, outcome.result, responseStatus,
            outcome.result === "success" ? null : outcome.failureStage, outcome.result === "success" ? null : outcome.errorCode]);
        } catch { Logger.warn("Activity log persistence failed", "ActivityLogService"); }
      }
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.source) return;
    await this.purge();
    this.cleanup = setInterval(() => { void this.purge(); }, 60 * 60_000);
    this.cleanup.unref();
  }
  onModuleDestroy(): void { if (this.cleanup) clearInterval(this.cleanup); }

  private async purge(): Promise<void> {
    try { await this.source?.query("DELETE FROM recap.activity_logs WHERE started_at < CURRENT_TIMESTAMP - INTERVAL '90 days'"); }
    catch { Logger.warn("Activity log cleanup failed", "ActivityLogService"); }
  }
}
