import "reflect-metadata";
import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { DataSource } from "typeorm";
import { ActivityCache } from "../src/activity/activity.cache.js";
import { ActivityCacheConfig } from "../src/activity/activity.cache.config.js";
import { LabConfig } from "../src/activity/lab.config.js";
import { AuthConfig } from "../src/auth/auth.config.js";
import { AppModule } from "../src/app.module.js";
import { configureApp, isPublicCachePath } from "../src/app.js";
import { SessionLifecycle } from "../src/runtime/session.lifecycle.js";
import { cidrMatcher } from "../src/runtime/network.config.js";
import { ObservationsService, OBSERVATION_TTL_MS } from "../src/observations/observations.service.js";
import { observationData, observationDay } from "../src/observations/observations.validation.js";
import type { ObservationChannel } from "../src/observations/observations.types.js";

const now = Date.parse("2026-10-26T12:00:00Z");
const config = { baseUrl: "http://lab.test", apiKey: `clk_${"a".repeat(64)}` };
const metadata = (id: string): ObservationChannel => ({ channelId: id.repeat(32), channelName: "테스트 채널", channelImageUrl: "", channelUrl: `https://chzzk.naver.com/${id.repeat(32)}` });
function fixture(at = now, date = "2026-10-25") {
  const from = Date.parse(`${date}T00:00:00+09:00`);
  return {
    scope: { date, from: new Date(from).toISOString(), to: new Date(from + 86_400_000).toISOString(), timeZone: "Asia/Seoul", dataScope: "collected" },
    generatedAt: new Date(at).toISOString(),
    summary: { chatCount: 100, participantCount: 20, channelCount: 3 },
    dailyChatLeader: { channel: metadata("a"), chatCount: 50 },
    peakChatMinute: { channel: metadata("b"), chatCount: 10, from: new Date(from + 60_000).toISOString(), to: new Date(from + 120_000).toISOString() },
    peakChatHour: { chatCount: 30, from: new Date(from).toISOString(), to: new Date(from + 3_600_000).toISOString() },
  };
}
const memory = () => new ActivityCache({ host: undefined, port: 6379, password: undefined });
afterEach(() => jest.restoreAllMocks());

describe("daily observation validation", () => {
  it("resolves yesterday on both sides of KST midnight", () => {
    expect(observationDay(Date.parse("2026-10-26T14:59:59.999Z")).date).toBe("2026-10-25");
    expect(observationDay(Date.parse("2026-10-26T15:00:00Z")).date).toBe("2026-10-26");
  });
  it("projects only public fields and preserves empty or unknown images", () => {
    const raw = { ...fixture(), apiKey: "do-not-forward", participantIds: ["private"] };
    const data = observationData(raw, "2026-10-25", now);
    expect(data).not.toHaveProperty("apiKey");
    expect(data).not.toHaveProperty("participantIds");
    expect(data.dailyChatLeader?.channel.channelImageUrl).toBe("");
    raw.dailyChatLeader.channel.channelImageUrl = null;
    expect(observationData(raw, "2026-10-25", now).dailyChatLeader?.channel.channelImageUrl).toBeNull();
  });
  it.each(["scope", "count", "minute", "hour", "channel", "image", "future"])("rejects malformed %s", kind => {
    const raw = fixture();
    if (kind === "scope") raw.scope.date = "2026-10-24";
    if (kind === "count") raw.summary.chatCount = Number.MAX_SAFE_INTEGER + 1;
    if (kind === "minute") raw.peakChatMinute.to = raw.peakChatMinute.from;
    if (kind === "hour") raw.peakChatHour.from = "2026-10-25T00:01:00+09:00";
    if (kind === "channel") raw.dailyChatLeader.channel.channelUrl = "https://other.test/";
    if (kind === "image") raw.dailyChatLeader.channel.channelImageUrl = "https://secret@image.test/";
    if (kind === "future") raw.generatedAt = new Date(now + 61_000).toISOString();
    expect(() => observationData(raw, "2026-10-25", now)).toThrow();
  });
  it("distinguishes a verified empty day from missing winners", () => {
    const raw = { ...fixture(), summary: { chatCount: 0, participantCount: 0, channelCount: 0 }, dailyChatLeader: null, peakChatMinute: null, peakChatHour: null };
    expect(observationData(raw, "2026-10-25", now).dailyChatLeader).toBeNull();
    expect(() => observationData({ ...raw, summary: fixture().summary }, "2026-10-25", now)).toThrow();
  });
});

describe("daily observation response cache", () => {
  it("avoids Redis round trips on hot reads and shares results with another instance", async () => {
    jest.spyOn(Date, "now").mockReturnValue(now);
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(fixture()));
    const store = memory();
    const reads = jest.spyOn(store, "get");
    const first = new ObservationsService(config, store);
    await first.get();
    for (let i = 0; i < 20; i++) expect((await first.get()).cache).toBe("HIT");
    expect(reads).toHaveBeenCalledTimes(1);
    expect((await new ObservationsService(config, store).get()).cache).toBe("HIT");
    expect(reads).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("merges concurrent misses into one upstream request", async () => {
    jest.spyOn(Date, "now").mockReturnValue(now);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => { await gate; return Response.json(fixture()); });
    const service = new ObservationsService(config, memory());
    const pending = Array.from({ length: 40 }, () => service.get());
    await Promise.resolve();
    release();
    const results = await Promise.all(pending);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results.filter(r => r.cache === "MISS")).toHaveLength(1);
    expect(results.filter(r => r.cache === "COALESCED")).toHaveLength(39);
    expect((await service.get()).cache).toBe("HIT");
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("http://lab.test/internal/v1/observations/daily?date=2026-10-25");
    expect(options?.headers).toEqual({ Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" });
    expect(options?.redirect).toBe("error");
  });
  it("expires after five minutes without extending on reads", async () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(fixture(Date.now())));
    const service = new ObservationsService(config, memory());
    const first = await service.get();
    clock.mockReturnValue(now + OBSERVATION_TTL_MS - 1);
    expect((await service.get()).data.generatedAt).toBe(first.data.generatedAt);
    clock.mockReturnValue(now + OBSERVATION_TTL_MS);
    expect((await service.get()).cache).toBe("MISS");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not extend the Lab cache beyond one hour from generatedAt", async () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(fixture(now - 3_540_000)));
    const service = new ObservationsService(config, memory());
    await service.get();
    clock.mockReturnValue(now + 59_999);
    expect((await service.get()).cache).toBe("HIT");
    clock.mockReturnValue(now + 60_000);
    expect((await service.get()).cache).toBe("MISS");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("switches date and cache key at KST midnight", async () => {
    const midnight = Date.parse("2026-10-26T15:00:00Z");
    const clock = jest.spyOn(Date, "now").mockReturnValue(midnight - 1);
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const date = new URL(String(input)).searchParams.get("date")!;
      return Response.json(fixture(Date.now(), date));
    });
    const service = new ObservationsService(config, memory());
    expect((await service.get()).data.scope.date).toBe("2026-10-25");
    clock.mockReturnValue(midnight);
    expect((await service.get()).data.scope.date).toBe("2026-10-26");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("isolates upstream environments in the shared cache", async () => {
    jest.spyOn(Date, "now").mockReturnValue(now);
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(fixture()));
    const store = memory();
    await new ObservationsService(config, store).get();
    expect((await new ObservationsService({ ...config, baseUrl: "http://other.test" }, store).get()).cache).toBe("MISS");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["503", "429", "network", "invalid"])("never caches or exposes upstream failure: %s", async failure => {
    jest.spyOn(Date, "now").mockReturnValue(now);
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (failure === "network") throw new Error("private connection details");
      return failure === "invalid" ? Response.json({ private: "details" }) : new Response("private Lab response", { status: Number(failure) });
    });
    const service = new ObservationsService(config, memory());
    for (let i = 0; i < 2; i++) await expect(service.get()).rejects.toThrow("Observations unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not serve expired success during an upstream outage", async () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(fixture())).mockRejectedValue(new Error("offline"));
    const service = new ObservationsService(config, memory());
    await service.get();
    clock.mockReturnValue(now + OBSERVATION_TTL_MS);
    await expect(service.get()).rejects.toThrow("Observations unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("public observation HTTP boundary", () => {
  let app: NestExpressApplication;
  beforeEach(async () => {
    jest.spyOn(Date, "now").mockReturnValue(now);
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(fixture()));
    const auth = { clientId: "test", clientSecret: "test", redirectUri: "http://localhost:8180/auth/callback", successUrl: "http://localhost:5273/", sessionKey: "test-key-at-least-thirty-two-bytes-long", secureCookie: false, allowedPeer: cidrMatcher("127.0.0.1/32,::1/128"), allowedOrigins: ["http://localhost:5273"], sessionTtlMs: 86_400_000, sessionAbsoluteTtlMs: 86_400_000, sessionRotationMs: 3_600_000, stateTtlMs: 600_000 };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthConfig).useValue(auth)
      .overrideProvider(LabConfig).useValue(config)
      .overrideProvider(ActivityCacheConfig).useValue({ host: undefined, port: 6379, password: undefined })
      .overrideProvider(DataSource).useValue(null).compile();
    app = module.createNestApplication<NestExpressApplication>();
    await configureApp(app);
    await app.init();
  });
  afterEach(async () => { await app?.close(); });
  it("serves guest GET and HEAD routing variants without touching sessions", async () => {
    const maintain = jest.spyOn(app.get(SessionLifecycle), "maintain");
    for (const path of ["/api/observations/daily", "/API/OBSERVATIONS/DAILY", "/api/observations/daily/"]) {
      expect(isPublicCachePath({ method: "GET", path })).toBe(true);
      const r = await request(app.getHttpServer()).get(path).set("Cookie", "recap_session=expired").expect(200);
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(r.headers["set-cookie"]).toBeUndefined();
      expect(r.body.summary.chatCount).toBe(100);
      expect(r.body).not.toHaveProperty("apiKey");
    }
    await request(app.getHttpServer()).head("/api/observations/daily").expect(200);
    expect(maintain).not.toHaveBeenCalled();
    expect(isPublicCachePath({ method: "POST", path: "/api/observations/daily" })).toBe(false);
    expect(isPublicCachePath({ method: "GET", path: "/api/observations/daily/other" })).toBe(false);
  });
  it("rejects public query overrides and never caches errors", async () => {
    const r = await request(app.getHttpServer()).get("/api/observations/daily?date=2026-10-25").expect(400);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("private", { status: 503 }));
    const failed = await request(app.getHttpServer()).get("/api/observations/daily").expect(503);
    expect(failed.headers["cache-control"]).toBe("no-store");
    expect(failed.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(failed.body)).not.toContain("private");
  });
});
