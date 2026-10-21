import { Injectable } from "@nestjs/common";
import { LabConfig } from "./lab.config.js";
import { activityData } from "./activity.validation.js";
import type { ActivityData, ActivityKind, ActivityPeriod, ActivityResult } from "./activity.types.js";
@Injectable()
export class LabClient {
  private readonly cache = new Map<string, { expiresAt: number; result: ActivityResult<ActivityData[ActivityKind]> }>();
  private readonly pending = new Map<string, Promise<ActivityResult<ActivityData[ActivityKind]>>>();
  constructor(private readonly config: LabConfig) {}
  async get<K extends ActivityKind>(kind: K, subject: string, period: ActivityPeriod): Promise<ActivityResult<ActivityData[K]>> {
    if (!/^[0-9a-f]{32}$/.test(subject)) throw new Error("Invalid authenticated subject");
    if (!this.config.apiKey) return { status: "unavailable", reason: "not_configured" };
    const key = JSON.stringify([kind, subject, period.from, period.to, kind === "trend" ? period.interval : null]);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.result as ActivityResult<ActivityData[K]>;
    const inflight = this.pending.get(key);
    if (inflight) return inflight as Promise<ActivityResult<ActivityData[K]>>;
    const task = this.request(kind, subject, period);
    this.pending.set(key, task);
    try {
      const result = await task;
      const ttl = result.status === "ready" ? 30_000 : result.reason === "rate_limited" ? (result.retryAfterSeconds ?? 1) * 1000 : 0;
      if (ttl > 0) {
        for (const [k, v] of this.cache) if (v.expiresAt <= Date.now()) this.cache.delete(k);
        if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { result, expiresAt: Date.now() + ttl });
      }
      return result;
    } finally { this.pending.delete(key); }
  }
  private async request<K extends ActivityKind>(kind: K, subject: string, period: ActivityPeriod): Promise<ActivityResult<ActivityData[K]>> {
    const url = new URL(`/internal/v1/channels/${encodeURIComponent(subject)}/activities/${kind}`, this.config.baseUrl);
    url.search = new URLSearchParams({ from: period.from, to: period.to, ...(kind === "trend" ? { interval: period.interval } : {}) }).toString();
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (response.status === 429) {
        const retry = Number(response.headers.get("Retry-After"));
        return { status: "unavailable", reason: "rate_limited", retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.min(300, Math.ceil(retry)) : 1 };
      }
      if (!response.ok) return { status: "unavailable", reason: "upstream" };
      return { status: "ready", data: activityData(kind, await response.json(), subject, period) };
    } catch { return { status: "unavailable", reason: "upstream" }; }
  }
}
