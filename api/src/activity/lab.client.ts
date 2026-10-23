import { ActivityCache, activityCacheKey, ACTIVITY_CACHE_TTL_MS } from "./activity.cache.js";
import { Injectable, Logger } from "@nestjs/common";
import { LabConfig } from "./lab.config.js";
import { activityData } from "./activity.validation.js";
import type { ActivityData, ActivityKind, ActivityPeriod, ActivityResult } from "./activity.types.js";

const profileDelays = [2_000, 4_000, 8_000];
interface ProfileRetry { attempts: number; retryAt: number; expiresAt: number }
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
function missingImages(kind: ActivityKind, data: unknown): boolean {
  if (!object(data)) return false;
  if (kind === "relationship") return object(data.channel) && data.channel.channelImageUrl === null;
  return (kind === "channels" || kind === "activities") && Array.isArray(data.channels) && data.channels.some(channel => object(channel) && channel.channelImageUrl === null);
}
function profileRetry(value: unknown): ProfileRetry | undefined {
  if (!object(value) || !object(value.__profileRetry)) return;
  const { attempts, retryAt, expiresAt } = value.__profileRetry;
  if (typeof attempts !== "number" || !Number.isInteger(attempts) || attempts < 0 || attempts > 3 || typeof retryAt !== "number" || !Number.isSafeInteger(retryAt) || typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + ACTIVITY_CACHE_TTL_MS) return;
  return { attempts, retryAt, expiresAt };
}
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
    let previous: ActivityData[K] | undefined;
    let retry: ProfileRetry | undefined;
    if (cached !== undefined) {
      try { previous = activityData(kind, cached, subject, period, channelIds); }
      catch { Logger.warn("Invalid activity cache response ignored", "LabClient"); }
      if (previous !== undefined) {
        if (!missingImages(kind, previous)) return { status: "ready", data: previous };
        retry = profileRetry(cached);
        // 이전 버전의 캐시도 한 번만 재검증 일정을 붙여 이어서 사용한다.
        if (!retry) return this.cacheProfileResult(key, previous);
        if (retry.attempts >= profileDelays.length || Date.now() < retry.retryAt) return this.profileResult(key, previous, retry);
        retry = { ...retry, attempts: retry.attempts + 1, retryAt: Date.now() + (profileDelays[retry.attempts + 1] ?? 0) };
      }
    }
    const cooldown = this.cooldowns.get(key);
    if (cooldown && cooldown.expiresAt > Date.now()) return cooldown.result;
    this.cooldowns.delete(key);
    const result = await this.request(kind, subject, period, channelIds);
    if (result.status === "ready") {
      if (missingImages(kind, result.data)) return this.cacheProfileResult(key, result.data, retry);
      await this.cache.put(key, result.data);
    } else if (previous !== undefined && retry) {
      // 재검증 실패가 기존 집계·이미지를 지우거나 재시도 예산을 되돌리지 않게 한다.
      if (result.reason === "rate_limited") retry.retryAt = Math.max(retry.retryAt, Date.now() + (result.retryAfterSeconds ?? 1) * 1000);
      return this.cacheProfileResult(key, previous, retry);
    }
    else if (result.reason === "rate_limited") {
      for (const [existing, value] of this.cooldowns) if (value.expiresAt <= Date.now()) this.cooldowns.delete(existing);
      if (this.cooldowns.size >= 500) this.cooldowns.delete(this.cooldowns.keys().next().value!);
      this.cooldowns.set(key, { expiresAt: Date.now() + (result.retryAfterSeconds ?? 1) * 1000, result });
    }
    return result;
  }
  private profileResult<T>(key: string, data: T, retry: ProfileRetry): ActivityResult<T> {
    return { status: "ready", data, ...(retry.attempts < profileDelays.length ? { profileRefresh: { key: key.slice(key.lastIndexOf(":") + 1), retryAt: retry.retryAt } } : {}) };
  }
  private async cacheProfileResult<T>(key: string, data: T, retry: ProfileRetry = { attempts: 0, retryAt: Date.now() + profileDelays[0]!, expiresAt: Date.now() + ACTIVITY_CACHE_TTL_MS }): Promise<ActivityResult<T>> {
    // null은 정상 응답이다. 재검증 일정만 추가하고 원래 5분 만료 시각은 늘리지 않는다.
    await this.cache.put(key, { ...data, __profileRetry: retry }, Math.max(1, Math.min(ACTIVITY_CACHE_TTL_MS, retry.expiresAt - Date.now())));
    return this.profileResult(key, data, retry);
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
