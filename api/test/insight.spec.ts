import "reflect-metadata";
import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { DataSource } from "typeorm";
import { ActivityCacheConfig } from "../src/activity/activity.cache.config.js";
import { LabConfig } from "../src/activity/lab.config.js";
import { AuthConfig } from "../src/auth/auth.config.js";
import { ChzzkClient } from "../src/auth/chzzk.client.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.js";
import { cidrMatcher } from "../src/runtime/network.config.js";
import { InsightService } from "../src/insight/insight.service.js";
import { insightStatus } from "../src/insight/insight.validation.js";

const subject = "a".repeat(32);
const config = { baseUrl: "http://lab.test", apiKey: `clk_${"a".repeat(64)}` };
const card = () => ({
  headline: "당신은 만두 얘기를 자주 해요.", summary: "만두 얘기에 짧게 반응해요. 웃음도 많아요.",
  title: { name: "만두 감별사", why: "만두를 고르는 모습이 먼저 보여요." }, topWords: ["만두", "ㅋㅋ"],
  roles: [{ name: "맞장구치기", description: "짧게 동의해요.", evidence: ["ㅇㅇ"] }],
  quotes: [{ text: "만두 먹자", nickname: "만두 요정", why: "만두를 권하는 말이에요." }, { text: "ㅋㅋ", why: "웃음이에요." }],
  topics: [{ name: "만두", description: "만두 이야기", evidence: ["만두 먹자"], mentions: 12 }],
  tone: { warmth: "반반", speech: "섞어 씀", energy: "보통", address: "반반", watch: "판단 어려움", note: "짧게 말해요." },
  catchphrases: [], change: { found: false, description: "", evidence: [] }, gaps: [],
});
const done = (channelId = subject) => ({ channelId, requestId: 331, state: "done", enqueuedAt: "2026-11-02T14:00:00Z", finishedAt: "2026-11-02T14:01:00Z", promptVersion: "2026.11.02-23", result: card() });
const waiting = () => ({ channelId: subject, requestId: 900, state: "waiting", enqueuedAt: "2026-11-02T15:00:00Z", finishedAt: null, queueAhead: 2, queueEtaSec: 40 });
afterEach(() => jest.restoreAllMocks());

describe("insight validation", () => {
  it("projects only known fields and keeps the card", () => {
    const raw = { ...done(), error: "인용 2개를 고쳤다", costUsd: 0.01, result: { ...card(), words: ["만두"], keywords: ["x"] } };
    const st = insightStatus(raw, subject);
    expect(st).not.toHaveProperty("error");
    expect(st).not.toHaveProperty("costUsd");
    expect(st.result).not.toHaveProperty("words");
    expect(st.result!.headline).toBe("당신은 만두 얘기를 자주 해요.");
    expect(st.result!.quotes[1]).toEqual({ text: "ㅋㅋ", why: "웃음이에요." });
    expect(st.result!.topics[0]!.mentions).toBe(12);
    expect(insightStatus(waiting(), subject)).toEqual({ ...waiting(), finishedAt: undefined, channelId: subject });
  });
  it.each(["subject", "state", "failure", "result", "quote", "mentions"])("rejects malformed %s", kind => {
    const raw = done() as Record<string, unknown>;
    if (kind === "subject") raw.channelId = "b".repeat(32);
    if (kind === "state") raw.state = "unknown";
    if (kind === "failure") raw.failure = "boom";
    if (kind === "result") raw.result = "card";
    if (kind === "quote") (raw.result as ReturnType<typeof card>).quotes[0]!.nickname = 1 as unknown as string;
    if (kind === "mentions") (raw.result as ReturnType<typeof card>).topics[0]!.mentions = -1;
    expect(() => insightStatus(raw, subject)).toThrow();
  });
  it("needs a card only when done", () => {
    expect(() => insightStatus({ ...done(), result: undefined }, subject)).toThrow();
    expect(insightStatus({ channelId: subject, requestId: 5, state: "failed", enqueuedAt: "2026-11-02T15:00:00Z", failure: "timeout" }, subject).failure).toBe("timeout");
  });
});

describe("insight service", () => {
  it("reads the subject path and treats 404 as never requested", async () => {
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 404 }));
    expect(await new InsightService(config).get(subject)).toEqual({ status: "ready", data: null });
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(`http://lab.test/internal/v1/channels/${subject}/insight`);
    expect(options?.method).toBe("GET");
    expect(options?.headers).toEqual({ Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" });
    expect(options?.redirect).toBe("error");
  });
  it("posts with refresh only when asked", async () => {
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(waiting(), { status: 202 }));
    const service = new InsightService(config);
    const first = await service.request(subject, false);
    expect(first.status === "ready" && first.data?.state).toBe("waiting");
    await service.request(subject, true);
    expect(String(fetcher.mock.calls[0]![0])).toBe(`http://lab.test/internal/v1/channels/${subject}/insight`);
    expect(String(fetcher.mock.calls[1]![0])).toBe(`http://lab.test/internal/v1/channels/${subject}/insight?refresh=true`);
    expect(fetcher.mock.calls[1]![1]?.method).toBe("POST");
  });
  it("reports overload with retry time and hides upstream details", async () => {
    const fetcher = jest.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("busy", { status: 503, headers: { "Retry-After": "2" } }));
    const service = new InsightService(config);
    expect(await service.get(subject)).toEqual({ status: "unavailable", reason: "rate_limited", retryAfterSeconds: 2 });
    fetcher.mockImplementation(async () => Response.json({ private: "details" }, { status: 500 }));
    expect(await service.get(subject)).toEqual({ status: "unavailable", reason: "upstream" });
    fetcher.mockImplementation(async () => Response.json(done("b".repeat(32))));
    expect(await service.get(subject)).toEqual({ status: "unavailable", reason: "upstream" });
  });
  it("does not call Lab without a key", async () => {
    const fetcher = jest.spyOn(globalThis, "fetch");
    expect(await new InsightService({ ...config, apiKey: undefined }).request(subject, true)).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("insight HTTP boundary", () => {
  let app: NestExpressApplication;
  beforeEach(async () => {
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(done()));
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
    await request(app.getHttpServer()).get("/api/me/insight").expect(401);
    await request(app.getHttpServer()).post("/api/me/insight").send({ consent: true, refresh: true }).expect(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

// 티켓: 받기 · 차감 · 되돌림 · 환불을 로컬 로그인 세션으로 한 바퀴 돈다. 티켓 표만 메모리에서 흉내 내고 활동 로그는 기록 호출을 센다.
describe("insight tickets", () => {
  let app: NestExpressApplication;
  let database: DataSource;
  type Ticket = { id: string; channel: string; usedAt: Date | null; labRequestId: number | null; refundOf: string | null; expiresAt: Date | null };
  let tickets: Ticket[];
  let coupons: Record<string, { per: number; max: number | null; count: number; disabled: boolean; expired: boolean; allowTickets?: boolean; allowReview?: boolean; eventOnly?: boolean }>;
  let redemptions: Set<string>;
  let labStatus: () => Response;
  let labCalls: { method: string; path: string }[];
  let consents: { id: string; labRequestId: number | null }[];
  const previousEnv = { node: process.env.NODE_ENV, local: process.env.RECAP_LOCAL_AUTH_ENABLED, logs: process.env.RECAP_ACTIVITY_LOG_ENABLED };
  const auth = { sessionKey: "test-session-key-with-at-least-32-bytes", successUrl: "http://localhost:8180/", secureCookie: false, allowedPeer: () => true, allowedOrigins: ["http://localhost:8180"], sessionTtlMs: 30 * 86400_000, sessionAbsoluteTtlMs: 90 * 86400_000, sessionRotationMs: 7 * 86400_000 };
  const available = (channel: string) => tickets.filter(t => t.channel === channel && !t.usedAt && (!t.expiresAt || t.expiresAt > new Date()));
  let seq = 0;
  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.RECAP_LOCAL_AUTH_ENABLED = "true";
    process.env.RECAP_ACTIVITY_LOG_ENABLED = "true";
    tickets = []; redemptions = new Set(); labCalls = []; consents = []; seq = 0;
    coupons = { NOV3TEST: { per: 2, max: 10, count: 0, disabled: false, expired: false }, OLDCODE: { per: 1, max: null, count: 0, disabled: false, expired: true } };
    labStatus = () => new Response("", { status: 404 });
    jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      labCalls.push({ method: init?.method ?? "GET", path: url.pathname + url.search });
      return labStatus();
    });
    database = new DataSource({ type: "postgres" });
    jest.spyOn(database, "query").mockImplementation(async (sql: string, params?: unknown) => {
      const p = (Array.isArray(params) ? params : []) as (string | number)[];
      if (sql.includes("INSERT INTO recap.insight_consents")) { consents.push({ id: `c${++seq}`, labRequestId: null }); return [{ id: consents.at(-1)!.id }]; }
      if (sql.includes("UPDATE recap.insight_consents SET lab_request_id")) { const c = consents.find(c => c.id === p[0]); if (c) c.labRequestId = Number(p[1]); return []; }
      if (sql.includes("SELECT channel_id FROM recap.insight_tickets WHERE id")) { const t = tickets.find(t => t.id === p[0]); return t ? [{ channel_id: t.channel }] : []; }
      if (sql.includes("SELECT count(*) AS n FROM recap.insight_tickets")) return [{ n: available(String(p[0])).length }];
      if (sql.includes("FROM recap.insight_coupons c")) {
        const c = coupons[String(p[0])];
        return c ? [{ event_only: c.eventOnly ?? false, already_redeemed: redemptions.has(`${p[0]}:${p[1]}`), balance: available(String(p[1])).length,
          has_refund: tickets.some(t => t.channel === p[1] && !!t.refundOf), pending: tickets.some(t => t.channel === p[1] && !!t.usedAt && t.labRequestId === null), version: JSON.stringify(tickets.filter(t => t.channel === p[1])), tickets_per_redeem: c.per, ticket_valid_days: null, allow_with_available_tickets: c.allowTickets ?? false, allow_with_completed_review: c.allowReview ?? false, disabled: c.disabled, expired: c.expired, exhausted: c.max !== null && c.count >= c.max }] : [];
      }
      if (sql.includes("SELECT EXISTS (SELECT 1 FROM recap.insight_coupon_redemptions")) return [{ found: redemptions.has(`${p[0]}:${p[1]}`) }];
      if (sql.includes("SELECT EXISTS (SELECT 1 FROM recap.insight_tickets")) return [{ found: tickets.some(t => t.channel === p[0] && t.refundOf) }];
      if (sql.includes("INSERT INTO recap.insight_coupon_redemptions")) { redemptions.add(`${p[0]}:${p[1]}`); return []; }
      if (sql.includes("INSERT INTO recap.insight_tickets (channel_id, source, coupon_code")) {
        for (let i = 0; i < Number(p[3]); i++) tickets.push({ id: `t${++seq}`, channel: String(p[0]), usedAt: null, labRequestId: null, refundOf: null, expiresAt: null });
        return [];
      }
      if (sql.includes("UPDATE recap.insight_coupons SET redemption_count")) { coupons[String(p[0])].count++; return []; }
      // pg 드라이버의 UPDATE … RETURNING 모양: [행들, 영향 수]
      if (sql.includes("SET used_at = CURRENT_TIMESTAMP")) { const t = available(String(p[0]))[0]; if (!t) return [[], 0]; t.usedAt = new Date(); return [[{ id: t.id }], 1]; }
      if (sql.includes("SET lab_request_id = $2")) { const t = tickets.find(t => t.id === p[0]); if (t) t.labRequestId = Number(p[1]); return []; }
      if (sql.includes("SET used_at = NULL")) { const t = tickets.find(t => t.id === p[0]); if (t && t.labRequestId === null) t.usedAt = null; return []; }
      if (sql.includes("INSERT INTO recap.insight_tickets (channel_id, source, refund_of_ticket_id")) {
        const used = tickets.filter(t => t.channel === p[0] && t.labRequestId === Number(p[1]) && !t.refundOf && !tickets.some(r => r.refundOf === t.id));
        for (const t of used) tickets.push({ id: `t${++seq}`, channel: t.channel, usedAt: null, labRequestId: null, refundOf: t.id, expiresAt: t.expiresAt });
        return used.map(t => ({ id: t.id }));
      }
      return [];
    });
    jest.spyOn(database.manager, "query").mockImplementation((sql, params) => database.query(sql, params));
    jest.spyOn(database, "transaction").mockImplementation(async (isolationOrRun, run) => {
      const work = typeof isolationOrRun === "function" ? isolationOrRun : run!;
      return work(database.manager);
    });
    const module = await Test.createTestingModule({ imports: [AppModule.register()] })
      .overrideProvider(DataSource).useValue(database)
      .overrideProvider(AuthConfig).useValue(auth)
      .overrideProvider(ChzzkClient).useValue({ getChannel: jest.fn<ChzzkClient["getChannel"]>().mockImplementation(async channelId => ({ channelId, channelName: "시청자", channelImageUrl: null, followerCount: 0, verifiedMark: false })) })
      .overrideProvider(LabConfig).useValue(config).compile();
    app = module.createNestApplication<NestExpressApplication>({ logger: false });
    await configureApp(app); await app.init();
  });
  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
    if (previousEnv.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv.node;
    if (previousEnv.local === undefined) delete process.env.RECAP_LOCAL_AUTH_ENABLED; else process.env.RECAP_LOCAL_AUTH_ENABLED = previousEnv.local;
    if (previousEnv.logs === undefined) delete process.env.RECAP_ACTIVITY_LOG_ENABLED; else process.env.RECAP_ACTIVITY_LOG_ENABLED = previousEnv.logs;
  });
  async function login(channelId: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post("/_dev/login").set("Origin", "http://localhost:8180").type("form").send({ channelId }).expect(303);
    return agent;
  }
  const activityLogs = (type: string) => jest.mocked(database.query).mock.calls
    .filter(([sql, params]) => String(sql).includes("INSERT INTO recap.activity_logs") && Array.isArray(params) && params[1] === type)
    .map(([, params]) => { const p = params as unknown[]; return { result: p[5], errorCode: p[8] }; });

  it("authenticates entry evaluation and rejects caller-supplied eligibility fields", async () => {
    await request(app.getHttpServer()).post("/api/me/events/entry").send({}).expect(401);
    const agent = await login(subject);
    await agent.post("/api/me/events/entry?channelId=" + subject).send({}).expect(400);
    await agent.post("/api/me/events/entry").send({ channelId: subject }).expect(400);
    await agent.post("/api/me/events/entry").send([]).expect(400);
    const response = await agent.post("/api/me/events/entry").send({}).expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({ status: "none" });
    expect(labCalls).toHaveLength(0);
    expect(activityLogs("insight_event_grant")).toHaveLength(0);
  });

  it.each([true, false])("rejects event-only codes even when disabled=%s", async disabled => {
    coupons.NOV3TEST.eventOnly = true;
    coupons.NOV3TEST.disabled = disabled;
    const agent = await login(subject);
    labCalls = [];
    expect((await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(409)).body.code).toBe("coupon_event_only");
    expect(labCalls).toHaveLength(0);
    expect(tickets).toHaveLength(0);
    expect(redemptions.size).toBe(0);
  });

  it("rechecks event linkage after waiting for Lab", async () => {
    const agent = await login(subject);
    labStatus = () => { coupons.NOV3TEST.eventOnly = true; return new Response("", { status: 404 }); };
    expect((await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(409)).body.code).toBe("coupon_event_only");
    expect(tickets).toHaveLength(0);
    expect(coupons.NOV3TEST.count).toBe(0);
  });

  it("redeems a coupon once per person and records it", async () => {
    await request(app.getHttpServer()).post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(401);
    const agent = await login(subject);
    await agent.post("/api/me/insight/redeem").send({}).expect(400);
    await agent.post("/api/me/insight/redeem").send({ code: "no spaces!" }).expect(400);
    expect((await agent.post("/api/me/insight/redeem").send({ code: " nov3test " }).expect(200)).body).toEqual({ granted: 2, tickets: 2 });
    expect((await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(409)).body.code).toBe("coupon_already_redeemed");
    expect((await agent.post("/api/me/insight/redeem").send({ code: "NOPE1234" }).expect(404)).body.code).toBe("coupon_not_found");
    expect((await agent.post("/api/me/insight/redeem").send({ code: "OLDCODE" }).expect(409)).body.code).toBe("coupon_expired");
    expect(activityLogs("insight_ticket_redeem")).toEqual([{ result: "success", errorCode: null }, { result: "failure", errorCode: "COUPON_UNUSABLE" }, { result: "failure", errorCode: "COUPON_UNUSABLE" }, { result: "failure", errorCode: "COUPON_UNUSABLE" }]);
    expect(labCalls.map(c => c.method)).toEqual(["GET"]);
    const statuses = jest.mocked(database.query).mock.calls
      .filter(([sql, params]) => String(sql).includes("INSERT INTO recap.activity_logs") && Array.isArray(params) && params[1] === "insight_ticket_redeem")
      .map(([, params]) => (params as unknown[])[6]);
    expect(statuses).toEqual([200, 409, 404, 409]);
  });

  it.each([false, true].flatMap(allowTickets => [false, true].flatMap(allowReview =>
    [false, true].flatMap(hasTickets => [false, true].map(hasReview => ({ allowTickets, allowReview, hasTickets, hasReview }))))))(
    "independent eligibility flags: %j", async ({ allowTickets, allowReview, hasTickets, hasReview }) => {
      coupons.NOV3TEST.allowTickets = allowTickets;
      coupons.NOV3TEST.allowReview = allowReview;
      if (hasTickets) tickets.push({ id: "existing", channel: subject, usedAt: null, labRequestId: null, refundOf: null, expiresAt: null });
      labStatus = () => hasReview ? Response.json(done()) : new Response("", { status: 404 });
      const agent = await login(subject);
      const blocked = hasTickets && !allowTickets ? "coupon_available_tickets" : hasReview && !allowReview ? "coupon_completed_review" : null;
      const response = await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(blocked ? 409 : 200);
      if (blocked) {
        expect(response.body.code).toBe(blocked);
        expect(redemptions.size).toBe(0);
        expect(coupons.NOV3TEST.count).toBe(0);
        expect(activityLogs("insight_ticket_redeem")).toEqual([{ result: "failure", errorCode: "COUPON_UNUSABLE" }]);
      } else expect(response.body).toEqual({ granted: 2, tickets: (hasTickets ? 1 : 0) + 2 });
    });

  it.each(["waiting", "running", "failed", "unavailable"])("refuses %s even when both flags allow", async state => {
    coupons.NOV3TEST.allowTickets = coupons.NOV3TEST.allowReview = true;
    labStatus = () => state === "unavailable" ? new Response("", { status: 503 }) : Response.json({ ...waiting(), state, ...(state === "failed" ? { failure: "timeout" } : {}) });
    const agent = await login(subject);
    const response = await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(state === "unavailable" ? 503 : 409);
    expect(response.body.code).toBe(state === "unavailable" ? "coupon_eligibility_unavailable" : state === "failed" ? "coupon_analysis_failed" : "coupon_analysis_pending");
    expect(redemptions.size).toBe(0);
    expect(tickets).toHaveLength(0);
  });

  it("ignores expired and consumed tickets, but rejects a past refund", async () => {
    tickets.push({ id: "expired", channel: subject, usedAt: null, labRequestId: null, refundOf: null, expiresAt: new Date(0) });
    tickets.push({ id: "used", channel: subject, usedAt: new Date(), labRequestId: 9, refundOf: null, expiresAt: null });
    const agent = await login(subject);
    await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(200);
    coupons.NEWCODE = { per: 1, max: 5, count: 0, disabled: false, expired: false, allowTickets: true, allowReview: true };
    tickets.push({ id: "refund", channel: subject, usedAt: new Date(), labRequestId: null, refundOf: "used", expiresAt: null });
    expect((await agent.post("/api/me/insight/redeem").send({ code: "NEWCODE" }).expect(409)).body.code).toBe("coupon_analysis_failed");
    expect(coupons.NEWCODE.count).toBe(0);
  });

  it("rejects coupons while a consumed ticket has not been attached or released", async () => {
    coupons.NOV3TEST.allowTickets = true;
    tickets.push({ id: "reserved", channel: subject, usedAt: new Date(), labRequestId: null, refundOf: null, expiresAt: null });
    const agent = await login(subject);
    const response = await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(409);
    expect(response.body.code).toBe("coupon_analysis_pending");
    expect(redemptions.size).toBe(0);
    expect(labCalls).toHaveLength(0);
  });

  it("returns the database transaction before querying Lab", async () => {
    let activeTransactions = 0;
    jest.spyOn(database, "transaction").mockImplementation(async (isolationOrRun, run) => {
      const work = typeof isolationOrRun === "function" ? isolationOrRun : run!;
      activeTransactions++;
      try { return await work(database.manager); }
      finally { activeTransactions--; }
    });
    jest.mocked(globalThis.fetch).mockImplementation(async () => {
      expect(activeTransactions).toBe(0);
      return new Response("", { status: 404 });
    });
    const agent = await login(subject);
    await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(200);
    expect(activeTransactions).toBe(0);
  });

  it("rejects a stale Lab lookup if ticket state changed during the lookup", async () => {
    coupons.NOV3TEST.allowTickets = true;
    jest.mocked(globalThis.fetch).mockImplementation(async () => {
      tickets.push({ id: "concurrent", channel: subject, usedAt: null, labRequestId: null, refundOf: null, expiresAt: null });
      return new Response("", { status: 404 });
    });
    const agent = await login(subject);
    const response = await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(503);
    expect(response.body.code).toBe("coupon_eligibility_unavailable");
    expect(redemptions.size).toBe(0);
    expect(coupons.NOV3TEST.count).toBe(0);
    expect(tickets).toHaveLength(1);
  });

  it("spends a ticket only when Lab creates a request, and refuses without one", async () => {
    const agent = await login(subject);
    labStatus = () => new Response("", { status: 404 });
    expect((await agent.get("/api/me/insight").expect(200)).body).toMatchObject({ insight: { status: "ready", data: null }, tickets: 0 });
    await agent.post("/api/me/insight").send({}).expect(400);
    expect((await agent.post("/api/me/insight").send({ consent: false }).expect(400)).body.code).toBe("consent_required");
    expect((await agent.post("/api/me/insight").send({ consent: true }).expect(403)).body.code).toBe("no_ticket");
    expect(labCalls.filter(c => c.method === "POST")).toEqual([]);
    await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(200);
    // 랩이 끝난 결과를 돌려주면(200) 새 요청이 아니므로 티켓을 되돌린다
    labStatus = () => Response.json(done(), { status: 200 });
    expect((await agent.post("/api/me/insight").send({ consent: true }).expect(200)).body.tickets).toBe(2);
    // 새로 넣으면(202) 한 장을 쓰고 요청 번호를 적는다
    labStatus = () => Response.json(waiting(), { status: 202 });
    const sent = await agent.post("/api/me/insight").send({ consent: true, refresh: true }).expect(200);
    expect(sent.body.tickets).toBe(1);
    expect(labCalls.at(-1)).toEqual({ method: "POST", path: `/internal/v1/channels/${subject}/insight?refresh=true` });
    expect(tickets.filter(t => t.usedAt && t.labRequestId === 900)).toHaveLength(1);
    // 동의는 요청마다 남고, 랩이 새 요청을 만든 것에만 번호가 붙는다
    expect(consents.map(c => c.labRequestId)).toEqual([null, null, 900]);
    expect(activityLogs("insight_request")).toEqual([{ result: "failure", errorCode: "NO_TICKET" }, { result: "success", errorCode: null }, { result: "success", errorCode: null }]);
  });

  it("refunds the ticket of a failed request exactly once", async () => {
    const agent = await login(subject);
    await agent.post("/api/me/insight/redeem").send({ code: "NOV3TEST" }).expect(200);
    labStatus = () => Response.json(waiting(), { status: 202 });
    await agent.post("/api/me/insight").send({ consent: true }).expect(200);
    labStatus = () => Response.json({ channelId: subject, requestId: 900, state: "failed", enqueuedAt: "2026-11-02T15:00:00Z", failure: "timeout" });
    expect((await agent.get("/api/me/insight").expect(200)).body.tickets).toBe(2);
    expect((await agent.get("/api/me/insight").expect(200)).body.tickets).toBe(2);
    expect(tickets.filter(t => t.refundOf)).toHaveLength(1);
    expect(activityLogs("insight_ticket_refund")).toEqual([{ result: "success", errorCode: null }]);
  });
});
