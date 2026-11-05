import assert from "node:assert/strict";
import { test } from "node:test";
import { couponError, redeemCoupon } from "../src/coupon.ts";

test("코드 정규화와 서버 지급 결과", async () => {
  assert.deepEqual(await redeemCoupon(" gift2026 ", async (url, init) => {
    assert.equal(url, "/api/me/insight/redeem");
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(init?.body as string), { code: "GIFT2026" });
    return Response.json({ granted: 1, tickets: 2 });
  }), { ok: true, granted: 1, tickets: 2 });
});
test("빈 코드와 형식 오류는 요청하지 않는다", async () => {
  for (const code of ["", "   ", "ABC", "한글쿠폰", "A".repeat(33), "AB-CD"]) {
    assert.deepEqual(await redeemCoupon(code, async () => { assert.fail("요청 금지"); }), { ok: false, code: "invalid_code" });
  }
});
test("쿠폰 거절과 세션 만료를 구분한다", async () => {
  for (const code of ["coupon_already_redeemed", "coupon_expired", "coupon_exhausted", "coupon_disabled", "coupon_not_found", "coupon_available_tickets", "coupon_completed_review", "coupon_analysis_pending", "coupon_analysis_failed", "coupon_eligibility_unavailable"]) {
    assert.deepEqual(await redeemCoupon("DEMO", async () => Response.json({ code }, { status: 409 })), { ok: false, code });
    assert.notEqual(couponError(code), couponError("error"));
  }
  assert.deepEqual(await redeemCoupon("DEMO", async () => new Response("", { status: 401 })), { ok: false, code: "unauthorized" });
});
test("통신 실패와 잘못된 응답을 성공으로 표시하지 않는다", async () => {
  for (const request of [
    async () => { throw new TypeError("offline"); },
    async () => new Response("not JSON"),
    async () => Response.json({}),
    async () => Response.json({ granted: 0, tickets: 0 }),
    async () => Response.json({ granted: 1, tickets: -1 }),
    async () => Response.json({ granted: "1", tickets: 1 }),
  ]) assert.deepEqual(await redeemCoupon("DEMO", request), { ok: false, code: "error" });
});
