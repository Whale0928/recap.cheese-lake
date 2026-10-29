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
import { configureApp } from "../src/app.js";
import { cidrMatcher } from "../src/runtime/network.config.js";
import { TraitsService } from "../src/traits/traits.service.js";
import { traitsData } from "../src/traits/traits.validation.js";

const subject = "a".repeat(32);
const config = { baseUrl: "http://lab.test", apiKey: `clk_${"a".repeat(64)}` };
function fixture(channelId = subject) {
  return {
    scope: { channelId, asOf: "2026-10-29T22:30:00+09:00", timeZone: "Asia/Seoul", dataScope: "collected", rulesetVersion: "2026.10.29" },
    eligibility: { chatCount: 4821, evaluable: true, styleSampled: true, liveMetaAvailable: true },
    traits: [{ key: "weekend", axis: "weekday", prevalence: 0.124, score: 1.02, evidence: { weekendShare: 0.81, activeWeeks: 23 } },
      { key: "same_day_multi", axis: null, prevalence: 0.24, score: 0.6, evidence: { multiChannelDayShare: 0.4 } }],
    states: [{ key: "trend_surge", axis: "trend", prevalence: 0.228, score: 0.7, evidence: { ratio: 3 } }],
    memes: [{ key: "heok", count: 87, native: true }],
    gaps: ["style_recent_window", "live_meta_since_2026-08-28"],
  };
}
const memory = () => new ActivityCache({ host: undefined, port: 6379, password: undefined });
afterEach(() => jest.restoreAllMocks());

describe("traits validation", () => {
  it("projects only known fields", () => {
    const data = traitsData({ ...fixture(), apiKey: "do-not-forward", traits: [{ ...fixture().traits[0], body: "원문" }] }, subject);
    expect(data).not.toHaveProperty("apiKey");
    expect(data.traits[0]).not.toHaveProperty("body");
    expect(data.traits[0]!.evidence.weekendShare).toBe(0.81);
    expect(data.memes).toEqual([{ key: "heok", count: 87, native: true }]);
  });
  it.each(["subject", "zone", "prevalence", "evidence", "meme", "gap", "unevaluated"])("rejects malformed %s", kind => {
    const raw = fixture() as ReturnType<typeof fixture> & Record<string, unknown>;
    if (kind === "subject") raw.scope.channelId = "b".repeat(32);
    if (kind === "zone") (raw.scope as Record<string, unknown>).timeZone = "UTC";
    if (kind === "prevalence") raw.traits[0]!.prevalence = 1.5;
    if (kind === "evidence") (raw.traits[0]!.evidence as Record<string, unknown>).weekendShare = "81%";
    if (kind === "meme") raw.memes[0]!.count = 0;
    if (kind === "gap") raw.gaps.push("<script>");
    if (kind === "unevaluated") raw.eligibility.evaluable = false;
    expect(() => traitsData(raw, subject)).toThrow();
  });
});

describe("traits service", () => {
  it("calls the subject path and shares the validated response", async () => {
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(fixture()));
    const store = memory();
    const first = await new TraitsService(config, store).get(subject);
    expect(first.status).toBe("ready");
    expect((await new TraitsService(config, store).get(subject)).status).toBe("ready");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(`http://lab.test/internal/v1/channels/${subject}/traits`);
    expect(options?.headers).toEqual({ Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" });
    expect(options?.redirect).toBe("error");
  });
  it("merges concurrent misses into one upstream request", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => { await gate; return Response.json(fixture()); });
    const service = new TraitsService(config, memory());
    const pending = Array.from({ length: 20 }, () => service.get(subject));
    await Promise.resolve();
    release();
    expect((await Promise.all(pending)).every(r => r.status === "ready")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reports overload with retry time and never caches failures", async () => {
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("busy", { status: 503, headers: { "Retry-After": "2" } }));
    const service = new TraitsService(config, memory());
    expect(await service.get(subject)).toEqual({ status: "unavailable", reason: "rate_limited", retryAfterSeconds: 2 });
    fetcher.mockImplementation(async () => Response.json({ private: "details" }));
    expect(await service.get(subject)).toEqual({ status: "unavailable", reason: "upstream" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not call Lab without a key", async () => {
    const fetcher = jest.spyOn(globalThis, "fetch");
    expect(await new TraitsService({ ...config, apiKey: undefined }, memory()).get(subject)).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("traits HTTP boundary", () => {
  let app: NestExpressApplication;
  beforeEach(async () => {
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
  it("requires a login and never reaches Lab for guests", async () => {
    await request(app.getHttpServer()).get("/api/me/traits").expect(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
