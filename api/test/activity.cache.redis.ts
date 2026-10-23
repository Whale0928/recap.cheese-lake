import "reflect-metadata";
import { jest } from "@jest/globals";
import { Logger } from "@nestjs/common";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "redis";
import { ActivityCache, activityCacheKey, ACTIVITY_CACHE_INDEX, ACTIVITY_CACHE_MAX_ENTRIES, ACTIVITY_CACHE_MAX_BYTES, ACTIVITY_CACHE_PREFIX } from "../src/activity/activity.cache.js";
import { LabClient } from "../src/activity/lab.client.js";

const address = process.env.RECAP_TEST_REDIS_URL;
if (!address) throw new Error("Set RECAP_TEST_REDIS_URL to a disposable test Redis before running test:cache");
const url = new URL(address);
const redis = createClient({ url: address, socket: { reconnectStrategy: false } });
const stores: ActivityCache[] = [];
const period = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-22T00:00:00.000Z", interval: "day" as const };
const subject = "a".repeat(32);
const config = { baseUrl: "http://upstream.test", apiKey: "clk_" + "a".repeat(64) };
const key = (value = subject) => activityCacheKey("summary", value, period, config.baseUrl);
const scope = { channelId: subject, channelIds: [], from: period.from, to: period.to, timeZone: "Asia/Seoul", dataScope: "collected" };
const summary = { scope, chatCount: 12, activeDays: 2, channelCount: 1 };

async function store() {
  const result = new ActivityCache({ host: url.hostname, port: Number(url.port || 6379), password: url.password ? decodeURIComponent(url.password) : undefined });
  stores.push(result);
  result.onModuleInit();
  for (let i = 0; i < 100 && !result.ready; i++) await delay(10);
  expect(result.ready).toBe(true);
  return result;
}

beforeAll(async () => { redis.on("error", () => Logger.error("Test Redis unavailable", "ActivityCacheIntegration")); await redis.connect(); });
beforeEach(async () => {
  // test:cache는 전용 Redis에서만 실행하며 Recap 캐시 이름 공간만 정리한다.
  for await (const keys of redis.scanIterator({ MATCH: `${ACTIVITY_CACHE_PREFIX}*`, COUNT: 100 })) if (keys.length) await redis.del(keys);
});
afterEach(() => { for (const result of stores.splice(0)) result.onModuleDestroy(); jest.restoreAllMocks(); });
afterAll(() => { if (redis.isOpen) redis.destroy(); });

it("shares validated results across separate clients with a 300-second Redis TTL", async () => {
  const first = new LabClient(config, await store());
  const second = new LabClient(config, await store());
  const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(summary));
  expect(await first.get("summary", subject, period)).toEqual({ status: "ready", data: summary });
  const before = await redis.pTTL(key());
  expect(before).toBeGreaterThan(299_000);
  expect(before).toBeLessThanOrEqual(300_000);
  expect(await second.get("summary", subject, period)).toEqual({ status: "ready", data: summary });
  expect(await redis.pTTL(key())).toBeLessThanOrEqual(before);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("shares the profile retry budget across clients without extending the original expiry", async () => {
  const first = new LabClient(config, await store());
  const second = new LabClient(config, await store());
  const start = Date.now();
  const now = jest.spyOn(Date, "now").mockReturnValue(start);
  const value = { scope, totalChatCount: 12, channels: [{ channelId: "b".repeat(32), channelName: "방송", channelUrl: `https://chzzk.naver.com/${"b".repeat(32)}`, channelImageUrl: null, chatCount: 12, activeDays: 2, share: 1 }], trend: { interval: "day", points: [] }, patterns: [] };
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(value));
  await first.get("activities", subject, period);
  for (const offset of [2000, 6000, 14000]) {
    now.mockReturnValue(start + offset);
    await first.get("activities", subject, period);
    await second.get("activities", subject, period);
  }
  expect(fetch).toHaveBeenCalledTimes(4);
  const cacheKey = activityCacheKey("activities", subject, period, config.baseUrl);
  expect(await redis.pTTL(cacheKey)).toBeLessThanOrEqual(286_000);
  expect(JSON.parse((await redis.get(cacheKey))!).__profileRetry.attempts).toBe(3);
});

it("caps concurrent writes globally without touching another namespace", async () => {
  const first = await store(); const second = await store();
  const foreign = "other:cache:test:namespace";
  await redis.set(foreign, "preserve", { EX: 60 });
  try {
    for (let batch = 0; batch < 5; batch++) await Promise.all(Array.from({ length: 32 }, (_, i) => (i % 2 ? first : second).put(key(String(batch * 32 + i)), { count: i })));
    expect(await redis.zCard(ACTIVITY_CACHE_INDEX)).toBe(ACTIVITY_CACHE_MAX_ENTRIES);
    let count = 0;
    for await (const keys of redis.scanIterator({ MATCH: `${ACTIVITY_CACHE_PREFIX}entry:*`, COUNT: 100 })) count += keys.length;
    expect(count).toBe(ACTIVITY_CACHE_MAX_ENTRIES);
    expect(await redis.get(foreign)).toBe("preserve");
  } finally { await redis.del(foreign); }
});

it("expires Redis entries and does not slide expiry when another client reads", async () => {
  const first = await store(); const second = await store();
  await first.put(key(), summary);
  await redis.pExpire(key(), 100);
  expect(await second.get(key())).toEqual(summary);
  expect(await redis.pTTL(key())).toBeLessThanOrEqual(100);
  await delay(150);
  expect(await second.get(key())).toBeUndefined();
});

it("skips oversized responses", async () => {
  const first = await store();
  await first.put(key(), { text: "가".repeat(ACTIVITY_CACHE_MAX_BYTES / 2) });
  expect(await redis.exists(key())).toBe(0);
  expect(await first.get(key())).toBeUndefined();
});

it("rejects cached data for another user and replaces it from the upstream", async () => {
  const first = await store();
  await redis.set(key(), JSON.stringify({ ...summary, scope: { ...scope, channelId: "b".repeat(32) } }), { EX: 300 });
  jest.spyOn(Logger, "warn").mockImplementation(() => undefined);
  const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(summary));
  expect(await new LabClient(config, first).get("summary", subject, period)).toEqual({ status: "ready", data: summary });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse((await redis.get(key()))!).scope.channelId).toBe(subject);
});

it("does not cache upstream failures as normal results", async () => {
  const first = await store();
  const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("failure", { status: 503 }));
  const lab = new LabClient(config, first);
  await lab.get("summary", subject, period);
  await lab.get("summary", subject, period);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(await redis.exists(key())).toBe(0);
});

it("falls back within a bounded wait when Redis stops responding", async () => {
  const first = await store();
  await first.put(key(), summary);
  jest.spyOn(Logger, "warn").mockImplementation(() => undefined);
  await redis.sendCommand(["CLIENT", "PAUSE", "1000", "ALL"]);
  const start = Date.now();
  expect(await first.get(key())).toEqual(summary);
  expect(Date.now() - start).toBeLessThan(750);
  await delay(1100);
});

it("does not write an expired command after Redis resumes", async () => {
  const first = await store();
  jest.spyOn(Logger, "warn").mockImplementation(() => undefined);
  await redis.sendCommand(["CLIENT", "PAUSE", "1000", "ALL"]);
  await first.put(key(), summary);
  await delay(1100);
  expect(await redis.exists(key())).toBe(0);
  expect(await first.get(key())).toEqual(summary);
});

it("ignores malformed JSON and obtains a fresh validated result", async () => {
  const first = await store();
  await redis.set(key(), "{broken-json", { EX: 300 });
  jest.spyOn(Logger, "warn").mockImplementation(() => undefined);
  const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(summary));
  expect(await new LabClient(config, first).get("summary", subject, period)).toEqual({ status: "ready", data: summary });
  expect(fetch).toHaveBeenCalledTimes(1);
});
