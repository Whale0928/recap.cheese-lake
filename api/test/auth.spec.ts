import { LabConfig } from "../src/activity/lab.config.js";
import { SessionStore } from "../src/runtime/session.store.js";
import type { SessionData } from "express-session";
import { jest } from "@jest/globals";
import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import { cidrMatcher } from "../src/runtime/network.config.js";
import { AuthConfig } from "../src/auth/auth.config.js";

const user = { channelId: "a".repeat(32), channelName: "테스트 사용자" };
const config = {
  clientId: "test-client",
  clientSecret: "test-client-secret",
  redirectUri: "http://localhost:8180/auth/callback",
  successUrl: "http://localhost:8180/",
  sessionKey: "test-session-key-with-at-least-32-bytes",
  secureCookie: false,
  allowedPeer: cidrMatcher("127.0.0.1/32,::1/128"),
  allowedOrigins: ["http://localhost:8180", "http://localhost:5273"],
  stateTtlMs: 600_000,
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  sessionAbsoluteTtlMs: 90 * 24 * 60 * 60 * 1000,
  sessionRotationMs: 7 * 24 * 60 * 60 * 1000,
};

describe("CHZZK OAuth HTTP flow", () => {
  let app: NestExpressApplication;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let exchangeFailure: "http" | "api" | "network" | "malformed" | undefined;
  let profileFailure: boolean;
  let revokeFailure: boolean;
  let channelFailure: boolean;
  let noImage: boolean;
  let labFailure: string | undefined;
  let labRateLimited: boolean;
  let labWrongSubject: boolean;
  let authenticatedUser: typeof user;

  beforeEach(async () => {
    exchangeFailure = undefined;
    profileFailure = false;
    revokeFailure = false;
    channelFailure = false;
    noImage = false;
    labFailure = undefined;
    labRateLimited = false;
    labWrongSubject = false;
    authenticatedUser = user;
    fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname;
      if (url.hostname === "lab.test") {
        const kind = path.split("/").at(-1);
        if (labRateLimited) return new Response("secret-lab-upstream", { status: 429, headers: { "Retry-After": "3" } });
        if (kind === labFailure) return new Response("secret-lab-upstream", { status: 503 });
        const subject = path.split("/")[4];
        const scope = { channelId: labWrongSubject ? "b".repeat(32) : subject, channelIds: [], from: url.searchParams.get("from"), to: url.searchParams.get("to"), timeZone: "Asia/Seoul", dataScope: "collected" };
        const counts = { chatCount: 1234, activeDays: 3, channelCount: 1 };
        if (kind === "summary") return Response.json({ scope, ...counts });
        if (kind === "channels") return Response.json({ scope, totalChatCount: 1234, channels: [{ channelId: "c".repeat(32), channelName: "테스트 방송", channelUrl: `https://chzzk.naver.com/${"c".repeat(32)}`, channelImageUrl: "https://nng-phinf.pstatic.net/channel.png", chatCount: 1234, activeDays: 3, share: 1 }] });
        if (kind === "trend") return Response.json({ scope, interval: url.searchParams.get("interval"), points: [{ from: scope.from, to: scope.to, ...counts }] });
        if (kind === "patterns") return Response.json({ scope, patterns: [{ weekday: 1, hour: 23, chatCount: 1234 }] });
      }
      if (path === "/auth/v1/token") {
        if (exchangeFailure === "network") throw new Error("secret-upstream-error");
        if (exchangeFailure === "http") return new Response("secret-upstream-error", { status: 401 });
        if (exchangeFailure === "api") return Response.json({ code: 401, message: "secret-upstream-error" });
        if (exchangeFailure === "malformed") return Response.json({ code: 200, content: { accessToken: "" } });
        return Response.json({ code: 200, content: { accessToken: "secret-access-token", refreshToken: "secret-refresh-token", tokenType: "Bearer", expiresIn: "86400" } });
      }
      if (path === "/open/v1/users/me") {
        return Response.json({ code: 200, content: profileFailure ? { ...user, channelId: "" } : authenticatedUser });
      }
      if (path === "/open/v1/channels") {
        return Response.json({ code: 200, content: { data: channelFailure ? [{ ...user, channelId: "b".repeat(32) }] : [{ ...user, channelImageUrl: noImage ? null : "https://nng-phinf.pstatic.net/test.png", followerCount: 0, verifiedMark: false }] } });
      }
      if (path === "/auth/v1/token/revoke") {
        return Response.json({ code: revokeFailure ? 503 : 200, content: null });
      }
      throw new Error(`Unexpected test request: ${path}`);
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthConfig).useValue(config)
      .overrideProvider(LabConfig).useValue({ baseUrl: "http://lab.test", apiKey: "clk_" + "a".repeat(64) }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    await configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  async function beginLogin() {
    const agent = request.agent(app.getHttpServer());
    const response = await agent.get("/auth/login").expect(302);
    const state = new URL(response.headers.location as string).searchParams.get("state")!;
    return { agent, state, cookie: response.headers["set-cookie"] };
  }

  it("redirects to the official authorization endpoint with a browser-bound state", async () => {
    const { agent, state, cookie } = await beginLogin();
    const response = await agent.get("/auth/login").expect(302);
    const location = new URL(response.headers.location as string);
    expect(location.origin + location.pathname).toBe("https://chzzk.naver.com/account-interlock");
    expect(location.searchParams.get("clientId")).toBe(config.clientId);
    expect(location.searchParams.get("redirectUri")).toBe(config.redirectUri);
    expect(location.searchParams.get("state")).toMatch(/^[0-9a-f]{64}$/);
    expect(location.searchParams.get("state")).not.toBe(state);
    expect(String(cookie)).toContain("HttpOnly");
    expect(String(cookie)).toContain("SameSite=Lax");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges code, verifies identity, revokes tokens and rotates the session ID", async () => {
    const { agent, state, cookie } = await beginLogin();
    const callback = await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    expect(callback.headers.location).toBe(config.successUrl);
    expect(callback.headers["set-cookie"]).not.toEqual(cookie);
    expect(callback.headers["referrer-policy"]).toBe("no-referrer");
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/auth/v1/token", "/open/v1/users/me", "/auth/v1/token/revoke",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      grantType: "authorization_code", clientId: config.clientId, clientSecret: config.clientSecret, code: "test-code", state,
    });
    expect(fetchMock.mock.calls[1][1]!.headers).toEqual(expect.objectContaining({ Authorization: "Bearer secret-access-token" }));
    expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string)).toEqual({
      clientId: config.clientId, clientSecret: config.clientSecret, token: "secret-access-token", tokenTypeHint: "access_token",
    });
    const session = await agent.get("/api/session").expect(200);
    expect(session.body).toEqual({ loggedIn: true, session: { ...user, expiresAt: expect.any(String) } });
    expect(session.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(session.body)).not.toMatch(/secret-|accessToken|refreshToken|lastLogin|clientSecret/);
    expect(JSON.stringify(callback.headers)).not.toContain("secret-access-token");
  });

  it("requires login before querying profile data", async () => {
    await request(app.getHttpServer()).get("/api/me").expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries only the signed-in identity using server-side Client authentication", async () => {
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    const response = await agent.get("/api/me").query({ channelId: "b".repeat(32) }).expect(200);
    expect(response.body).toEqual({ identity: user, fetchedAt: expect.any(String), chzzk: { status: "ready", data: { ...user, channelImageUrl: "https://nng-phinf.pstatic.net/test.png", followerCount: 0, verifiedMark: false } } });
    const [url, options] = fetchMock.mock.calls.at(-1)!;
    expect(new URL(String(url)).searchParams.get("channelIds")).toBe(user.channelId);
    expect(options!.headers).toEqual(expect.objectContaining({ "Client-Id": config.clientId, "Client-Secret": config.clientSecret }));
    expect(options!.headers).not.toHaveProperty("Authorization");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(response.body)).not.toMatch(/secret-|accessToken|refreshToken|clientSecret/);
    await request(app.getHttpServer()).get("/api/me").expect(401);
  });

  it("keeps the verified identity when channel data does not match", async () => {
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    channelFailure = true;
    const response = await agent.get("/api/me").expect(200);
    expect(response.body.identity).toEqual(user);
    expect(response.body.chzzk.status).toBe("unavailable");
    expect(response.body.chzzk).not.toHaveProperty("data");
  });

  it("accepts an unregistered image and zero followers without treating them as failure", async () => {
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    noImage = true;
    const response = await agent.get("/api/me").expect(200);
    expect(response.body.chzzk.data.channelImageUrl).toBeNull();
    expect(response.body.chzzk.data.followerCount).toBe(0);
    expect(response.body.chzzk.data.verifiedMark).toBe(false);
  });

  it("rejects expired sessions without calling the channel API", async () => {
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    const clock = jest.spyOn(Date, "now").mockReturnValue(Date.now() + config.sessionTtlMs);
    fetchMock.mockClear();
    await agent.get("/api/me").expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
    clock.mockRestore();
  });

  it("persists the cookie for 30 days and renews it when the user returns", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const { agent, state } = await beginLogin();
    const callback = await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    const cookie = String(callback.headers["set-cookie"]);
    const expiry = /Expires=([^;]+)/.exec(cookie)![1];
    expect(Math.abs(new Date(expiry).getTime() - (now + config.sessionTtlMs))).toBeLessThan(2_000);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    clock.mockReturnValue(now + 2 * 86_400_000);
    fetchMock.mockClear();
    const response = await agent.get("/api/session").expect(200);
    expect(response.body.session.expiresAt).toBe(new Date(now + 32 * 86_400_000).toISOString());
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rotates the identifier after seven days and invalidates the copied old cookie", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const { agent, state } = await beginLogin();
    const callback = await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    const oldCookie = (callback.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    const sid = decodeURIComponent(oldCookie.split("=")[1]).slice(2).split(".")[0];
    const store = app.get(SessionStore).store;
    const stale = await new Promise<SessionData>((resolve, reject) => store.get(sid, (error, data) => error ? reject(error) : data ? resolve(JSON.parse(JSON.stringify(data)) as SessionData) : reject(new Error("Missing test session"))));
    clock.mockReturnValue(now + config.sessionRotationMs - 1);
    const before = await agent.get("/api/session").expect(200);
    expect((before.headers["set-cookie"] as unknown as string[])[0].split(";")[0]).toBe(oldCookie);
    clock.mockReturnValue(now + config.sessionRotationMs);
    fetchMock.mockClear();
    const rotated = await agent.get("/api/session").expect(200);
    expect((rotated.headers["set-cookie"] as unknown as string[])[0].split(";")[0]).not.toBe(oldCookie);
    expect(rotated.body.session.channelId).toBe(user.channelId);
    await request(app.getHttpServer()).get("/api/session").set("Cookie", oldCookie).expect(200, { loggedIn: false });
    await new Promise<void>((resolve, reject) => store.set(sid, stale, (error) => error ? reject(error) : resolve()));
    await request(app.getHttpServer()).get("/api/session").set("Cookie", oldCookie).expect(200, { loggedIn: false });
    expect(fetchMock).not.toHaveBeenCalled();
    await agent.post("/auth/logout").expect(200);
    const newCookie = (rotated.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    await request(app.getHttpServer()).get("/api/session").set("Cookie", newCookie).expect(200, { loggedIn: false });
  });

  it("does not extend the original 90-day limit across renewal and identifier rotation", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    for (const days of [20, 40, 60, 80, 89]) {
      clock.mockReturnValue(now + days * 86_400_000);
      const response = await agent.get("/api/session").expect(200);
      expect(response.body.loggedIn).toBe(true);
      expect(new Date(response.body.session.expiresAt).getTime()).toBe(Math.min(now + (days + 30) * 86_400_000, now + config.sessionAbsoluteTtlMs));
    }
    clock.mockReturnValue(now + config.sessionAbsoluteTtlMs);
    fetchMock.mockClear();
    await agent.get("/api/session").expect(200, { loggedIn: false });
    await agent.get("/api/me").expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not issue an old cookie from a parallel profile response", async () => {
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    const response = await agent.get("/api/me").expect(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("issues only one replacement cookie for concurrent rotation requests", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const { agent, state } = await beginLogin();
    const callback = await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    const oldCookie = (callback.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    clock.mockReturnValue(now + config.sessionRotationMs);
    const responses = await Promise.all([1, 2].map(() => request(app.getHttpServer()).get("/api/session").set("Cookie", oldCookie)));
    expect(responses.every(r => r.status === 200)).toBe(true);
    const replacements = responses.filter(r => r.headers["set-cookie"]);
    expect(replacements).toHaveLength(1);
    const cookie = (replacements[0].headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    const response = await request(app.getHttpServer()).get("/api/session").set("Cookie", cookie).expect(200);
    expect(response.body.loggedIn).toBe(true);
  });

  async function signedIn() {
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    fetchMock.mockClear();
    return agent;
  }

  it("does not call Lab for unauthenticated activity requests", async () => {
    await request(app.getHttpServer()).get("/api/me/activity/summary").expect(401);
    await request(app.getHttpServer()).get("/api/me/activity/trend").expect(401);
    await request(app.getHttpServer()).get("/api/recap").expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses only the authenticated subject and a server-side API Key for all four activity calls", async () => {
    const agent = await signedIn();
    const r = await agent.get("/api/recap").query({ from: "2026-10-01", to: "2026-10-21", interval: "week" }).set("X-Channel-Id", "b".repeat(32)).expect(200);
    expect([r.body.summary.status, r.body.channels.status, r.body.trend.status, r.body.patterns.status]).toEqual(["ready", "ready", "ready", "ready"]);
    expect(r.body.channels.data.channels[0]).toEqual({ channelId: "c".repeat(32), channelName: "테스트 방송", channelUrl: `https://chzzk.naver.com/${"c".repeat(32)}`, channelImageUrl: "https://nng-phinf.pstatic.net/channel.png", chatCount: 1234, activeDays: 3, share: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [input, options] of fetchMock.mock.calls) {
      const url = new URL(String(input));
      expect(url.pathname).toMatch(new RegExp(`^/internal/v1/channels/${user.channelId}/activities/(summary|channels|trend|patterns)$`));
      expect(url.searchParams.get("from")).toBe("2026-09-30T15:00:00.000Z");
      expect(url.searchParams.get("to")).toBe("2026-10-21T15:00:00.000Z");
      expect(options!.headers).toEqual(expect.objectContaining({ Authorization: "Bearer clk_" + "a".repeat(64) }));
      expect(options!.redirect).toBe("error");
    }
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(r.body)).not.toMatch(/clk_|secret-|apiKey/);
  });

  it.each(["channelId", "userId", "channelIds", "url"])("rejects caller-supplied subject or upstream overrides: %s", async (field) => {
    const agent = await signedIn();
    await agent.get("/api/recap").query({ [field]: "../../another-user" }).expect(400);
    await agent.get("/api/me/activity/summary").query({ [field]: "b".repeat(32) }).expect(400);
    await agent.get("/api/me/activity/trend").query({ [field]: "b".repeat(32) }).expect(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ from: "2026-02-30" }, { to: "2026-10-21T00:00:00Z" }, { from: "2026-10-22", to: "2026-10-21" }, { from: "2024-01-01", to: "2026-01-01" }, { interval: "year" }])("rejects invalid dates and intervals before calling Lab: %j", async (query) => {
    const agent = await signedIn();
    await agent.get("/api/recap").query(query).expect(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns only daily activity for the authenticated user's yearly calendar and reuses requests", async () => {
    const agent = await signedIn();
    const query = { from: "2025-10-22", to: "2026-10-21" };
    const r = await agent.get("/api/me/activity/trend").query(query).expect(200);
    expect(r.body.trend.status).toBe("ready");
    expect(r.body.trend.data.interval).toBe("day");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe(`/internal/v1/channels/${user.channelId}/activities/trend`);
    expect(url.searchParams.get("interval")).toBe("day");
    await agent.get("/api/me/activity/trend").query(query).expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await agent.get("/api/me/activity/trend").query({ interval: "month" }).expect(400);
  });

  it("supports all collected history and calendar months with daily buckets", async () => {
    const agent = await signedIn();
    const all = await agent.get("/api/recap").query({ period: "all" }).expect(200);
    expect(all.body.period.from).toBe("1970-01-01T00:00:00.000Z");
    expect(all.body.trend.data.interval).toBe("day");
    const february = await agent.get("/api/recap").query({ month: "2024-02" }).expect(200);
    expect(february.body.period).toEqual({ from: "2024-01-31T15:00:00.000Z", to: "2024-02-29T15:00:00.000Z", interval: "day" });
    for (const query of [{ period: "all", userId: "b".repeat(32) }, { month: "2024-13" }, { month: "2099-01" }, { month: "2024-02", interval: "week" }, { period: "unknown" }]) {
      await agent.get("/api/recap").query(query).expect(400);
    }
  });

  it("returns all-history summary for my info and reuses it for all-history recap", async () => {
    const agent = await signedIn();
    const summary = await agent.get("/api/me/activity/summary").query({ period: "all" }).expect(200);
    expect(summary.body.period.from).toBe("1970-01-01T00:00:00.000Z");
    expect(summary.body.summary.data.scope.from).toBe(summary.body.period.from);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("from")).toBe(summary.body.period.from);
    await agent.get("/api/recap").query({ period: "all" }).expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await agent.get("/api/me/activity/summary").query({ period: "all", channelId: "b".repeat(32) }).expect(400);
  });

  it("fetches only summary for my info and reuses it without mixing user caches", async () => {
    const first = await signedIn();
    const summary = await first.get("/api/me/activity/summary").expect(200);
    expect(summary.body.summary.status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await first.get("/api/recap").expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    authenticatedUser = { channelId: "b".repeat(32), channelName: "다른 사용자" };
    const second = await signedIn();
    const other = await second.get("/api/me/activity/summary").expect(200);
    expect(other.body.summary.data.scope.channelId).toBe(authenticatedUser.channelId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await first.post("/auth/logout").expect(200);
    fetchMock.mockClear();
    await first.get("/api/recap").expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent activity requests for the same subject and period", async () => {
    const agent = await signedIn();
    await Promise.all([agent.get("/api/recap").expect(200), agent.get("/api/recap").expect(200)]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("shows an unconfigured integration without calling Lab", async () => {
    const agent = await signedIn();
    jest.replaceProperty(app.get(LabConfig), "apiKey", undefined);
    const r = await agent.get("/api/me/activity/summary").expect(200);
    expect(r.body.summary).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps successful sections when one Lab endpoint is unavailable", async () => {
    const agent = await signedIn();
    labFailure = "trend";
    const r = await agent.get("/api/recap").expect(200);
    expect(r.body.trend).toEqual({ status: "unavailable", reason: "upstream" });
    expect(r.body.summary.status).toBe("ready");
    expect(r.body.channels.status).toBe("ready");
    expect(r.body.patterns.status).toBe("ready");
    expect(JSON.stringify(r.body)).not.toContain("secret-");
  });

  it("does not forward a mismatched subject from Lab", async () => {
    const agent = await signedIn();
    labWrongSubject = true;
    const r = await agent.get("/api/me/activity/summary").expect(200);
    expect(r.body.summary).toEqual({ status: "unavailable", reason: "upstream" });
    expect(r.body.summary).not.toHaveProperty("data");
  });

  it("preserves rate-limit feedback and does not immediately repeat rejected calls", async () => {
    const agent = await signedIn();
    labRateLimited = true;
    const r = await agent.get("/api/me/activity/summary").expect(200);
    expect(r.body.summary).toEqual({ status: "unavailable", reason: "rate_limited", retryAfterSeconds: 3 });
    await agent.get("/api/me/activity/summary").expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not share another browser's login result", async () => {
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    await request(app.getHttpServer()).get("/api/session").expect(200, { loggedIn: false });
  });

  it.each([undefined, "wrong-state"])("rejects missing or mismatched state (%s) before calling CHZZK", async (state) => {
    const { agent } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", ...(state ? { state } : {}) }).expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
    await agent.get("/api/session").expect(200, { loggedIn: false });
  });

  it("rejects a callback without the browser's session", async () => {
    const { state } = await beginLogin();
    await request(app.getHttpServer()).get("/auth/callback").query({ code: "test-code", state }).expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a state at its expiry boundary", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const { agent, state } = await beginLogin();
    clock.mockReturnValue(now + config.stateTtlMs);
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ error: "access_denied" }, {}])("rejects cancellation or missing code and consumes state (%j)", async (query) => {
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ ...query, state }).expect(400);
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not reuse a completed OAuth state", async () => {
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("allows only one of two concurrent callbacks using the same session and state", async () => {
    const { state, cookie } = await beginLogin();
    const sessionCookie = (cookie as unknown as string[])[0].split(";")[0];
    const responses = await Promise.all([1, 2].map(() => request(app.getHttpServer())
      .get("/auth/callback").set("Cookie", sessionCookie).query({ code: "test-code", state })));
    expect(responses.map((response) => response.status).sort()).toEqual([302, 401]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["http", "api", "network", "malformed"] as const)("rejects token exchange failures without leaking upstream content (%s)", async (failure) => {
    exchangeFailure = failure;
    const { agent, state } = await beginLogin();
    const response = await agent.get("/auth/callback").query({ code: "test-code", state }).expect(502);
    expect(JSON.stringify(response.body)).not.toContain("secret-");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await agent.get("/api/session").expect(200, { loggedIn: false });
  });

  it("revokes tokens even when identity verification fails", async () => {
    profileFailure = true;
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(502);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await agent.get("/api/session").expect(200, { loggedIn: false });
  });

  it("does not issue a session when revocation fails", async () => {
    revokeFailure = true;
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(502);
    await agent.get("/api/session").expect(200, { loggedIn: false });
  });

  it("rejects an expired authenticated session", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    clock.mockReturnValue(now + config.sessionTtlMs);
    await agent.get("/api/session").expect(200, { loggedIn: false });
  });

  it("destroys the server session so a copied cookie cannot be reused after logout", async () => {
    const { agent, state } = await beginLogin();
    const callback = await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    const oldCookie = (callback.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    await agent.post("/auth/logout").expect(200, { loggedIn: false });
    await request(app.getHttpServer()).get("/api/session").set("Cookie", oldCookie).expect(200, { loggedIn: false });
  });

  it("rejects a stale request restoring session data after logout", async () => {
    const { agent, state } = await beginLogin();
    const callback = await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    const cookie = (callback.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    const sid = decodeURIComponent(cookie.split("=")[1]).slice(2).split(".")[0];
    const store = app.get(SessionStore).store;
    const stale = await new Promise<SessionData>((resolve, reject) => store.get(sid, (error, data) => error ? reject(error) : data ? resolve(JSON.parse(JSON.stringify(data)) as SessionData) : reject(new Error("Missing test session"))));
    await agent.post("/auth/logout").expect(200);
    await new Promise<void>((resolve, reject) => store.set(sid, stale, (error) => error ? reject(error) : resolve()));
    await request(app.getHttpServer()).get("/api/session").set("Cookie", cookie).expect(200, { loggedIn: false });
    await request(app.getHttpServer()).get("/api/me").set("Cookie", cookie).expect(401);
  });

  it("rejects cross-origin logout", async () => {
    const { agent, state } = await beginLogin();
    await agent.get("/auth/callback").query({ code: "test-code", state }).expect(302);
    await agent.post("/auth/logout").set("Origin", "https://another.example").expect(403);
    const response = await agent.get("/api/session").expect(200);
    expect(response.body.loggedIn).toBe(true);
  });

  it("allows credentialed preflight only for configured origins", async () => {
    const response = await request(app.getHttpServer()).options("/api/me").set("Origin", config.successUrl.slice(0, -1)).set("Access-Control-Request-Method", "GET").expect(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:8180");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    const denied = await request(app.getHttpServer()).options("/api/me").set("Origin", "https://untrusted.example").set("Access-Control-Request-Method", "GET").expect(403);
    expect(denied.headers).not.toHaveProperty("access-control-allow-origin");
  });

  it("exposes probes without creating a session", async () => {
    const response = await request(app.getHttpServer()).get("/healthz").expect(200, "ok");
    expect(response.headers).not.toHaveProperty("set-cookie");
    await request(app.getHttpServer()).get("/readyz").expect(200, "ok");
  });

  it("removes the prototype's unrelated API endpoints", async () => {
    await request(app.getHttpServer()).get("/api/lives").expect(404);
  });
});

describe("AuthConfig", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test", RECAP_CHZZK_CLIENT_ID: "client", RECAP_CHZZK_CLIENT_SECRET: "secret", RECAP_SESSION_KEY: "x".repeat(32) };
  });
  afterEach(() => { process.env = originalEnv; });

  it.each(["RECAP_CHZZK_CLIENT_ID", "RECAP_CHZZK_CLIENT_SECRET", "RECAP_SESSION_KEY"])("requires %s without revealing environment values", (name) => {
    delete process.env[name];
    expect(() => new AuthConfig()).toThrow(`Missing environment variable: ${name}`);
  });
  it("rejects short session signing keys", () => {
    process.env.RECAP_SESSION_KEY = "short";
    expect(() => new AuthConfig()).toThrow("at least 32 bytes");
  });
  it("disables the local MemoryStore in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => new AuthConfig()).toThrow("shared session store");
  });
});
