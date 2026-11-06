import { beforeAll, afterAll, describe, it, expect, jest } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { EventStore } from "../src/events/event.store.js";
import { EventService } from "../src/events/event.service.js";
import { EventConditionFactory } from "../src/events/event-condition.factory.js";
import { ActivityLogService } from "../src/database/activity-log.service.js";
import { LabConfig } from "../src/activity/lab.config.js";
import { TicketStore } from "../src/insight/ticket.store.js";
import { InsightService } from "../src/insight/insight.service.js";

// 명시한 DB의 기존 스키마에서 이 테스트가 만든 행만 finally에서 지운다.
const source = new DataSource({ type: "postgres", url: process.env.RECAP_TEST_POSTGRES_URL, extra: { max: 10 }, logging: false });
const prefix = "QA" + randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
const subjects: string[] = [], codes: string[] = [];
const previous = { node: process.env.NODE_ENV, logs: process.env.RECAP_ACTIVITY_LOG_ENABLED };
class ScopedStore extends EventStore {
  constructor(private readonly group: string) { super(source); }
  override async candidates() { return (await super.candidates()).filter(e => e.groupKey === this.group); }
}
async function account(old = false) {
  const id = randomUUID().replaceAll("-", "");
  await source.query("INSERT INTO recap.chzzk_accounts(channel_id,channel_name,created_at) VALUES($1,$2,clock_timestamp()-$3::int*interval '1 day')", [id, prefix, old ? 30 : 0]);
  subjects.push(id); return id;
}
async function campaign(suffix: string, cap: number, type = "newcomer", params: unknown = { maxActivityLogsExclusive: 5 }, group = prefix + suffix, sort = 10) {
  const code = prefix + suffix;
  await source.query("INSERT INTO recap.insight_coupons(code,tickets_per_redeem,max_redemptions,ticket_valid_days,created_by) VALUES($1,1,$2,30,$3)", [code,cap,prefix]);
  codes.push(code);
  await source.query("INSERT INTO recap.insight_events(title,coupon_code,condition_type,condition_params,group_key,sort_order,starts_at,created_by) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()-interval '1 minute',$1)", [prefix,code,type,JSON.stringify(params),group,sort]);
  return { code, group };
}
function service(store: EventStore, get: InsightService["get"] = async () => ({ status: "ready", data: null })) {
  const insight = new InsightService(new LabConfig());
  jest.spyOn(insight, "get").mockImplementation(get);
  return new EventService(store,new EventConditionFactory(),insight,new ActivityLogService(source));
}
beforeAll(async () => {
  if (!process.env.RECAP_TEST_POSTGRES_URL) throw new Error("Explicit RECAP_TEST_POSTGRES_URL is required");
  process.env.NODE_ENV="development"; process.env.RECAP_ACTIVITY_LOG_ENABLED="false";
  await source.initialize();
});
afterAll(async () => {
  try {
    if (source.isInitialized) {
      const [{ n }] = await source.query("SELECT count(*)::int AS n FROM recap.activity_logs WHERE channel_id=ANY($1::text[])", [subjects]);
      expect(n).toBe(0);
    }
  } finally {
    if (source.isInitialized) {
      await source.transaction(async m => {
        await m.query("DELETE FROM recap.insight_tickets WHERE channel_id=ANY($1::text[]) AND coupon_code=ANY($2::text[])",[subjects,codes]);
        await m.query("DELETE FROM recap.insight_coupon_redemptions WHERE coupon_code=ANY($1::text[])",[codes]);
        await m.query("DELETE FROM recap.insight_events WHERE coupon_code=ANY($1::text[]) AND created_by=$2",[codes,prefix]);
        await m.query("DELETE FROM recap.insight_coupons WHERE code=ANY($1::text[]) AND created_by=$2",[codes,prefix]);
        await m.query("DELETE FROM recap.chzzk_accounts WHERE channel_id=ANY($1::text[]) AND channel_name=$2",[subjects,prefix]);
      });
      const [{ n }] = await source.query("SELECT count(*)::int AS n FROM recap.chzzk_accounts WHERE channel_id=ANY($1::text[])",[subjects]);
      expect(n).toBe(0);
      const [coupons] = await source.query("SELECT count(*)::int AS n FROM recap.insight_coupons WHERE code=ANY($1::text[])",[codes]);
      const [tickets] = await source.query("SELECT count(*)::int AS n FROM recap.insight_tickets WHERE channel_id=ANY($1::text[])",[subjects]);
      expect(coupons.n).toBe(0); expect(tickets.n).toBe(0);
      await source.destroy();
    }
    for (const [k, v] of [["NODE_ENV",previous.node],["RECAP_ACTIVITY_LOG_ENABLED",previous.logs]]) { if(v===undefined) delete process.env[k!]; else process.env[k!]=v; }
  }
});
describe("event issuance on explicitly configured PostgreSQL", () => {
  it("serializes 20 requests by one account to one grant",async()=>{
    const c=await campaign("ONE",30), id=await account(); const s=service(new ScopedStore(c.group));
    const r=await Promise.all(Array.from({length:20},()=>s.enter(id)));
    expect(r.filter(x=>x.status==="granted")).toHaveLength(1);
    const [row]=await source.query("SELECT redemption_count FROM recap.insight_coupons WHERE code=$1",[c.code]);expect(row.redemption_count).toBe(1);
  });
  it("caps 20 distinct accounts at five recipients",async()=>{
    const c=await campaign("CAP",5), ids=await Promise.all(Array.from({length:20},()=>account()));const s=service(new ScopedStore(c.group));
    const r=await Promise.all(ids.map(id=>s.enter(id)));
    expect(r.filter(x=>x.status==="granted")).toHaveLength(5);
    const [row]=await source.query("SELECT redemption_count FROM recap.insight_coupons WHERE code=$1",[c.code]);expect(row.redemption_count).toBe(5);
  });
  it("group exclusion spans two coupons after the first is exhausted",async()=>{
    const c=await campaign("GA",1), id=await account();await campaign("GB",10,"newcomer",{maxActivityLogsExclusive:5},c.group,20);
    const s=service(new ScopedStore(c.group));expect((await s.enter(id)).status).toBe("granted");expect(await s.enter(id)).toEqual({status:"none"});
  });
  it("excludes a previous reward across different event groups after tickets were used", async () => {
    const first=await campaign("GLOBALA",5), second=await campaign("GLOBALB",5), id=await account();
    expect((await service(new ScopedStore(first.group)).enter(id)).status).toBe("granted");
    await source.query("UPDATE recap.insight_tickets SET used_at=clock_timestamp(),lab_request_id=999999991 WHERE channel_id=$1",[id]);
    expect(await service(new ScopedStore(second.group)).enter(id)).toEqual({status:"none"});
  });
  it("permits prior failed requests and expired refunds when no event was received", async () => {
    const c=await campaign("RETRY",5), id=await account(true);
    const [ticket]=await source.query("INSERT INTO recap.insight_tickets(channel_id,source,used_at,lab_request_id) VALUES($1,'manual',clock_timestamp(),999999991) RETURNING id",[id]);
    await source.query("INSERT INTO recap.insight_tickets(channel_id,source,refund_of_ticket_id,expires_at) VALUES($1,'refund',$2,clock_timestamp()-interval '1 day')",[id,ticket.id]);
    const get: InsightService["get"] = async () => ({status:"ready",data:{channelId:id,requestId:999999991,state:"failed",enqueuedAt:new Date().toISOString()}});
    expect(await service(new ScopedStore(c.group),get).enter(id)).toMatchObject({status:"granted"});
  });
  it("does not lock the account while awaiting Lab; detects configuration changes",async()=>{
    const c=await campaign("WAIT",5),id=await account();let unblock!:()=>void,started!:()=>void;
    const waiting=new Promise<void>(r=>{started=r;}),release=new Promise<void>(r=>{unblock=r;});
    const running=service(new ScopedStore(c.group),async()=>{started();await release;return{status:"ready",data:null};}).enter(id);
    await waiting;
    try {
      await source.transaction(async m=>{const [r]=await m.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked",[id]);expect(r.locked).toBe(true);});
      await source.query("UPDATE recap.insight_events SET title=title||' changed' WHERE coupon_code=$1",[c.code]);
    } finally {unblock();}
    expect(await running).toEqual({status:"deferred"});
  });
  it("rechecks tickets added during the Lab wait",async()=>{
    const c=await campaign("CHANGE",5),id=await account();const s=service(new ScopedStore(c.group),async()=>{
      await source.query("INSERT INTO recap.insight_tickets(channel_id,source,coupon_code) VALUES($1,'coupon',$2)",[id,c.code]);return{status:"ready",data:null};
    });expect(await s.enter(id)).toEqual({status:"deferred"});
  });
  it("does not fall through when a higher candidate has an unsupported condition",async()=>{
    const c=await campaign("UNKNOWN",5,"unsupported",{});await campaign("LOW",5,"newcomer",{maxActivityLogsExclusive:5},c.group,20);
    expect(await service(new ScopedStore(c.group)).enter(await account())).toEqual({status:"deferred"});
  });
  it("rejects manual use of an enabled event coupon without calling Lab",async()=>{
    const c=await campaign("MANUAL",5),id=await account();let called=false;
    expect(await new TicketStore(source).redeem(id,c.code,async()=>{called=true;return"none";})).toEqual({status:"event_only"});expect(called).toBe(false);
  });
  it("an existing account can receive a reward without prior event, summary or tickets",async()=>{
    const c=await campaign("OLD",5),id=await account(true);expect(await service(new ScopedStore(c.group)).enter(id)).toMatchObject({status:"granted"});
  });
});
