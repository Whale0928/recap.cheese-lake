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
  sessionTtlMs: 43_200_000,
};

describe("CHZZK OAuth HTTP flow", () => {
  let app: NestExpressApplication;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let exchangeFailure: "http" | "api" | "network" | "malformed" | undefined;
  let profileFailure: boolean;
  let revokeFailure: boolean;
  let channelFailure: boolean;
  let noImage: boolean;

  beforeEach(async () => {
    exchangeFailure = undefined;
    profileFailure = false;
    revokeFailure = false;
    channelFailure = false;
    noImage = false;
    fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === "/auth/v1/token") {
        if (exchangeFailure === "network") throw new Error("secret-upstream-error");
        if (exchangeFailure === "http") return new Response("secret-upstream-error", { status: 401 });
        if (exchangeFailure === "api") return Response.json({ code: 401, message: "secret-upstream-error" });
        if (exchangeFailure === "malformed") return Response.json({ code: 200, content: { accessToken: "" } });
        return Response.json({ code: 200, content: { accessToken: "secret-access-token", refreshToken: "secret-refresh-token", tokenType: "Bearer", expiresIn: "86400" } });
      }
      if (path === "/open/v1/users/me") {
        return Response.json({ code: 200, content: profileFailure ? { ...user, channelId: "" } : user });
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
      .overrideProvider(AuthConfig).useValue(config).compile();
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
