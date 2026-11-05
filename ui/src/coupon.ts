export const TICKETS_CHANGED = "recap:tickets-changed";
export type CouponResult = { ok: true; granted: number; tickets: number } | { ok: false; code: string };

export function couponError(code: string): string {
  const messages: Record<string, string> = {
    coupon_available_tickets: "사용 가능한 티켓이 있어 이 쿠폰을 받을 수 없어요.",
    coupon_completed_review: "이미 AI 리뷰를 받아 이 쿠폰을 받을 수 없어요.",
    coupon_analysis_pending: "AI 분석이 진행 중이라 지금은 받을 수 없어요.",
    coupon_analysis_failed: "분석 실패 또는 티켓 환불 이력이 있어 이 쿠폰을 받을 수 없어요.",
    coupon_eligibility_unavailable: "AI 분석 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
    coupon_not_found: "쿠폰 코드를 다시 확인해 주세요.",
    coupon_already_redeemed: "이미 받은 쿠폰이에요.",
    coupon_disabled: "지금은 사용할 수 없는 쿠폰이에요.",
    coupon_expired: "사용 기한이 지난 쿠폰이에요.",
    coupon_exhausted: "준비한 쿠폰이 모두 소진됐어요.",
    invalid_code: "영문과 숫자로 된 4~32자 코드를 입력해 주세요.",
    unauthorized: "로그인이 만료됐어요. 다시 로그인해 주세요.",
    error: "등록 결과를 확인하지 못했어요. 같은 코드로 다시 확인해 주세요.",
  };
  return messages[code] ?? messages.error;
}

export async function redeemCoupon(code: string, request: typeof fetch = fetch): Promise<CouponResult> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,32}$/.test(normalized)) return { ok: false, code: "invalid_code" };
  try {
    const response = await request("/api/me/insight/redeem", {
      method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code: normalized }),
    });
    if (response.status === 401) return { ok: false, code: "unauthorized" };
    const body = await response.json();
    if (!response.ok) return { ok: false, code: typeof body?.code === "string" ? body.code : "error" };
    if (!Number.isInteger(body?.granted) || body.granted < 1 || !Number.isInteger(body?.tickets) || body.tickets < 0) return { ok: false, code: "error" };
    return { ok: true, granted: body.granted, tickets: body.tickets };
  } catch {
    return { ok: false, code: "error" };
  }
}
