import { jest } from "@jest/globals";
import { LabClient } from "../src/activity/lab.client.js";
import { ActivityCache, activityCacheKey } from "../src/activity/activity.cache.js";

const subject = "a".repeat(32);
const period = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-22T00:00:00.000Z", interval: "day" as const };
const config = { baseUrl: "http://lab.test", apiKey: "clk_" + "a".repeat(64) };
const scope = { channelId: subject, channelIds: [], from: period.from, to: period.to, timeZone: "Asia/Seoul", dataScope: "collected" };
const data = (image: string | null = null) => ({ scope, totalChatCount: 10, channels: [{ channelId: "b".repeat(32), channelName: "방송", channelImageUrl: image, channelUrl: `https://chzzk.naver.com/${"b".repeat(32)}`, chatCount: 10, activeDays: 2, share: 1 }], trend: { interval: "day", points: [] }, patterns: [] });
const key = activityCacheKey("activities", subject, period, config.baseUrl);

afterEach(() => jest.restoreAllMocks());

it("null을 정상 응답으로 유지하며 2·4·8초 후 최대 세 번만 재검증한다", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  const cache = new ActivityCache({ host: undefined, port: 6379, password: undefined });
  const lab = new LabClient(config, cache);
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(data()));
  const first = await lab.get("activities", subject, period);
  expect(first).toMatchObject({ status: "ready", profileRefresh: { retryAt: 1_002_000 } });
  expect(JSON.stringify(first)).not.toContain("__profileRetry");
  for (const [at, calls, retryAt] of [[1_001_999, 1, 1_002_000], [1_002_000, 2, 1_006_000], [1_006_000, 3, 1_014_000], [1_014_000, 4, undefined], [1_299_999, 4, undefined]]) {
    now.mockReturnValue(at!);
    const result = await new LabClient(config, cache).get("activities", subject, period);
    expect(result.status).toBe("ready");
    expect(result.status === "ready" ? result.profileRefresh?.retryAt : null).toBe(retryAt);
    expect(fetch).toHaveBeenCalledTimes(calls!);
  }
  // 재검증으로 원래 5분 만료 시각이 연장되지 않는다.
  now.mockReturnValue(1_300_000);
  expect(await cache.get(key)).toBeUndefined();
});

it("이미지가 보충되면 대기 중인 요청을 합쳐 갱신하고 정상 5분 캐시로 돌아간다", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  const cache = new ActivityCache({ host: undefined, port: 6379, password: undefined });
  const lab = new LabClient(config, cache);
  let image: string | null = null;
  const fetch = jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(data(image)));
  await lab.get("activities", subject, period);
  image = "https://example.test/profile.png";
  now.mockReturnValue(1_002_000);
  const results = await Promise.all([lab.get("activities", subject, period), lab.get("activities", subject, period)]);
  for (const result of results) {
    expect(result).toMatchObject({ status: "ready", data: { channels: [{ channelImageUrl: image }] } });
    expect(result).not.toHaveProperty("profileRefresh");
  }
  now.mockReturnValue(1_301_999);
  await lab.get("activities", subject, period);
  expect(fetch).toHaveBeenCalledTimes(2);
  now.mockReturnValue(1_302_000);
  expect(await cache.get(key)).toBeUndefined();
});

it("재검증 실패에도 기존 데이터를 유지하고 429의 대기 시간을 따른다", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  const lab = new LabClient(config, new ActivityCache({ host: undefined, port: 6379, password: undefined }));
  const fetch = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(data()))
    .mockResolvedValueOnce(new Response("unavailable", { status: 429, headers: { "Retry-After": "30" } }))
    .mockResolvedValue(new Response("unavailable", { status: 503 }));
  await lab.get("activities", subject, period);
  now.mockReturnValue(1_002_000);
  expect(await lab.get("activities", subject, period)).toMatchObject({ status: "ready", data: { totalChatCount: 10 }, profileRefresh: { retryAt: 1_032_000 } });
  now.mockReturnValue(1_006_000);
  await lab.get("activities", subject, period);
  expect(fetch).toHaveBeenCalledTimes(2);
  now.mockReturnValue(1_032_000);
  expect(await lab.get("activities", subject, period)).toMatchObject({ status: "ready", data: { totalChatCount: 10 }, profileRefresh: { retryAt: 1_040_000 } });
});
