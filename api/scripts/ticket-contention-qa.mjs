// 실행은 명시적 opt-in만 허용한다. 기존 DB에 전용 테스트 행을 만들고 finally에서 정리한다.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/app.js';
import { AuthConfig } from '../dist/auth/auth.config.js';
import { ChzzkClient } from '../dist/auth/chzzk.client.js';
import { LabConfig } from '../dist/activity/lab.config.js';
import { TicketStore } from '../dist/insight/ticket.store.js';
import { createDatabase } from '../dist/database/database.js';

if (process.env.RECAP_RUN_CONTENTION_QA !== '1') throw Error('Set RECAP_RUN_CONTENTION_QA=1 explicitly');
const address = new URL(process.env.RECAP_DATABASE_URL);
assert.equal(address.hostname, '127.0.0.1'); assert.equal(address.port, '5480');
assert.equal(address.pathname, '/development_cheese_lake');
process.env.NODE_ENV = 'development';
process.env.RECAP_LOCAL_AUTH_ENABLED = 'true';
process.env.RECAP_ACTIVITY_LOG_ENABLED = 'false';
const variant = process.argv.includes('--before') ? 'before' : 'after';
const run = 'QALOAD' + randomBytes(4).toString('hex').toUpperCase();
const output = process.env.RECAP_QA_OUTPUT ?? '/tmp/recap_contention_qa';
await mkdir(output, { recursive: true });
const accounts = [], coupons = [], observations = [];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const delay = ms => new Promise(r => setTimeout(r, ms));
const record = (name, value) => { observations.push({ name, ...value }); console.log(JSON.stringify({ name, ...value })); };
const db = createDatabase(address.href); db.options.applicationName = run;
const monitor = new pg.Client({ connectionString: address.href, application_name: run + '_monitor' });
let app, store, delayMs = 0, holdPost, postSeen, getSeen, failGet = false;
let nextRequest = 990000000;
const states = new Map();
const stub = createServer(async (req, res) => {
  try {
    const id = req.url.match(/channels\/([a-f0-9]{32})\/insight/)?.[1];
    if (!id) { res.writeHead(404).end(); return; }
    if (req.method === 'POST') {
      if (holdPost) { const pending = holdPost; postSeen.resolve(); await pending.promise; res.writeHead(503).end(); return; }
      const value = { channelId: id, requestId: ++nextRequest, state: 'waiting', enqueuedAt: new Date().toISOString() };
      states.set(id, value); res.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify(value)); return;
    }
    getSeen?.resolve(); await delay(delayMs);
    if (failGet) { res.writeHead(503).end(); return; }
    const value = states.get(id);
    if (!value) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
  } catch { res.writeHead(500).end(); }
});
const id = () => { const value = randomBytes(16).toString('hex'); accounts.push(value); return value; };
const coupon = async (suffix, allowTickets = false, allowReview = false, max = 1) => {
  const code = run + suffix; coupons.push(code);
  await db.query(`INSERT INTO recap.insight_coupons(code,tickets_per_redeem,max_redemptions,created_by,note,allow_with_available_tickets,allow_with_completed_review) VALUES($1,1,$2,$3::text,$3::text,$4,$5)`, [code,max,run,allowTickets,allowReview]); return code;
};
const seed = async account => {
  await db.query('INSERT INTO recap.chzzk_accounts(channel_id) VALUES($1)', [account]);
  return (await db.query("INSERT INTO recap.insight_tickets(channel_id,source,note) VALUES($1,'manual',$2) RETURNING id", [account,run]))[0].id;
};
const login = async account => {
  const r = await fetch('http://127.0.0.1:8180/_dev/login', { method: 'POST', redirect: 'manual', headers: { Origin: 'http://localhost:8180', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({channelId:account}) });
  assert.equal(r.status,303); return r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
};
const post = async (cookie, path, body) => {
  const start = performance.now();
  const r = await fetch('http://127.0.0.1:8180' + path, { method: 'POST', headers: { Cookie:cookie, 'Content-Type':'application/json' }, body:JSON.stringify(body), signal:AbortSignal.timeout(60000) });
  return { http:r.status, body:await r.json(), ms:performance.now()-start };
};
const redeem = (cookie, code) => post(cookie,'/api/me/insight/redeem',{code});
const poolState = async () => (await monitor.query(`SELECT count(*) FILTER(WHERE state='idle in transaction')::int idle_tx, count(*) FILTER(WHERE wait_event_type='Lock')::int lock_waiters FROM pg_stat_activity WHERE application_name=$1`, [run])).rows[0];
let success = false;
try {
  await db.initialize(); await monitor.connect();
  assert.equal((await db.query('SELECT current_database() name'))[0].name,'development_cheese_lake');
  assert.equal(Number((await db.query("SELECT count(*) n FROM information_schema.columns WHERE table_schema='recap' AND table_name='insight_coupons' AND column_name LIKE 'allow_with_%'"))[0].n),2);
  let implementation = new TicketStore(db);
  if (variant === 'before') {
    const { default: ts } = await import('typescript');
    const source = await readFile('/tmp/recap_ticket_before.ts','utf8');
    let js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText;
    for (const name of ['@nestjs/common','typeorm']) js=js.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
    const path=output+'/baseline.mjs';await writeFile(path,js);
    implementation=new (await import(pathToFileURL(path).href)).TicketStore(db);
    record('baseline_source',{sha256:createHash('sha256').update(source).digest('hex')});
  }
  await new Promise(r=>stub.listen(8182,'127.0.0.1',r));
  const module=await Test.createTestingModule({imports:[AppModule.register()]})
    .overrideProvider(DataSource).useValue(db)
    .overrideProvider(TicketStore).useValue(implementation)
    .overrideProvider(AuthConfig).useValue({sessionKey:randomBytes(32).toString('hex'),successUrl:'http://localhost:8180/',secureCookie:false,allowedPeer:()=>true,allowedOrigins:['http://localhost:8180'],sessionTtlMs:3600000,sessionAbsoluteTtlMs:3600000,sessionRotationMs:3600000})
    .overrideProvider(ChzzkClient).useValue({getChannel:async channelId=>({channelId,channelName:'부하 검증 계정',channelImageUrl:null,followerCount:0,verifiedMark:false})})
    .overrideProvider(LabConfig).useValue({baseUrl:'http://127.0.0.1:8182',apiKey:'clk_'+ 'a'.repeat(64)})
    .compile();
  app=module.createNestApplication({logger:false}); await configureApp(app); await app.listen(8180,'127.0.0.1'); store=app.get(TicketStore);

  // 임시 차감 → 쿠폰 등록 → 랩 실패 → 복구의 순서를 HTTP 경계에서 고정한다.
  {
    const account=id();await seed(account);const code=await coupon('RACE');const cookie=await login(account);
    holdPost=deferred();postSeen=deferred();const analysis=post(cookie,'/api/me/insight',{consent:true});await postSeen.promise;
    const received=await redeem(cookie,code);holdPost.resolve();await analysis;holdPost=null;
    const balance=await store.available(account);
    record('consume_redeem_release',{couponHttp:received.http,couponCode:received.body.code,balance});
    assert.equal(balance,variant==='before'?2:1);assert.equal(received.http,variant==='before'?200:409);
  }
  // 랩 조회 전후에 티켓 상태가 변하면 이전 응답으로 지급하지 않는다.
  if (variant==='after') {
    const account=id(),ticket=await seed(account),code=await coupon('SNAP',true);
    const gate=deferred(),seen=deferred();const pending=store.redeem(account,code,async()=>{seen.resolve();await gate.promise;return 'none';});
    await seen.promise;assert.equal(await store.consume(account),ticket);await store.attach(ticket,++nextRequest);gate.resolve();
    const result=await pending;assert.equal(result.status,'eligibility_unavailable');record('changed_snapshot',{status:result.status});
    const account2=id(),ticket2=await seed(account2),code2=await coupon('REFUND',true);
    await store.consume(account2);await store.attach(ticket2,++nextRequest);const requestId=nextRequest;
    const gate2=deferred(),seen2=deferred();const pending2=store.redeem(account2,code2,async()=>{seen2.resolve();await gate2.promise;return 'none';});
    await seen2.promise;await store.refund(account2,requestId);gate2.resolve();assert.equal((await pending2).status,'analysis_failed');
    assert.equal(await store.refund(account2,requestId),0);record('refund_during_review',{status:'analysis_failed',duplicateRefund:0});
    const account3=id(),code3=await coupon('DISABLE'),gate3=deferred(),seen3=deferred();
    const pending3=store.redeem(account3,code3,async()=>{seen3.resolve();await gate3.promise;return 'none';});
    await seen3.promise;await db.query('UPDATE recap.insight_coupons SET disabled_at=clock_timestamp() WHERE code=$1',[code3]);gate3.resolve();assert.equal((await pending3).status,'disabled');record('coupon_changed_during_review',{status:'disabled'});
  }
  // 풀 5개가 모두 느린 랩을 기다리는 동안 일반 SQL이 대기하는지 측정한다.
  {
    delayMs=500;getSeen=deferred();const code=await coupon('POOL',false,false,5);const cookies=await Promise.all(Array.from({length:5},()=>login(id())));
    const jobs=cookies.map(c=>redeem(c,code));await getSeen.promise;await delay(40);
    const state=await poolState(),start=performance.now();await db.query('SELECT 1');const probeMs=performance.now()-start;
    await Promise.all(jobs);record('slow_lab_pool',{...state,probeMs:Math.round(probeMs)});
    if(variant==='after'){assert.equal(state.idle_tx,0);assert.equal(state.lock_waiters,0);assert.ok(probeMs<500);}
    getSeen=null;
  }
  // 같은 쿠폰으로 단계마다 두 차례 실행하고 응답 시간과 발급 상한을 확인한다.
  for (const concurrency of [1,5,10,20,50]) {
    delayMs=150;const elapsed=[],statuses={};const stageStart=performance.now();let issued=0;
    for(let round=0;round<2;round++){
      const max=Math.max(1,Math.ceil(concurrency/2)),code=await coupon('L'+concurrency+'R'+round,false,false,max);
      const cookies=await Promise.all(Array.from({length:concurrency},()=>login(id())));
      const responses=await Promise.all(cookies.map(c=>redeem(c,code)));
      for(const r of responses){elapsed.push(r.ms);statuses[r.http]=(statuses[r.http]??0)+1;if (variant === 'after') assert.ok([200,409].includes(r.http));}
      const granted=responses.filter(r=>r.http===200).length;if (variant === 'after') assert.equal(granted,max); else assert.ok(granted<=max);issued+=granted;
      const counts=(await db.query('SELECT redemption_count,(SELECT count(*) FROM recap.insight_coupon_redemptions WHERE coupon_code=$1) redemptions,(SELECT count(*) FROM recap.insight_tickets WHERE coupon_code=$1) tickets FROM recap.insight_coupons WHERE code=$1',[code]))[0];
      assert.equal(counts.redemption_count,granted);assert.equal(Number(counts.redemptions),granted);assert.equal(Number(counts.tickets),granted);
    }
    elapsed.sort((a,b)=>a-b);const pct=p=>Math.round(elapsed[Math.ceil(elapsed.length*p)-1]);const duration=performance.now()-stageStart;
    record('load',{concurrency,requests:elapsed.length,issued,statuses,p50Ms:pct(.5),p95Ms:pct(.95),maxMs:Math.round(elapsed.at(-1)),stageMs:Math.round(duration),httpRequestsPerSec:+(elapsed.length/(duration/1000)).toFixed(2)});
  }
  if(variant==='after'){
    const account=id(),cookie=await login(account),code=await coupon('DUP',true,true);delayMs=50;
    const responses=await Promise.all(Array.from({length:20},()=>redeem(cookie,code)));
    assert.equal(responses.filter(r=>r.http===200).length,1);assert.equal(await store.available(account),1);record('same_account_duplicate',{requests:20,granted:1});
    const account2=id(),cookie2=await login(account2);const codes=await Promise.all(Array.from({length:10},(_,i)=>coupon('CROSS'+i)));
    const cross=await Promise.all(codes.map(code=>redeem(cookie2,code)));assert.equal(cross.filter(r=>r.http===200).length,1);assert.equal(await store.available(account2),1);record('cross_coupon_same_account',{requests:10,granted:1});
    failGet=true;const failed=await redeem(await login(id()),await coupon('FAIL'));assert.equal(failed.http,503);record('lab_failure',{http:failed.http,code:failed.body.code});failGet=false;
  }
  const logs=Number((await db.query('SELECT count(*) n FROM recap.activity_logs WHERE channel_id=ANY($1::text[])',[accounts]))[0].n);assert.equal(logs,0);record('activity_logs',{rows:logs});
  success=true;
}catch(error){record('failure',{message:error instanceof assert.AssertionError?error.message:error.name,code:error.code,queryPrefix:typeof error.query==='string'?error.query.slice(0,100):undefined,stack:typeof error.stack==='string'?error.stack.split('\n').filter(l=>l.includes('ticket-contention-qa')).slice(0,2):[]});process.exitCode=1;}
finally{
  holdPost?.resolve();
  try { if(app) await app.close(); } catch(error) { record('shutdown_failure',{name:error.name}); process.exitCode=1; }
  await new Promise(r=>stub.close(r));
  // Nest가 주입한 DataSource를 닫았으면 정리용 연결을 별도로 연다.
  const cleanup=new pg.Client({connectionString:address.href});
  try{
    await cleanup.connect();await cleanup.query('BEGIN');
    await cleanup.query('DELETE FROM recap.insight_consents WHERE channel_id=ANY($1::text[])',[accounts]);
    await cleanup.query('DELETE FROM recap.insight_tickets WHERE channel_id=ANY($1::text[])',[accounts]);
    await cleanup.query('DELETE FROM recap.insight_coupon_redemptions WHERE coupon_code=ANY($1::text[])',[coupons]);
    await cleanup.query('DELETE FROM recap.insight_coupons WHERE code=ANY($1::text[]) AND created_by=$2',[coupons,run]);
    await cleanup.query('DELETE FROM recap.chzzk_accounts WHERE channel_id=ANY($1::text[])',[accounts]);
    const remaining=(await cleanup.query(`SELECT (SELECT count(*) FROM recap.chzzk_accounts WHERE channel_id=ANY($1::text[])) accounts,(SELECT count(*) FROM recap.insight_tickets WHERE channel_id=ANY($1::text[])) tickets,(SELECT count(*) FROM recap.insight_coupon_redemptions WHERE channel_id=ANY($1::text[])) redemptions,(SELECT count(*) FROM recap.insight_coupons WHERE code=ANY($2::text[])) coupons,(SELECT count(*) FROM recap.insight_consents WHERE channel_id=ANY($1::text[])) consents,(SELECT count(*) FROM recap.activity_logs WHERE channel_id=ANY($1::text[])) logs,(SELECT count(*) FROM public.llm_requests WHERE target_user_id=ANY($1::text[])) llm_requests`,[accounts,coupons])).rows[0];
    assert.ok(Object.values(remaining).every(n=>Number(n)===0));await cleanup.query('COMMIT');record('cleanup',{remaining,success:true});
  }catch(error){await cleanup.query('ROLLBACK');record('cleanup_failure',{name:error.name});process.exitCode=1;}
  finally{await cleanup.end();if(db.isInitialized)await db.destroy();await monitor.end();}
  await writeFile(output+'/'+variant+'.json',JSON.stringify({run,variant,success,accounts,coupons,observations},null,2));
}
