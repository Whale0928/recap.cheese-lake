import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { ActivityCache, ACTIVITY_CACHE_PREFIX } from "../activity/activity.cache.js";
import { LabConfig } from "../activity/lab.config.js";
import { observationData, observationDay } from "./observations.validation.js";
import type { DailyObservations } from "./observations.types.js";

export const OBSERVATION_TTL_MS = 300_000;
const LAB_TTL_MS = 3_600_000;
type CacheState = "HIT" | "MISS" | "COALESCED";
interface Result { data: DailyObservations; cache: CacheState }

@Injectable()
export class ObservationsService {
  private readonly pending = new Map<string, Promise<Result>>();
  private memory: { key: string; expiresAt: number; data: DailyObservations } | undefined;
  constructor(private readonly config: LabConfig, private readonly store: ActivityCache) {}

  async get(): Promise<Result> {
    const day = observationDay(Date.now());
    const hash = createHash("sha256").update(JSON.stringify(["observations:v1", this.config.baseUrl, day.date])).digest("hex");
    const key = `${ACTIVITY_CACHE_PREFIX}entry:${hash}`;
    // 모든 방문자가 같은 하루를 읽으므로 검증한 완성본 한 개는 Redis 왕복 없이 제공한다.
    if (this.memory?.key === key && this.memory.expiresAt > Date.now()) return { data: this.memory.data, cache: "HIT" };
    const existing = this.pending.get(key);
    if (existing) return { ...(await existing), cache: "COALESCED" };
    const work = this.load(key, day);
    this.pending.set(key, work);
    try { return await work; }
    finally { this.pending.delete(key); }
  }

  private async load(key: string, day: ReturnType<typeof observationDay>): Promise<Result> {
    try {
      const cached = await this.store.get(key);
      if (typeof cached === "object" && cached !== null && "expiresAt" in cached && "data" in cached && typeof cached.expiresAt === "number" && cached.expiresAt > Date.now() && cached.expiresAt <= Date.now() + OBSERVATION_TTL_MS) {
        const data = observationData(cached.data, day.date);
        const expiresAt = Math.min(cached.expiresAt, Date.parse(data.generatedAt) + LAB_TTL_MS, day.midnight);
        if (expiresAt > Date.now()) {
          this.memory = { key, data, expiresAt };
          return { data, cache: "HIT" };
        }
      }
    } catch { Logger.warn("Invalid observation cache ignored", "ObservationsService"); }
    if (!this.config.apiKey) throw new ServiceUnavailableException("Observations unavailable");
    try {
      const url = new URL("/internal/v1/observations/daily", this.config.baseUrl);
      url.searchParams.set("date", day.date);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (!response.ok) throw new Error("Observation upstream unavailable");
      const raw: unknown = await response.json();
      const data = observationData(raw, day.date);
      // Lab의 한 시간 만료와 KST 자정을 넘겨 이전 집계를 새 캐시처럼 연장하지 않는다.
      const expiresAt = Math.min(Date.now() + OBSERVATION_TTL_MS, Date.parse(data.generatedAt) + LAB_TTL_MS, day.midnight);
      const ttl = Math.floor(expiresAt - Date.now());
      if (ttl > 0) {
        this.memory = { key, data, expiresAt };
        await this.store.put(key, { data, expiresAt }, ttl);
      }
      return { data, cache: "MISS" };
    } catch { throw new ServiceUnavailableException("Observations unavailable"); }
  }
}
