import { createHash } from "node:crypto";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { createClient } from "redis";
import { ActivityCacheConfig } from "./activity.cache.config.js";
import type { ActivityKind, ActivityPeriod } from "./activity.types.js";

export const ACTIVITY_CACHE_TTL_MS = 300_000;
export const ACTIVITY_CACHE_MAX_ENTRIES = 128;
export const ACTIVITY_CACHE_MAX_BYTES = 256 * 1024;
export const ACTIVITY_CACHE_PREFIX = "recap:cache:{activity:v1}:";
export const ACTIVITY_CACHE_INDEX = `${ACTIVITY_CACHE_PREFIX}index`;

export function activityCacheKey(kind: ActivityKind, subject: string, period: ActivityPeriod, upstream: string): string {
  const hash = createHash("sha256").update(JSON.stringify([upstream, kind, subject, period.from, period.to, kind === "trend" ? period.interval : null])).digest("hex");
  return `${ACTIVITY_CACHE_PREFIX}entry:${hash}`;
}

// 캐시 값과 인덱스를 원자적으로 갱신해 여러 Pod에서도 전역 개수 상한을 지킨다.
const putScript = `
local clock = redis.call('TIME')
local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
if now > tonumber(ARGV[5]) then return 0 end
local ttl = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if not redis.call('ZSCORE', KEYS[2], KEYS[1]) then
  local excess = redis.call('ZCARD', KEYS[2]) - tonumber(ARGV[3]) + 1
  if excess > 0 then
    local oldest = redis.call('ZRANGE', KEYS[2], 0, excess - 1)
    for _, key in ipairs(oldest) do
      if string.sub(key, 1, string.len(ARGV[4])) == ARGV[4] then
        redis.call('DEL', key)
      end
      redis.call('ZREM', KEYS[2], key)
    end
  end
end
redis.call('SET', KEYS[1], ARGV[1], 'PXAT', now + ttl)
redis.call('ZADD', KEYS[2], now + ttl, KEYS[1])
redis.call('PEXPIRE', KEYS[2], ttl)
return 1
`;

@Injectable()
export class ActivityCache implements OnModuleInit, OnModuleDestroy {
  private client: ReturnType<typeof createClient> | undefined;
  private readonly memory = new Map<string, { expiresAt: number; value: string }>();
  private warned = false;
  private retryAt = 0;

  constructor(private readonly config: ActivityCacheConfig) {}

  onModuleInit(): void {
    if (!this.config.host) return;
    this.client = createClient({
      socket: { host: this.config.host, port: this.config.port, connectTimeout: 1000, reconnectStrategy: retries => Math.min(100 * 2 ** Math.min(retries, 5), 3000) },
      password: this.config.password,
      disableOfflineQueue: true,
      commandsQueueMaxLength: 64,
    });
    this.client.on("error", () => this.warnUnavailable());
    this.client.on("ready", () => { this.warned = false; this.retryAt = 0; });
    void this.client.connect().catch(() => this.warnUnavailable());
  }

  get ready(): boolean { return this.client?.isReady === true; }

  private warnUnavailable(): void {
    this.retryAt = Date.now() + 1000;
    if (this.warned) return;
    this.warned = true;
    Logger.warn("Activity cache unavailable; using bounded memory cache", "ActivityCache");
  }

  private async bounded<T>(task: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([task, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Activity cache command timed out")), 250);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }

  private checkKey(key: string): void {
    if (!key.startsWith(`${ACTIVITY_CACHE_PREFIX}entry:`) || !/^[a-f0-9]{64}$/.test(key.slice(`${ACTIVITY_CACHE_PREFIX}entry:`.length))) throw new Error("Invalid activity cache key");
  }

  private decode(value: string): unknown {
    if (Buffer.byteLength(value) > ACTIVITY_CACHE_MAX_BYTES) return undefined;
    try { return JSON.parse(value) as unknown; }
    catch { Logger.warn("Invalid activity cache entry ignored", "ActivityCache"); return undefined; }
  }

  async get(key: string): Promise<unknown> {
    this.checkKey(key);
    if (this.client?.isReady && Date.now() >= this.retryAt) {
      try {
        const value = await this.bounded(this.client.withAbortSignal(AbortSignal.timeout(250)).get(key));
        if (value !== null) return this.decode(value);
      } catch { this.warnUnavailable(); }
    }
    const cached = this.memory.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) { this.memory.delete(key); return undefined; }
    return this.decode(cached.value);
  }

  async put(key: string, data: unknown): Promise<void> {
    this.checkKey(key);
    const value = JSON.stringify(data);
    if (value === undefined || Buffer.byteLength(value) > ACTIVITY_CACHE_MAX_BYTES) return;
    const now = Date.now();
    for (const [existing, cached] of this.memory) if (cached.expiresAt <= now) this.memory.delete(existing);
    if (!this.memory.has(key) && this.memory.size >= ACTIVITY_CACHE_MAX_ENTRIES) this.memory.delete(this.memory.keys().next().value!);
    this.memory.set(key, { expiresAt: now + ACTIVITY_CACHE_TTL_MS, value });
    if (!this.client?.isReady || Date.now() < this.retryAt) return;
    try {
      await this.bounded(this.client.withAbortSignal(AbortSignal.timeout(250)).eval(putScript, {
        keys: [key, ACTIVITY_CACHE_INDEX],
        arguments: [value, String(ACTIVITY_CACHE_TTL_MS), String(ACTIVITY_CACHE_MAX_ENTRIES), `${ACTIVITY_CACHE_PREFIX}entry:`, String(Date.now() + 250)],
      }));
    } catch { this.warnUnavailable(); }
  }

  onModuleDestroy(): void {
    if (this.client?.isOpen) this.client.destroy();
    this.memory.clear();
  }
}
