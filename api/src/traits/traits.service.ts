import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { ActivityCache, ACTIVITY_CACHE_PREFIX } from "../activity/activity.cache.js";
import { LabConfig } from "../activity/lab.config.js";
import type { ActivityResult } from "../activity/activity.types.js";
import { traitsData } from "./traits.validation.js";
import type { ViewerTraits } from "./traits.types.js";

// Lab 은 요청마다 판정하고 몰리면 초당 처리량이 낮다(ADR-0025 Lab 측 실측). 같은 사람의
// 새로고침이 Lab 까지 가지 않게 활동 집계와 같은 5분 동안 검증한 응답을 공유한다.
export const TRAITS_TTL_MS = 300_000;

@Injectable()
export class TraitsService {
  private readonly pending = new Map<string, Promise<ActivityResult<ViewerTraits>>>();
  constructor(private readonly config: LabConfig, private readonly store: ActivityCache) {}

  async get(subject: string): Promise<ActivityResult<ViewerTraits>> {
    if (!/^[0-9a-f]{32}$/.test(subject)) throw new Error("Invalid authenticated subject");
    if (!this.config.apiKey) return { status: "unavailable", reason: "not_configured" };
    const hash = createHash("sha256").update(JSON.stringify(["traits:v1", this.config.baseUrl, subject])).digest("hex");
    const key = `${ACTIVITY_CACHE_PREFIX}entry:${hash}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const work = this.load(key, subject);
    this.pending.set(key, work);
    try { return await work; }
    finally { this.pending.delete(key); }
  }

  private async load(key: string, subject: string): Promise<ActivityResult<ViewerTraits>> {
    const cached = await this.store.get(key);
    if (cached !== undefined) {
      try { return { status: "ready", data: traitsData(cached, subject) }; }
      catch { Logger.warn("Invalid traits cache ignored", "TraitsService"); }
    }
    try {
      const url = new URL(`/internal/v1/channels/${encodeURIComponent(subject)}/traits`, this.config.baseUrl);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (response.status === 429 || response.status === 503) {
        const retry = Number(response.headers.get("Retry-After"));
        return { status: "unavailable", reason: "rate_limited", retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.min(300, Math.ceil(retry)) : 1 };
      }
      if (!response.ok) return { status: "unavailable", reason: "upstream" };
      const data = traitsData(await response.json(), subject);
      await this.store.put(key, data, TRAITS_TTL_MS);
      return { status: "ready", data };
    } catch { return { status: "unavailable", reason: "upstream" }; }
  }
}
