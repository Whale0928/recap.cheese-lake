import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchShare, grantShare, revokeShare, subjectParticle, SHARE_EXCLUDED, SHARE_FINE_PRINT, SHARE_INCLUDED, SHARE_UNTIL, shareApiHref, sharedRecordApiHref, sharedRecordHref } from "../src/relationship.share.ts";

describe("스트리머 공유 동의 문구", () => {
  it("전해지는 내용에 잔디와 월별 기록, 닉네임을 적고 비율은 빼둔다", () => {
    const joined = SHARE_INCLUDED.join(" ");
    assert.ok(joined.includes("월별 기록"));
    assert.ok(joined.includes("최근 1년 날짜별 기록"));
    assert.ok(joined.includes("닉네임"));
    assert.ok(!joined.includes("비율"));
  });
  it("제외 항목과 기간, 거부권 안내가 모두 있다", () => {
    assert.ok(SHARE_EXCLUDED.includes("채팅 원문"));
    assert.ok(SHARE_EXCLUDED.includes("다른 방송"));
    assert.ok(SHARE_UNTIL.includes("해제"));
    assert.ok(SHARE_FINE_PRINT.includes("불이익"));
    assert.ok(SHARE_FINE_PRINT.includes("되돌려"));
  });
});

describe("공유 API 호출", () => {
  const id = "a".repeat(32);
  const calls: { url: string; init?: RequestInit }[] = [];
  const respond = (status: number, body: unknown) => (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }) as typeof fetch;
  it("이름의 받침에 따라 주격 조사를 고른다", () => {
    assert.equal(subjectParticle("아리사"), "가");
    assert.equal(subjectParticle("고래"), "가");
    assert.equal(subjectParticle("멍뭉이 4198533"), "이(가)");
    assert.equal(subjectParticle("시부킹"), "이");
    assert.equal(subjectParticle("Arisa"), "이(가)");
  });
  it("주소는 채널 ID만 담는다", () => {
    assert.equal(shareApiHref(id), `/api/me/channels/${id}/share`);
    assert.equal(sharedRecordHref(id), `/recap/shared/?owner=${id}`);
    assert.equal(sharedRecordApiHref(id), `/api/me/shares/received/${id}/record`);
  });
  it("동의는 PUT 본문에 consent: true 를 싣고 응답의 동의 시각을 돌려준다", async () => {
    calls.length = 0;
    const share = await grantShare(id, respond(200, { share: { consentedAt: "2026-10-27T00:00:00.000Z" } }));
    assert.deepEqual(share, { consentedAt: "2026-10-27T00:00:00.000Z" });
    assert.equal(calls[0]?.init?.method, "PUT");
    assert.equal(calls[0]?.init?.body, JSON.stringify({ consent: true }));
    assert.equal(calls[0]?.init?.credentials, "same-origin");
    await assert.rejects(grantShare(id, respond(503, {})));
    await assert.rejects(grantShare(id, respond(200, { share: null })));
  });
  it("해제는 DELETE 이고 실패하면 예외를 던진다", async () => {
    calls.length = 0;
    await revokeShare(id, respond(200, { revoked: true }));
    assert.equal(calls[0]?.init?.method, "DELETE");
    await assert.rejects(revokeShare(id, respond(500, {})));
  });
  it("상태 조회는 share 가 없으면 null 을 준다", async () => {
    const signal = new AbortController().signal;
    assert.equal(await fetchShare(id, signal, respond(200, { share: null })), null);
    assert.deepEqual(await fetchShare(id, signal, respond(200, { share: { consentedAt: "2026-10-27T00:00:00.000Z" } })), { consentedAt: "2026-10-27T00:00:00.000Z" });
    await assert.rejects(fetchShare(id, signal, respond(401, {})));
  });
});
