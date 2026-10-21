import "reflect-metadata";
import { jest } from "@jest/globals";
import { BadGatewayException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import { AuthConfig } from "../src/auth/auth.config.js";
import { ChzzkClient } from "../src/auth/chzzk.client.js";
import { LabConfig } from "../src/activity/lab.config.js";

const channel = { channelId: "a".repeat(32), channelName: "개발 확인 계정", channelImageUrl: null, followerCount: 0, verifiedMark: false };
const config = { sessionKey: "test-session-key-with-at-least-32-bytes", successUrl: "http://localhost:8180/", secureCookie: false, allowedPeer: () => true, allowedOrigins: ["http://localhost:8180"], sessionTtlMs: 30 * 86400_000, sessionAbsoluteTtlMs: 90 * 86400_000, sessionRotationMs: 7 * 86400_000 };
describe("local development login", () => {
  let app: NestExpressApplication;
  let getChannel: ReturnType<typeof jest.fn<ChzzkClient["getChannel"]>>;
  const previousEnv = { node: process.env.NODE_ENV, local: process.env.RECAP_LOCAL_AUTH_ENABLED };
  async function setup(node = "development", enabled = "true") {
    process.env.NODE_ENV = node;
    process.env.RECAP_LOCAL_AUTH_ENABLED = enabled;
    getChannel = jest.fn<ChzzkClient["getChannel"]>().mockResolvedValue(channel);
    const module = await Test.createTestingModule({ imports: [AppModule.register()] })
      .overrideProvider(AuthConfig).useValue(config)
      .overrideProvider(ChzzkClient).useValue({ getChannel })
      .overrideProvider(LabConfig).useValue({ baseUrl: "http://lab.test" }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    app.use((req: import("express").Request, _res: import("express").Response, next: () => void) => {
      if (req.headers["x-test-remote"]) Object.defineProperty(req.socket, "remoteAddress", { configurable: true, value: req.headers["x-test-remote"] });
      next();
    });
    await configureApp(app); await app.init();
  }
  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
    if (previousEnv.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv.node;
    if (previousEnv.local === undefined) delete process.env.RECAP_LOCAL_AUTH_ENABLED; else process.env.RECAP_LOCAL_AUTH_ENABLED = previousEnv.local;
  });
  it.each([["production", "true"], ["test", "true"], ["development", "false"], ["development", ""]])("does not register bypass routes in %s with flag %s", async (node, flag) => {
    await setup(node, flag);
    await request(app.getHttpServer()).get("/_dev/login").expect(404);
    await request(app.getHttpServer()).post("/_dev/login").send({ channelId: channel.channelId }).expect(404);
    expect((await request(app.getHttpServer()).get("/api/session")).body).not.toHaveProperty("localLoginAvailable");
    expect(getChannel).not.toHaveBeenCalled();
  });
  it("renders a native form and exposes availability only for local requests", async () => {
    await setup();
    const r = await request(app.getHttpServer()).get("/_dev/login").expect(200);
    expect(r.text).toContain('name="channelId"');
    expect((await request(app.getHttpServer()).get("/api/session")).body.localLoginAvailable).toBe(true);
    expect((await request(app.getHttpServer()).get("/api/session").set("X-Test-Remote", "198.51.100.2")).body).not.toHaveProperty("localLoginAvailable");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["referrer-policy"]).toBe("same-origin");
    expect(r.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(getChannel).not.toHaveBeenCalled();
  });
  it("creates a normal session from the verified channel and supports logout", async () => {
    await setup(); const agent = request.agent(app.getHttpServer());
    const r = await agent.post("/_dev/login").set("Origin", config.successUrl.slice(0, -1)).type("form").send({ channelId: channel.channelId }).expect(303);
    expect(r.headers.location).toBe("/me/");
    expect(getChannel).toHaveBeenCalledWith(channel.channelId);
    expect(r.headers["set-cookie"][0]).toContain("HttpOnly");
    const session = await agent.get("/api/session").expect(200);
    expect(session.body.localLoginAvailable).toBe(true);
    expect(session.body.session.channelId).toBe(channel.channelId);
    expect(session.body.session.channelName).toBe(channel.channelName);
    await agent.get("/api/me/activity/summary").expect(200);
    await agent.post("/auth/logout").expect(200);
    expect((await agent.get("/api/session")).body).toEqual({ loggedIn: false, localLoginAvailable: true });
    await agent.get("/api/me/activity/summary").expect(401);
  });
  it("rejects external TCP peers and Host even with forged forwarding headers", async () => {
    await setup();
    await request(app.getHttpServer()).get("/_dev/login").set("X-Test-Remote", "198.51.100.2").set("X-Forwarded-For", "127.0.0.1").expect(404);
    await request(app.getHttpServer()).get("/_dev/login").set("Host", "example.org").set("X-Forwarded-Host", "localhost").expect(404);
    expect(getChannel).not.toHaveBeenCalled();
  });
  it.each([undefined, "https://example.org"])("rejects missing or foreign Origin: %s", async origin => {
    await setup(); const r = request(app.getHttpServer()).post("/_dev/login").send({ channelId: channel.channelId });
    if (origin) r.set("Origin", origin);
    await r.expect(origin ? 403 : 401);
    expect(getChannel).not.toHaveBeenCalled();
  });
  it.each([{ channelId: "../invalid" }, { channelId: "A".repeat(32) }, { channelId: channel.channelId, userId: "b".repeat(32) }])("rejects invalid subject input %j", async body => {
    await setup();
    await request(app.getHttpServer()).post("/_dev/login").set("Origin", "http://localhost:8180").send(body).expect(400);
    expect(getChannel).not.toHaveBeenCalled();
  });
  it("does not authenticate when the channel cannot be verified", async () => {
    await setup(); getChannel.mockRejectedValue(new BadGatewayException("upstream-private-error"));
    const agent = request.agent(app.getHttpServer());
    const r = await agent.post("/_dev/login").set("Origin", "http://localhost:8180").send({ channelId: channel.channelId }).expect(502);
    expect(r.text).not.toContain("upstream-private-error");
    expect((await agent.get("/api/session")).body.loggedIn).toBe(false);
  });
  it("invalidates local sessions when local authentication is disabled", async () => {
    await setup(); const agent = request.agent(app.getHttpServer());
    await agent.post("/_dev/login").set("Origin", "http://localhost:8180").send({ channelId: channel.channelId }).expect(303);
    jest.replaceProperty(config, "sessionRotationMs", 0);
    expect((await agent.get("/api/session")).body.loggedIn).toBe(true);
    process.env.RECAP_LOCAL_AUTH_ENABLED = "false";
    expect((await agent.get("/api/session")).body.loggedIn).toBe(false);
    await agent.get("/api/me/activity/summary").expect(401);
  });
});
