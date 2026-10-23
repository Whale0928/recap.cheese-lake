import { ActivityCache, activityCacheKey } from "./activity.cache.js";
import { Injectable, Logger } from "@nestjs/common";
import { LabConfig } from "./lab.config.js";
import { activityData } from "./activity.validation.js";
import type { ActivityData, ActivityKind, ActivityPeriod, ActivityResult } from "./activity.types.js";
@Injectable()
export class LabClient {
  private readonly cooldowns = new Map<string, { expiresAt: number; result: ActivityResult<never> }>();
  private readonly pending = new Map<string, Promise<ActivityResult<ActivityData[ActivityKind]>>>();
  constructor(private readonly config: LabConfig, private readonly cache: ActivityCache) {}
  async get<K extends ActivityKind>(kind: K, subject: string, period: ActivityPeriod, channelIds: string[] = []): Promise<ActivityResult<ActivityData[K]>> {
    if (!/^[0-9a-f]{32}$/.test(subject)) throw new Error("Invalid authenticated subject");
    if (channelIds.some(id => !/^[0-9a-f]{32}$/.test(id)) || kind === "relationship" && channelIds.length !== 1) throw new Error("Invalid broadcast filter");
    if (!this.config.apiKey) return { status: "unavailable", reason: "not_configured" };
    const key = activityCacheKey(kind, subject, period, this.config.baseUrl, channelIds);
    const inflight = this.pending.get(key);
    if (inflight) return inflight as Promise<ActivityResult<ActivityData[K]>>;
    const task = this.cachedRequest(kind, subject, period, key, channelIds);
    this.pending.set(key, task);
    try { return await task; }
    finally { this.pending.delete(key); }
  }
  private async cachedRequest<K extends ActivityKind>(kind: K, subject: string, period: ActivityPeriod, key: string, channelIds: string[]): Promise<ActivityResult<ActivityData[K]>> {
    const cached = await this.cache.get(key);
    if (cached !== undefined) {
      try { return { status: "ready", data: activityData(kind, cached, subject, period, channelIds) }; }
      catch { Logger.warn("Invalid activity cache response ignored", "LabClient"); }
    }
    const cooldown = this.cooldowns.get(key);
    if (cooldown && cooldown.expiresAt > Date.now()) return cooldown.result;
    this.cooldowns.delete(key);
    const result = await this.request(kind, subject, period, channelIds);
    if (result.status === "ready") await this.cache.put(key, result.data);
    else if (result.reason === "rate_limited") {
      for (const [existing, value] of this.cooldowns) if (value.expiresAt <= Date.now()) this.cooldowns.delete(existing);
      if (this.cooldowns.size >= 500) this.cooldowns.delete(this.cooldowns.keys().next().value!);
      this.cooldowns.set(key, { expiresAt: Date.now() + (result.retryAfterSeconds ?? 1) * 1000, result });
    }
    return result;
  }
  private async request<K extends ActivityKind>(kind: K, subject: string, period: ActivityPeriod, channelIds: string[]): Promise<ActivityResult<ActivityData[K]>> {
    const path = kind === "relationship" ? `relationships/${channelIds[0]}` : kind === "activities" ? "activities" : `activities/${kind}`;
    const url = new URL(`/internal/v1/channels/${encodeURIComponent(subject)}/${path}`, this.config.baseUrl);
    if (kind !== "relationship") {
      url.search = new URLSearchParams({ from: period.from, to: period.to, ...(kind === "trend" || kind === "activities" ? { interval: period.interval } : {}) }).toString();
      for (const channelId of channelIds) url.searchParams.append("channelIds", channelId);
    }
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (response.status === 429) {
        const retry = Number(response.headers.get("Retry-After"));
        return { status: "unavailable", reason: "rate_limited", retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.min(300, Math.ceil(retry)) : 1 };
      }
      if (!response.ok) return { status: "unavailable", reason: "upstream" };
      return { status: "ready", data: activityData(kind, await response.json(), subject, period, channelIds) };
    } catch { return { status: "unavailable", reason: "upstream" }; }
  }
}
