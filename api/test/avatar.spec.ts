import "reflect-metadata";
import { DataSource } from "typeorm";
import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import { AuthConfig } from "../src/auth/auth.config.js";
import { ChzzkClient } from "../src/auth/chzzk.client.js";
import { LabConfig } from "../src/activity/lab.config.js";
import { fetchAvatar } from "../src/activity/avatar.controller.js";

// 1×1 투명 PNG. 프로필 이미지 응답으로 쓴다.
const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const subject = "a".repeat(32);
const broadcast = "b".repeat(32);
const avatarUrl = "https://nng-phinf.pstatic.net/profile.png";
const record = { firstActiveDate: "2026-01-01", lastActiveDate: "2026-10-20", chatCount: 10, activeDays: 2, longestConsecutiveActiveDays: 2, mostActiveDay: { date: "2026-10-20", chatCount: 6 }, mostActiveMonth: { month: "2026-10", chatCount: 8 }, share: 0.5, totalUserChatCount: 20 };
const relationship = (channelImageUrl: string | null = avatarUrl) => ({
  channel: { channelId: broadcast, channelName: "방송", channelUrl: `https://chzzk.naver.com/${broadcast}`, channelImageUrl },
  relationship: record,
});

describe("avatar fetch", () => {
  afterEach(() => jest.restoreAllMocks());
  const respond = (body: Buffer, headers: Record<string, string>, status = 200) => jest.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(body), { status, headers }));
  it("returns a small PNG from the chzzk CDN with its type", async () => {
    const fetchImpl = respond(tinyPng, { "Content-Type": "image/png", "Content-Length": String(tinyPng.length) });
    const image = await fetchAvatar(avatarUrl, fetchImpl);
    expect(image?.type).toBe("image/png");
    expect(image?.data.equals(tinyPng)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(new URL(avatarUrl), expect.objectContaining({ redirect: "error" }));
  });
  it.each(["http://nng-phinf.pstatic.net/a.png", "https://example.org/a.png", "https://pstatic.net.evil.test/a.png", "https://user:pw@nng-phinf.pstatic.net/a.png", "not a url", null])("does not request %s", async url => {
    const fetchImpl = jest.fn<typeof fetch>();
    expect(await fetchAvatar(url, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("ignores non-image, oversized or failed responses", async () => {
    expect(await fetchAvatar(avatarUrl, respond(tinyPng, { "Content-Type": "image/webp" }))).toBeNull();
    expect(await fetchAvatar(avatarUrl, respond(tinyPng, { "Content-Type": "image/png", "Content-Length": String(3 * 1024 * 1024) }))).toBeNull();
    expect(await fetchAvatar(avatarUrl, respond(Buffer.alloc(2 * 1024 * 1024 + 1), { "Content-Type": "image/png" }))).toBeNull();
    expect(await fetchAvatar(avatarUrl, respond(tinyPng, { "Content-Type": "image/png" }, 404))).toBeNull();
    expect(await fetchAvatar(avatarUrl, jest.fn<typeof fetch>().mockRejectedValue(new Error("timeout")))).toBeNull();
  });
});

describe("GET /api/me/channels/:broadcastId/avatar", () => {
  let app: NestExpressApplication;
  const previousEnv = { node: process.env.NODE_ENV, local: process.env.RECAP_LOCAL_AUTH_ENABLED };
  const config = { sessionKey: "test-session-key-with-at-least-32-bytes", successUrl: "http://localhost:8180/", secureCookie: false, allowedPeer: () => true, allowedOrigins: ["http://localhost:8180"], sessionTtlMs: 30 * 86400_000, sessionAbsoluteTtlMs: 90 * 86400_000, sessionRotationMs: 7 * 86400_000 };
  const channel = { channelId: subject, channelName: "개발 확인 계정", channelImageUrl: null, followerCount: 0, verifiedMark: false };
  let labResponse: () => Response;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.RECAP_LOCAL_AUTH_ENABLED = "true";
    labResponse = () => Response.json(relationship());
    fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("http://lab.test/")) return labResponse();
      if (url === avatarUrl) return new Response(new Uint8Array(tinyPng), { headers: { "Content-Type": "image/png", "Content-Length": String(tinyPng.length) } });
      throw new Error(`unexpected fetch ${url}`);
    });
    const module = await Test.createTestingModule({ imports: [AppModule.register()] })
      .overrideProvider(DataSource).useValue(null)
      .overrideProvider(AuthConfig).useValue(config)
      .overrideProvider(ChzzkClient).useValue({ getChannel: jest.fn<ChzzkClient["getChannel"]>().mockResolvedValue(channel) })
      .overrideProvider(LabConfig).useValue({ baseUrl: "http://lab.test", apiKey: "clk_" + "a".repeat(64) }).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    await configureApp(app); await app.init();
  });
  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
    if (previousEnv.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv.node;
    if (previousEnv.local === undefined) delete process.env.RECAP_LOCAL_AUTH_ENABLED; else process.env.RECAP_LOCAL_AUTH_ENABLED = previousEnv.local;
  });
  async function login() {
    const agent = request.agent(app.getHttpServer());
    await agent.post("/_dev/login").set("Origin", "http://localhost:8180").type("form").send({ channelId: subject }).expect(303);
    return agent;
  }
  const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => { const chunks: Buffer[] = []; res.on("data", c => chunks.push(c)); res.on("end", () => done(null, Buffer.concat(chunks))); };
  it("requires a login", async () => {
    await request(app.getHttpServer()).get(`/api/me/channels/${broadcast}/avatar`).expect(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("relays the channel image bytes for the logged-in subject", async () => {
    const agent = await login();
    const r = await agent.get(`/api/me/channels/${broadcast}/avatar`).buffer(true).parse(binary).expect(200);
    expect(r.headers["content-type"]).toBe("image/png");
    expect(r.headers["cache-control"]).toBe("private, max-age=300");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect((r.body as Buffer).equals(tinyPng)).toBe(true);
    const urls = fetchMock.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input));
    expect(urls).toContain(`http://lab.test/internal/v1/channels/${subject}/relationships/${broadcast}`);
    expect(urls).toContain(avatarUrl);
  });
  it.each([`/api/me/channels/${"z".repeat(32)}/avatar`, `/api/me/channels/${broadcast}/avatar?userId=${subject}`])("rejects %s", async path => {
    const agent = await login();
    await agent.get(path).expect(400);
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith("http://lab.test/"))).toBe(false);
  });
  it("answers 404 when the channel has no usable image", async () => {
    const agent = await login();
    labResponse = () => Response.json(relationship(null));
    await agent.get(`/api/me/channels/${broadcast}/avatar`).expect(404);
    expect(fetchMock.mock.calls.some(([input]) => String(input) === avatarUrl)).toBe(false);
  });
  it("answers 503 with Retry-After when the record is unavailable", async () => {
    const agent = await login();
    labResponse = () => new Response("busy", { status: 429, headers: { "Retry-After": "30" } });
    const r = await agent.get(`/api/me/channels/${broadcast}/avatar`).expect(503);
    expect(r.headers["retry-after"]).toBe("30");
  });
});
