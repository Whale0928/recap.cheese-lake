import { grantCouponTickets } from "./coupon.grant.js";
import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

// 분석 티켓. 행 하나가 티켓 한 장이다(마이그레이션 AddInsightTickets). 발급(쿠폰 · 수동) · 차감 · 환불을 여기서 다 맡고,
// 랩은 티켓을 모른다. 쿠폰 지급은 계정별 잠금과 트랜잭션으로 조건 검사부터 발급까지 묶는다.

export type RedeemResult =
  | { status: "granted"; granted: number; available: number }
  | { status: "already_redeemed" | "not_found" | "event_only" | "disabled" | "expired" | "exhausted" | "available_tickets" | "completed_review" | "analysis_pending" | "analysis_failed" | "eligibility_unavailable" };

type CountRow = { n: string | number };
const count = (rows: CountRow[]) => Number(rows[0]?.n ?? 0);
export type CouponReviewState = "none" | "completed" | "pending" | "failed" | "unavailable";

type Coupon = {
  tickets_per_redeem: number;
  ticket_valid_days: number | null;
  allow_with_available_tickets: boolean;
  allow_with_completed_review: boolean;
  disabled: boolean;
  expired: boolean;
  exhausted: boolean;
};
type CouponInspection = Coupon & { event_only: boolean; already_redeemed: boolean; balance: number; has_refund: boolean; pending: boolean; version: string };
type Eligibility = { coupon: Coupon; version: string } | Exclude<RedeemResult, { status: "granted" }>;

// 남은 티켓 = 아직 쓰지 않았고(used_at NULL) 만료가 지나지 않은 행.
const AVAILABLE = "channel_id = $1 AND used_at IS NULL AND (expires_at IS NULL OR expires_at > clock_timestamp())";

@Injectable()
export class TicketStore {
  constructor(@Inject(DataSource) private readonly source: DataSource | null) {}

  private db(): DataSource {
    if (!this.source) throw new ServiceUnavailableException("Database unavailable");
    return this.source;
  }

  /** 남은 장수. DB 가 없으면 0 — 화면은 버튼을 잠근다. */
  async available(channelId: string): Promise<number> {
    if (!this.source) return 0;
    return count(await this.source.query(`SELECT count(*) AS n FROM recap.insight_tickets WHERE ${AVAILABLE}`, [channelId]));
  }

  private async locked<T>(channelId: string, work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.db().transaction(async manager => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [channelId]);
      return work(manager);
    });
  }

  /** 랩 조회 중에는 DB 연결·잠금을 놓는다. 돌아온 뒤 티켓 상태가 바뀌었으면 재시도를 요구한다. */
  async redeem(channelId: string, code: string, reviewState: () => Promise<CouponReviewState>): Promise<RedeemResult> {
    const inspect = async (manager: EntityManager, lockCoupon: boolean): Promise<Eligibility> => {
      const coupons: CouponInspection[] = await manager.query(`
        SELECT c.tickets_per_redeem, c.ticket_valid_days, c.allow_with_available_tickets, c.allow_with_completed_review,
          c.disabled_at IS NOT NULL AS disabled,
          c.expires_at IS NOT NULL AND c.expires_at <= clock_timestamp() AS expired,
          c.max_redemptions IS NOT NULL AND c.redemption_count >= c.max_redemptions AS exhausted,
          EXISTS (SELECT 1 FROM recap.insight_events e WHERE e.coupon_code = c.code) AS event_only,
          EXISTS (SELECT 1 FROM recap.insight_coupon_redemptions WHERE coupon_code = $1 AND channel_id = $2) AS already_redeemed,
          s.balance, s.has_refund, s.pending, s.version
        FROM recap.insight_coupons c
        CROSS JOIN LATERAL (
          SELECT count(*) FILTER (WHERE used_at IS NULL AND (expires_at IS NULL OR expires_at > clock_timestamp()))::int AS balance,
            COALESCE(bool_or(source = 'refund'), false) AS has_refund,
            COALESCE(bool_or(used_at IS NOT NULL AND lab_request_id IS NULL), false) AS pending,
            md5(COALESCE(jsonb_agg(jsonb_build_array(id, used_at, lab_request_id, expires_at, source) ORDER BY id)::text, '[]')) AS version
          FROM recap.insight_tickets WHERE channel_id = $2
        ) s
        WHERE c.code = $1 ${lockCoupon ? "FOR UPDATE OF c" : ""}
      `, [code, channelId]);
      const coupon = coupons[0];
      if (!coupon) return { status: "not_found" };
      if (coupon.event_only) return { status: "event_only" };
      if (coupon.already_redeemed) return { status: "already_redeemed" };
      if (coupon.disabled) return { status: "disabled" };
      if (coupon.expired) return { status: "expired" };
      if (coupon.exhausted) return { status: "exhausted" };
      if (coupon.balance > 0 && !coupon.allow_with_available_tickets) return { status: "available_tickets" };
      if (coupon.has_refund) return { status: "analysis_failed" };
      if (coupon.pending) return { status: "analysis_pending" };
      return { coupon, version: coupon.version };
    };
    // 첫 조회는 한 SQL의 일관된 snapshot이다. 지급 직전에는 계정 잠금 아래에서 다시 검사한다.
    const before = await inspect(this.db().manager, false);
    if ("status" in before) return before;
    const review = await reviewState();
    if (review === "unavailable") return { status: "eligibility_unavailable" };
    if (review === "pending") return { status: "analysis_pending" };
    if (review === "failed") return { status: "analysis_failed" };
    return this.locked(channelId, async manager => {
      const after = await inspect(manager, true);
      if ("status" in after) return after;
      if (before.version !== after.version) return { status: "eligibility_unavailable" };
      const { coupon } = after;
      if (review === "completed" && !coupon.allow_with_completed_review) return { status: "completed_review" };
      const available = await grantCouponTickets(manager, channelId, code, coupon.tickets_per_redeem, coupon.ticket_valid_days);
      return { status: "granted", granted: coupon.tickets_per_redeem, available };
    });
  }

  /** 티켓 한 장을 쓴다(만료 빠른 것부터). 없으면 null. 랩 요청 번호는 넣은 뒤 attach 로 적는다. */
  async consume(channelId: string): Promise<string | null> {
    // pg 드라이버는 UPDATE … RETURNING 을 [행들, 영향 수] 로 돌려준다 (share.store 의 revoke 와 같다). 행만 꺼낸다.
    return this.locked(channelId, async manager => {
      const out: unknown = await manager.query(`
        UPDATE recap.insight_tickets SET used_at = CURRENT_TIMESTAMP
        WHERE id = (SELECT id FROM recap.insight_tickets WHERE ${AVAILABLE} ORDER BY expires_at NULLS LAST, issued_at LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id
      `, [channelId]);
      const rows = (Array.isArray(out) && Array.isArray(out[0]) ? out[0] : out) as { id: string }[];
      return rows[0]?.id ?? null;
    });
  }

  /** 넣은 요청 번호를 티켓에 적는다. */
  async attach(ticketId: string, labRequestId: number): Promise<void> {
    await this.mutateTicket(ticketId, manager => manager.query("UPDATE recap.insight_tickets SET lab_request_id = $2 WHERE id = $1", [ticketId, labRequestId]));
  }

  /** 대기열에 넣지 못했으면(랩이 새 요청을 만들지 않았거나 오류) 쓴 표시를 지워 되돌린다. 환불이 아니라 쓰지 않은 것이다. */
  async release(ticketId: string): Promise<void> {
    await this.mutateTicket(ticketId, manager => manager.query("UPDATE recap.insight_tickets SET used_at = NULL WHERE id = $1 AND lab_request_id IS NULL", [ticketId]));
  }

  private async mutateTicket(ticketId: string, work: (manager: EntityManager) => Promise<unknown>): Promise<void> {
    const rows: { channel_id: string }[] = await this.db().query("SELECT channel_id FROM recap.insight_tickets WHERE id = $1", [ticketId]);
    if (rows[0]) await this.locked(rows[0].channel_id, work);
  }

  /** 실패로 끝난 요청의 티켓을 환불한다. 쓴 행은 두고 refund 행을 새로 준다. 이미 환불했으면 아무것도 안 하고 0 이다. */
  async refund(channelId: string, labRequestId: number): Promise<number> {
    if (!this.source) return 0;
    return this.locked(channelId, async manager => {
      const rows: { id: string }[] = await manager.query(`
        INSERT INTO recap.insight_tickets (channel_id, source, refund_of_ticket_id, expires_at)
        SELECT channel_id, 'refund', id, expires_at FROM recap.insight_tickets
        WHERE channel_id = $1 AND lab_request_id = $2 AND source <> 'refund'
        ON CONFLICT (refund_of_ticket_id) DO NOTHING
        RETURNING id
      `, [channelId, labRequestId]);
      return rows.length;
    });
  }
}
