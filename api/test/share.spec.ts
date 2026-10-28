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
import { storableImage } from "../src/database/chzzk-account.store.js";
import { ShareStore } from "../src/shares/share.store.js";

const owner = "a".repeat(32);
const streamer = "b".repeat(32);
const consentedAt = new Date("2026-10-27T03:00:00Z");
const record = { firstActiveDate: "2026-01-01", lastActiveDate: "2026-10-20", chatCount: 10, activeDays: 2, longestConsecutiveActiveDays: 2, mostActiveDay: { date: "2026-10-20", chatCount: 6 }, mostActiveMonth: { month: "2026-10", chatCount: 8 }, share: 0.5, totalUserChatCount: 20 };
const relationship = { channel: { channelId: streamer, channelName: "방송", channelUrl: `https://chzzk.naver.com/${streamer}`, channelImageUrl: null }, relationship: record };
const trend = (from: string, to: string, interval: string) => ({ scope: { channelId: owner, channelIds: [streamer], from, to, timeZone: "Asia/Seoul", dataScope: "collected" }, interval, points: [] });

describe("channel record sharing", () => {
  let app: NestExpressApplication;
  let database: DataSource;
  let shares: { owner: string; recipient: string; consentedAt: Date }[];
  let restricted: string | null;
  let excluded: string | null;
  let existsQueryFails: boolean;
  let images: Record<string, string | null>;
  let profileImage: string | null | "fail";
  const previousEnv = { node: process.env.NODE_ENV, local: process.env.RECAP_LOCAL_AUTH_ENABLED };
  const config = { sessionKey: "test-session-key-with-at-least-32-bytes", successUrl: "http://localhost:8180/", secureCookie: false, allowedPeer: () => true, allowedOrigins: ["http://localhost:8180"], sessionTtlMs: 30 * 86400_000, sessionAbsoluteTtlMs: 90 * 86400_000, sessionRotationMs: 7 * 86400_000 };
  const channel = (channelId: string) => ({ channelId, channelName: channelId === owner ? "시청자" : "스트리머", channelImageUrl: null, followerCount: 0, verifiedMark: false });
  const labCalls: string[] = [];
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.RECAP_LOCAL_AUTH_ENABLED = "true";
    shares = [];
    restricted = null;
    excluded = null;
    existsQueryFails = false;
    images = {};
    profileImage = null;
    labCalls.length = 0;
    jest.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      labCalls.push(url.pathname + url.search);
      if (url.pathname.endsWith(`/relationships/${streamer}`)) return Response.json(relationship);
      if (url.pathname.endsWith("/activities/trend")) return Response.json(trend(url.searchParams.get("from")!, url.searchParams.get("to")!, url.searchParams.get("interval")!));
      throw new Error(`unexpected fetch ${url}`);
    });
    database = new DataSource({ type: "postgres" });
    // 공유 테이블만 메모리에서 흉내 내고, 나머지 질의(활동 로그·계정·이용 제한)는 빈 결과를 준다.
    jest.spyOn(database, "query").mockImplementation(async (sql: string, params?: unknown) => {
      const p = (Array.isArray(params) ? params : []) as string[];
      // 계정 저장: 새 사진 주소가 없으면(null) 이전 값을 지우지 않는다.
      if (sql.includes("INSERT INTO recap.chzzk_accounts (channel_id, channel_name, channel_image_url)")) { images[p[0]!] = (p[2] as string | null) ?? images[p[0]!] ?? null; return []; }
      if (sql.includes("INSERT INTO recap.recap_shares")) {
        const existing = shares.find(s => s.owner === p[0] && s.recipient === p[1]);
        if (existing) existing.consentedAt = consentedAt; else shares.push({ owner: p[0]!, recipient: p[1]!, consentedAt });
        return [{ consented_at: consentedAt }];
      }
      if (sql.includes("DELETE FROM recap.recap_shares")) {
        const before = shares.length;
        shares = shares.filter(s => !(s.owner === p[0] && s.recipient === p[1]));
        return [before === shares.length ? [] : [{ consented_at: consentedAt }], before - shares.length];
      }
      if (sql.includes("SELECT consented_at FROM recap.recap_shares")) return shares.filter(s => s.owner === p[0] && s.recipient === p[1]).map(s => ({ consented_at: s.consentedAt }));
      if (sql.includes("FROM recap.recap_shares s JOIN")) {
        if (!sql.includes("recap.privacy_requests") || !sql.includes("recap.account_restrictions")) throw new Error("received list must exclude restricted owners");
        const received = shares.filter(s => s.recipient === p[0] && s.owner !== restricted && s.owner !== excluded);
        if (sql.startsWith("SELECT EXISTS")) {
          if (existsQueryFails) throw new Error("Database query failed");
          return [{ exists: received.length > 0 }];
        }
        return received.map(s => ({ owner_channel_id: s.owner, channel_name: "시청자", channel_image_url: images[s.owner] ?? null, consented_at: s.consentedAt }));
      }
      if (sql.includes("FROM recap.account_restrictions")) return restricted === p[0] ? [{ reason: "제한" }] : [];
      return [];
    });
    const module = await Test.createTestingModule({ imports: [AppModule.register()] })
      .overrideProvider(DataSource).useValue(database)
      .overrideProvider(AuthConfig).useValue(config)
      .overrideProvider(ChzzkClient).useValue({ getChannel: jest.fn<ChzzkClient["getChannel"]>().mockImplementation(async id => { if (profileImage === "fail") throw new Error("CHZZK unavailable"); return { ...channel(id), channelImageUrl: profileImage }; }) })
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
  async function login(channelId: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post("/_dev/login").set("Origin", "http://localhost:8180").type("form").send({ channelId }).expect(303);
    return agent;
  }
  const activityLogs = (type: string) => jest.mocked(database.query).mock.calls.filter(([sql, params]) => String(sql).includes("INSERT INTO recap.activity_logs") && Array.isArray(params) && params[1] === type);

  it("requires a login on every share path", async () => {
    const server = app.getHttpServer();
    await request(server).get(`/api/me/channels/${streamer}/share`).expect(401);
    await request(server).put(`/api/me/channels/${streamer}/share`).send({ consent: true }).expect(401);
    await request(server).delete(`/api/me/channels/${streamer}/share`).expect(401);
    await request(server).get("/api/me/shares/received").expect(401);
    await request(server).get("/api/me/shares/received/exists").expect(401);
    await request(server).get(`/api/me/shares/received/${owner}/record`).expect(401);
    expect(shares).toEqual([]);
  });

  it("grants only with explicit consent, never to oneself, and records the activity", async () => {
    const agent = await login(owner);
    expect((await agent.get(`/api/me/channels/${streamer}/share`).expect(200)).body).toEqual({ share: null });
    await agent.put(`/api/me/channels/${streamer}/share`).send({}).expect(400);
    await agent.put(`/api/me/channels/${streamer}/share`).send({ consent: "true" }).expect(400);
    await agent.put(`/api/me/channels/${owner}/share`).send({ consent: true }).expect(400);
    await agent.put(`/api/me/channels/not-a-channel/share`).send({ consent: true }).expect(400);
    expect(shares).toEqual([]);
    const granted = await agent.put(`/api/me/channels/${streamer}/share`).send({ consent: true }).expect(200);
    expect(granted.body).toEqual({ share: { consentedAt: consentedAt.toISOString() } });
    expect(granted.headers["cache-control"]).toBe("no-store");
    expect(shares).toEqual([{ owner, recipient: streamer, consentedAt }]);
    expect((await agent.get(`/api/me/channels/${streamer}/share`).expect(200)).body).toEqual({ share: { consentedAt: consentedAt.toISOString() } });
    await agent.get(`/api/me/channels/${streamer}/share?userId=${streamer}`).expect(400);
    expect(activityLogs("share_grant")).toHaveLength(1);
  });

  it("saves the viewer's profile image when sharing and shows it to the streamer", async () => {
    profileImage = "https://nng-phinf.pstatic.net/viewer.png";
    const viewer = await login(owner);
    await viewer.put(`/api/me/channels/${streamer}/share`).send({ consent: true }).expect(200);
    const streamerAgent = await login(streamer);
    expect((await streamerAgent.get("/api/me/shares/received").expect(200)).body.shares[0].ownerChannelImageUrl).toBe("https://nng-phinf.pstatic.net/viewer.png");
  });

  it("still grants the share when the profile image cannot be fetched, and keeps an image saved before", async () => {
    images[owner] = "https://nng-phinf.pstatic.net/before.png";
    const viewer = await login(owner);
    profileImage = "fail";
    await viewer.put(`/api/me/channels/${streamer}/share`).send({ consent: true }).expect(200);
    profileImage = null;
    await viewer.put(`/api/me/channels/${streamer}/share`).send({ consent: true }).expect(200);
    const streamerAgent = await login(streamer);
    expect((await streamerAgent.get("/api/me/shares/received").expect(200)).body.shares[0].ownerChannelImageUrl).toBe("https://nng-phinf.pstatic.net/before.png");
  });

  it("stores only https profile image addresses of a sane length", () => {
    expect(storableImage("https://nng-phinf.pstatic.net/a.png")).toBe("https://nng-phinf.pstatic.net/a.png");
    for (const bad of [null, undefined, "", "http://nng-phinf.pstatic.net/a.png", "javascript:alert(1)", "not a url", `https://x.test/${"a".repeat(2100)}`]) expect(storableImage(bad)).toBeNull();
  });

  it("revokes and reports whether a share existed", async () => {
    const agent = await login(owner);
    expect((await agent.delete(`/api/me/channels/${streamer}/share`).expect(200)).body).toEqual({ revoked: false });
    await agent.put(`/api/me/channels/${streamer}/share`).send({ consent: true }).expect(200);
    expect((await agent.delete(`/api/me/channels/${streamer}/share`).expect(200)).body).toEqual({ revoked: true });
    expect(shares).toEqual([]);
    expect(activityLogs("share_revoke")).toHaveLength(2);
  });

  it("lets only the consented streamer open the owner's record for that channel", async () => {
    const viewer = await login(owner);
    const outsider = await login("c".repeat(32));
    const streamerAgent = await login(streamer);
    expect((await streamerAgent.get("/api/me/shares/received").expect(200)).body).toEqual({ shares: [] });
    await streamerAgent.get(`/api/me/shares/received/${owner}/record`).expect(404);
    await viewer.put(`/api/me/channels/${streamer}/share`).send({ consent: true }).expect(200);
    expect((await streamerAgent.get("/api/me/shares/received").expect(200)).body).toEqual({ shares: [{ ownerChannelId: owner, ownerChannelName: "시청자", ownerChannelImageUrl: null, consentedAt: consentedAt.toISOString() }] });
    await outsider.get(`/api/me/shares/received/${owner}/record`).expect(404);
    await streamerAgent.get(`/api/me/shares/received/${owner}/record?period=all`).expect(400);
    await streamerAgent.get("/api/me/shares/received/not-a-channel/record").expect(400);
    const shared = await streamerAgent.get(`/api/me/shares/received/${owner}/record`).expect(200);
    expect(shared.body.owner).toEqual({ channelId: owner, channelName: "시청자" });
    expect(shared.body.consentedAt).toBe(consentedAt.toISOString());
    // 동의 창에 적은 항목만 전달한다. 비율과 전체 채팅 수는 다른 방송 활동을 드러내므로 빠져야 한다.
    const { share: _share, totalUserChatCount: _total, ...visible } = record;
    expect(shared.body.record).toEqual({ status: "ready", data: { channel: relationship.channel, relationship: visible } });
    expect(JSON.stringify(shared.body)).not.toContain("totalUserChatCount");
    expect(shared.body).not.toHaveProperty("profileRefresh");
    expect(shared.body.daily.status).toBe("ready");
    expect(shared.body.monthly.status).toBe("ready");
    // 소유자의 기록을 소유자 주체로 조회하되 방송은 수신자 채널이다.
    expect(labCalls).toContain(`/internal/v1/channels/${owner}/relationships/${streamer}`);
    expect(labCalls.every(path => path.startsWith(`/internal/v1/channels/${owner}/`))).toBe(true);
    expect(activityLogs("shared_record_view")).toHaveLength(3);
  });

  it("checks existence for the session recipient without fetching records or the list", async () => {
    const viewer = await login(owner);
    const recipient = await login(streamer);
    const outsider = await login("c".repeat(32));
    const list = jest.spyOn(app.get(ShareStore), "received");
    const empty = await recipient.get("/api/me/shares/received/exists").expect(200);
    expect(empty.body).toEqual({ exists: false });
    expect(empty.headers["cache-control"]).toBe("no-store");
    await viewer.put(`/api/me/channels/${streamer}/share`).send({ consent: true }).expect(200);
    expect((await recipient.get("/api/me/shares/received/exists").expect(200)).body).toEqual({ exists: true });
    expect((await outsider.get("/api/me/shares/received/exists").expect(200)).body).toEqual({ exists: false });
    await outsider.get(`/api/me/shares/received/exists?recipient=${streamer}`).expect(400);
    await viewer.delete(`/api/me/channels/${streamer}/share`).expect(200);
    expect((await recipient.get("/api/me/shares/received/exists").expect(200)).body).toEqual({ exists: false });
    expect(list).not.toHaveBeenCalled();
    expect(labCalls).toEqual([]);
  });

  it("excludes restricted and opted-out owners and includes them again after release", async () => {
    const recipient = await login(streamer);
    shares.push({ owner, recipient: streamer, consentedAt });
    restricted = owner;
    expect((await recipient.get("/api/me/shares/received/exists").expect(200)).body).toEqual({ exists: false });
    restricted = null;
    expect((await recipient.get("/api/me/shares/received/exists").expect(200)).body).toEqual({ exists: true });
    excluded = owner;
    expect((await recipient.get("/api/me/shares/received/exists").expect(200)).body).toEqual({ exists: false });
    shares.push({ owner: "c".repeat(32), recipient: streamer, consentedAt });
    expect((await recipient.get("/api/me/shares/received/exists").expect(200)).body).toEqual({ exists: true });
    shares.pop();
    excluded = null;
    expect((await recipient.get("/api/me/shares/received/exists").expect(200)).body).toEqual({ exists: true });
    restricted = streamer;
    await recipient.get("/api/me/shares/received/exists").expect(403);
  });

  it("does not turn an existence query failure into no shares", async () => {
    const recipient = await login(streamer);
    existsQueryFails = true;
    const failed = await recipient.get("/api/me/shares/received/exists").expect(500);
    expect(failed.body).not.toHaveProperty("exists");
    await expect(new ShareStore(null).receivedExists(streamer)).rejects.toMatchObject({ status: 503 });
  });

  it("hides the record once revoked or when the owner is restricted", async () => {
    const viewer = await login(owner);
    const streamerAgent = await login(streamer);
    await viewer.put(`/api/me/channels/${streamer}/share`).send({ consent: true }).expect(200);
    await streamerAgent.get(`/api/me/shares/received/${owner}/record`).expect(200);
    restricted = owner;
    expect((await streamerAgent.get("/api/me/shares/received").expect(200)).body).toEqual({ shares: [] });
    await streamerAgent.get(`/api/me/shares/received/${owner}/record`).expect(404);
    restricted = null;
    await viewer.delete(`/api/me/channels/${streamer}/share`).expect(200);
    await streamerAgent.get(`/api/me/shares/received/${owner}/record`).expect(404);
  });
});
