import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/app.js';
import { AuthConfig } from '../dist/auth/auth.config.js';
import { ChzzkClient } from '../dist/auth/chzzk.client.js';
import { LabConfig } from '../dist/activity/lab.config.js';
import { LabClient } from '../dist/activity/lab.client.js';
import { InsightService } from '../dist/insight/insight.service.js';
import { EventStore } from '../dist/events/event.store.js';
import { createDatabase } from '../dist/database/database.js';

if (process.env.RECAP_RUN_EVENT_QA !== '1') throw Error('Explicit RECAP_RUN_EVENT_QA=1 is required');
const url = new URL(process.env.RECAP_DATABASE_URL);
assert.ok(['127.0.0.1','localhost'].includes(url.hostname)); assert.equal(url.port, '5432'); assert.equal(url.pathname, '/development_cheese_lake');
process.env.NODE_ENV = 'development'; process.env.RECAP_LOCAL_AUTH_ENABLED = 'true'; process.env.RECAP_ACTIVITY_LOG_ENABLED = 'false';
const base = 'http://127.0.0.1:8184';
const out = process.env.RECAP_QA_OUTPUT ?? '/tmp/2026.11.06 이벤트 지급 조건 QA';
await mkdir(out, { recursive: true });
const run = 'QANEW' + randomBytes(6).toString('hex').toUpperCase();
const code = run + 'GIFT';
const ids = [], cases = [], modes = new Map();
const db = createDatabase(url.href); db.options.applicationName = run;
const liveCodes = ['FIRSTVISITWELCOMEGIFT','ANY12MONTHSUBSCRIBERGIFT','ARISA6MONTHSUBSCRIBERGIFT'];
const liveState = () => db.query('SELECT code,disabled_at,redemption_count,max_redemptions FROM recap.insight_coupons WHERE code=ANY($1::text[]) ORDER BY code',[liveCodes]);
const subject = () => { const id = randomBytes(16).toString('hex'); ids.push(id); return id; };
const record = (name, values = {}) => { cases.push({ name, ...values }); console.log(JSON.stringify(cases.at(-1))); };
let app, before, eventId, ready = false, success = false, reviewCalls = 0;
let delayGate, seenGate;
class ScopedEvents extends EventStore {
  async candidates() { return (await super.candidates()).filter(e => e.couponCode === code); }
}
const getReview = async id => {
  assert.ok(ids.includes(id)); reviewCalls++;
  if (delayGate) { seenGate(); await delayGate; }
  const state = modes.get(id);
  if (state === 'unavailable') return { status: 'unavailable', reason: 'upstream' };
  return { status: 'ready', data: state ? { channelId: id, requestId: 999999991, state, enqueuedAt: new Date().toISOString() } : null };
};
const lab = { get: async (kind, id, period) => {
  assert.ok(ids.includes(id));
  const scope = { channelId: id, channelIds: [], from: period.from, to: period.to, timeZone: 'Asia/Seoul', dataScope: 'collected' };
  const empty = { scope, chatCount: 0, activeDays: 0, channelCount: 0 };
  if (kind === 'summary') return { status: 'ready', data: empty };
  if (kind === 'trend') return { status: 'ready', data: { scope, interval: period.interval, points: [] } };
  if (kind === 'activities') return { status: 'ready', data: { scope, totalChatCount: 0, channels: [], trend: { interval: period.interval, points: [] }, patterns: [] } };
  return { status: 'unavailable', reason: 'not_configured' };
} };
async function login(id) {
  const response = await fetch(base + '/_dev/login', { method: 'POST', redirect: 'manual', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ channelId: id }) });
  assert.equal(response.status, 303);
  return response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}
async function post(cookie, path = '/api/me/events/entry', body = {}) {
  const start = performance.now();
  const response = await fetch(base + path, { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  return { http: response.status, body: await response.json(), ms: performance.now() - start, cache: response.headers.get('cache-control') };
}
async function checkEligibility(name, setup, expected = 'none') {
  const id = subject(), cookie = await login(id); if (setup) await setup(id);
  const response = await post(cookie); assert.equal(response.http, 200); assert.equal(response.body.status, expected);
  const [{ n }] = await db.query('SELECT count(*)::int AS n FROM recap.insight_coupon_redemptions WHERE channel_id=$1',[id]); assert.equal(n,expected==='granted'?1:0);
  record(name, { status: response.body.status });
}
async function limited(items, limit, work) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (next < items.length) { const i = next++; results[i] = await work(items[i]); } }));
  return results;
}
try {
  await db.initialize(); before = await liveState(); assert.equal(before.length, 3); assert.ok(before.every(c => c.disabled_at && c.redemption_count === 0));
  await db.query('INSERT INTO recap.insight_coupons(code,tickets_per_redeem,max_redemptions,ticket_valid_days,created_by,note) VALUES($1,1,150,30,$2,$3)',[code,run,'로컬 이벤트 지급 조건 QA 전용']);
  [{ id: eventId }] = await db.query("INSERT INTO recap.insight_events(title,coupon_code,condition_type,condition_params,group_key,sort_order,starts_at,created_by) VALUES($1,$2,'newcomer','{\"maxActivityLogsExclusive\":5}',$3,10,clock_timestamp()-interval '1 minute',$3) RETURNING id",['이벤트 지급 조건 QA · 테스트 데이터',code,run]);
  const module = await Test.createTestingModule({ imports: [AppModule.register()] })
    .overrideProvider(DataSource).useValue(db)
    .overrideProvider(EventStore).useValue(new ScopedEvents(db))
    .overrideProvider(AuthConfig).useValue({ sessionKey: randomBytes(32).toString('hex'), successUrl: base + '/recap/', secureCookie: false, allowedPeer: a => ['127.0.0.1','::ffff:127.0.0.1','::1'].includes(a), allowedOrigins: [base], sessionTtlMs: 3600000, sessionAbsoluteTtlMs: 3600000, sessionRotationMs: 3600000 })
    .overrideProvider(ChzzkClient).useValue({ getChannel: async id => { assert.ok(ids.includes(id)); return { channelId: id, channelName: '이벤트 지급 조건 QA · 테스트 계정', channelImageUrl: null, followerCount: 0, verifiedMark: false }; } })
    .overrideProvider(InsightService).useValue({ get: getReview, request: async () => { throw Error('LLM requests forbidden during event QA'); } })
    .overrideProvider(LabClient).useValue(lab)
    .overrideProvider(LabConfig).useValue({ baseUrl: 'http://127.0.0.1:1', apiKey: undefined }).compile();
  app = module.createNestApplication({ logger: false }); await configureApp(app); await app.listen(8184,'127.0.0.1');
  const unauth = await post(''); assert.equal(unauth.http,401); record('unauthenticated', { http: unauth.http });
  const first = subject(), firstCookie = await login(first);
  const firstResponse = await post(firstCookie); assert.equal(firstResponse.http,200); assert.equal(firstResponse.body.status,'granted'); assert.equal(firstResponse.body.tickets,1); assert.equal(firstResponse.cache,'no-store');
  const [ticket] = await db.query('SELECT expires_at-issued_at AS validity FROM recap.insight_tickets WHERE channel_id=$1',[first]);
  assert.equal(ticket.validity.days,30); record('real_first_login_session', { status:'granted', tickets:1, validityDays:30 });
  assert.equal((await post(firstCookie,'/api/me/events/entry?channelId='+first)).http,400);
  assert.equal((await post(firstCookie,'/api/me/events/entry',{channelId:first})).http,400); record('caller_cannot_select_subject');
  const manual = await post(firstCookie,'/api/me/insight/redeem',{code}); assert.equal(manual.http,409); assert.equal(manual.body.code,'coupon_event_only');record('manual_coupon_block',{http:manual.http,code:manual.body.code});
  const dupId = subject(), dupCookie = await login(dupId); const dup = await Promise.all(Array.from({length:20},()=>post(dupCookie)));
  assert.ok(dup.every(r=>r.http===200)); assert.equal(dup.filter(r=>r.body.status==='granted').length,1); record('same_account_20_concurrent', { requests:20, granted:1 });
  await db.query("UPDATE recap.insight_tickets SET used_at=clock_timestamp(),lab_request_id=999999991 WHERE channel_id=$1",[dupId]);
  assert.equal((await post(dupCookie)).body.status,'none'); record('cannot_repeat_after_ticket_used');
  await checkEligibility('existing_account_new_login',async id=>db.query("UPDATE recap.chzzk_accounts SET created_at=clock_timestamp()-interval '1 day' WHERE channel_id=$1",[id]),'granted');
  await checkEligibility('available_ticket',async id=>db.query("INSERT INTO recap.insight_tickets(channel_id,source) VALUES($1,'manual')",[id]));
  await checkEligibility('past_analysis_request_without_current_summary',async id=>db.query("INSERT INTO recap.insight_tickets(channel_id,source,used_at,lab_request_id) VALUES($1,'manual',clock_timestamp(),999999991)",[id]),'granted');
  await checkEligibility('analysis_in_flight_without_request_id',async id=>db.query("INSERT INTO recap.insight_tickets(channel_id,source,used_at) VALUES($1,'manual',clock_timestamp())",[id]),'deferred');
  await checkEligibility('refunded_before',async id=>{
    const [t]=await db.query("INSERT INTO recap.insight_tickets(channel_id,source,used_at,lab_request_id) VALUES($1,'manual',clock_timestamp(),999999991) RETURNING id",[id]);
    await db.query("INSERT INTO recap.insight_tickets(channel_id,source,refund_of_ticket_id,expires_at) VALUES($1,'refund',$2,clock_timestamp()-interval '1 day')",[id,t.id]);
  },'granted');
  for (const state of ['done','failed','waiting','running','unavailable']) await checkEligibility('lab_state_'+state,async id=>modes.set(id,state),state==='done'?'none':state==='failed'?'granted':'deferred');
  for (const [name, change, restore] of [
    ['stopped',"UPDATE recap.insight_coupons SET disabled_at=clock_timestamp() WHERE code=$1","UPDATE recap.insight_coupons SET disabled_at=NULL WHERE code=$1"],
    ['expired',"UPDATE recap.insight_coupons SET expires_at=clock_timestamp()-interval '1 minute' WHERE code=$1","UPDATE recap.insight_coupons SET expires_at=NULL WHERE code=$1"],
    ['not_started',"UPDATE recap.insight_events SET starts_at=clock_timestamp()+interval '1 day' WHERE coupon_code=$1","UPDATE recap.insight_events SET starts_at=clock_timestamp()-interval '1 minute' WHERE coupon_code=$1"],
  ]) { await db.query(change,[code]); try {await checkEligibility(name);} finally {await db.query(restore,[code]);} }
  const browserId = subject();
  await db.query("INSERT INTO recap.chzzk_accounts(channel_id,created_at) VALUES($1,clock_timestamp()-interval '30 days')",[browserId]);
  await writeFile(out+'/browser.json',JSON.stringify({base,channelId:browserId,code,eventId,fixture:'실제 로컬 UI/API/원격 DB, 치지직 프로필·랩 상태·활동 응답은 테스트 대역'}));
  ready=true; record('browser_ready',{base});
  if (process.env.RECAP_QA_WAIT_BROWSER==='1') {
    const deadline=Date.now()+300000; let finished=false;
    while(Date.now()<deadline){try{await access(out+'/browser done');finished=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
    assert.ok(finished,'browser QA did not finish within five minutes');
    const [{n}]=await db.query('SELECT count(*)::int AS n FROM recap.insight_tickets WHERE channel_id=$1',[browserId]);assert.equal(n,1);record('browser_grant_persisted',{tickets:n});
  }
  const current=(await db.query('SELECT redemption_count FROM recap.insight_coupons WHERE code=$1',[code]))[0].redemption_count;
  const loadIds=Array.from({length:180},()=>subject()); const loadCookies=await limited(loadIds,10,login);
  const started=performance.now();const responses=await limited(loadCookies,30,c=>post(c)); const granted=responses.filter(r=>r.body.status==='granted').length;
  assert.ok(responses.every(r=>r.http===200));assert.equal(granted,150-current);
  const [counts]=await db.query('SELECT redemption_count,(SELECT count(*)::int FROM recap.insight_coupon_redemptions WHERE coupon_code=$1) receipts,(SELECT count(*)::int FROM recap.insight_tickets WHERE coupon_code=$1) tickets FROM recap.insight_coupons WHERE code=$1',[code]);
  assert.deepEqual(counts,{redemption_count:150,receipts:150,tickets:150});
  const timings=responses.map(r=>r.ms).sort((a,b)=>a-b);
  record('150_recipient_cap',{requests:180,concurrency:30,alreadyGranted:current,granted,counts,p95Ms:Math.round(timings[Math.ceil(timings.length*.95)-1]),maxMs:Math.round(timings.at(-1)),elapsedMs:Math.round(performance.now()-started)});
  await checkEligibility('exhausted');
  assert.deepEqual(await liveState(),before);record('live_campaigns_unchanged');success=true;
} finally {
  if(app) await new Promise(resolve=>app.getHttpServer().close(resolve));
  if(db.isInitialized){
    // 계정 삭제 CASCADE는 이번 실행이 만든 무작위 계정 ID에만 적용한다.
    const logs=Number((await db.query('SELECT count(*) n FROM recap.activity_logs WHERE channel_id=ANY($1::text[])',[ids]))[0].n);
    await db.transaction(async m=>{
      await m.query('DELETE FROM recap.chzzk_accounts WHERE channel_id=ANY($1::text[])',[ids]);
      await m.query('DELETE FROM recap.insight_events WHERE coupon_code=$1 AND created_by=$2',[code,run]);
      await m.query('DELETE FROM recap.insight_coupons WHERE code=$1 AND created_by=$2',[code,run]);
    });
    const [remaining]=await db.query('SELECT (SELECT count(*)::int FROM recap.chzzk_accounts WHERE channel_id=ANY($1::text[])) accounts,(SELECT count(*)::int FROM recap.insight_tickets WHERE channel_id=ANY($1::text[])) tickets,(SELECT count(*)::int FROM recap.insight_coupon_redemptions WHERE coupon_code=$2) receipts,(SELECT count(*)::int FROM recap.insight_events WHERE coupon_code=$2) events,(SELECT count(*)::int FROM recap.insight_coupons WHERE code=$2) coupons',[ids,code]);
    await writeFile(out+'/result.json',JSON.stringify({success,ready,dependencyFixtures:['ChzzkClient','InsightService','LabClient'],cases,logsWritten:logs,remaining},null,2));
    assert.equal(logs,0);assert.ok(Object.values(remaining).every(n=>n===0));
    if(before)assert.deepEqual(await liveState(),before);
    await db.destroy();console.log(JSON.stringify({success,logsWritten:logs,remaining}));
  }
  if(app) await app.close();
}
