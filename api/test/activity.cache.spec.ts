import { jest } from "@jest/globals";
import { ActivityCache, activityCacheKey, ACTIVITY_CACHE_MAX_BYTES, ACTIVITY_CACHE_MAX_ENTRIES, ACTIVITY_CACHE_TTL_MS } from "../src/activity/activity.cache.js";
import { ActivityCacheConfig } from "../src/activity/activity.cache.config.js";

const period = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-22T00:00:00.000Z", interval: "day" as const };
const key = (subject = "a".repeat(32)) => activityCacheKey("summary", subject, period, "http://upstream.test");
const cache = () => new ActivityCache({ host: undefined, port: 6379, password: undefined });

afterEach(() => jest.restoreAllMocks());

describe("activity cache isolation and memory fallback", () => {
  it("uses an opaque recap namespace and separates users, periods, endpoints and upstreams", () => {
    expect(key()).toMatch(/^recap:cache:\{activity:v1\}:entry:[a-f0-9]{64}$/);
    expect(key()).not.toContain("a".repeat(32));
    const keys = new Set([key(), key("b".repeat(32)), activityCacheKey("channels", "a".repeat(32), period, "http://upstream.test"), activityCacheKey("summary", "a".repeat(32), { ...period, to: "2026-10-23T00:00:00.000Z" }, "http://upstream.test"), activityCacheKey("summary", "a".repeat(32), period, "http://other.test")]);
    expect(keys.size).toBe(5);
    expect(activityCacheKey("trend", "a".repeat(32), period, "http://upstream.test")).not.toBe(activityCacheKey("trend", "a".repeat(32), { ...period, interval: "month" }, "http://upstream.test"));
    expect(key()).toBe(activityCacheKey("summary", "a".repeat(32), { ...period, interval: "month" }, "http://upstream.test"));
  });

  it("expires at five minutes without extending TTL on reads", async () => {
    const store = cache();
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    await store.put(key(), { count: 5 });
    now.mockReturnValue(1_000_000 + ACTIVITY_CACHE_TTL_MS - 1);
    expect(await store.get(key())).toEqual({ count: 5 });
    now.mockReturnValue(1_000_000 + ACTIVITY_CACHE_TTL_MS);
    expect(await store.get(key())).toBeUndefined();
  });

  it("bounds memory entries and skips oversized UTF-8 responses", async () => {
    const store = cache();
    for (let i = 0; i <= ACTIVITY_CACHE_MAX_ENTRIES; i++) await store.put(key(String(i)), { count: i });
    expect(await store.get(key("0"))).toBeUndefined();
    expect(await store.get(key(String(ACTIVITY_CACHE_MAX_ENTRIES)))).toEqual({ count: ACTIVITY_CACHE_MAX_ENTRIES });
    await store.put(key("large"), { text: "가".repeat(ACTIVITY_CACHE_MAX_BYTES / 2) });
    expect(await store.get(key("large"))).toBeUndefined();
  });

  it("rejects keys outside its namespace", async () => {
    const store = cache();
    await expect(store.put("recap:session:other", {})).rejects.toThrow("Invalid activity cache key");
    await expect(store.get("other:cache:key")).rejects.toThrow("Invalid activity cache key");
  });
});

describe("activity cache configuration", () => {
  it.each(["0", "65536", "bad"])("rejects an invalid port: %s", value => {
    jest.replaceProperty(process, "env", { ...process.env, RECAP_CACHE_REDIS_PORT: value });
    expect(() => new ActivityCacheConfig()).toThrow("Invalid RECAP_CACHE_REDIS_PORT");
  });

  it("requires a password for a configured production cache", () => {
    jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "production", RECAP_CACHE_REDIS_HOST: "lab-redis", RECAP_CACHE_REDIS_PASSWORD: "" });
    expect(() => new ActivityCacheConfig()).toThrow("RECAP_CACHE_REDIS_PASSWORD is required");
  });
});
