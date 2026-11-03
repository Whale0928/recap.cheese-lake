import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";

// 분석 티켓. 행 하나가 티켓 한 장이다(마이그레이션 AddInsightTickets). 발급(쿠폰 · 수동) · 차감 · 환불을 여기서 다 맡고,
// 랩은 티켓을 모른다. 질의는 전부 한 문장이라 트랜잭션 없이도 원자적이다.

export type RedeemResult =
  | { status: "granted"; granted: number; available: number }
  | { status: "already_redeemed" | "not_found" | "disabled" | "expired" | "exhausted" };

type CountRow = { n: string | number };
const count = (rows: CountRow[]) => Number(rows[0]?.n ?? 0);
const PG_UNIQUE_VIOLATION = "23505";

// 남은 티켓 = 아직 쓰지 않았고(used_at NULL) 만료가 지나지 않은 행.
const AVAILABLE = "channel_id = $1 AND used_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)";

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

  /** 쿠폰을 받는다. 받을 수 있는 쿠폰이면 수령 기록 · 장수만큼 티켓 · 수령 수를 한 문장으로 쓴다. 같은 쿠폰을 두 번 받으면 PK 가 막는다. */
  async redeem(channelId: string, code: string): Promise<RedeemResult> {
    let rows: { granted: string | number }[];
    try {
      rows = await this.db().query(`
        WITH coupon AS (
          SELECT code, tickets_per_redeem, ticket_valid_days FROM recap.insight_coupons
          WHERE code = $2 AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
          FOR UPDATE
        ), account AS (
          INSERT INTO recap.chzzk_accounts (channel_id) VALUES ($1) ON CONFLICT (channel_id) DO NOTHING
        ), redeemed AS (
          INSERT INTO recap.insight_coupon_redemptions (coupon_code, channel_id) SELECT code, $1 FROM coupon RETURNING coupon_code
        ), counted AS (
          UPDATE recap.insight_coupons c SET redemption_count = redemption_count + 1 FROM redeemed r WHERE c.code = r.coupon_code
        ), tickets AS (
          INSERT INTO recap.insight_tickets (channel_id, source, coupon_code, expires_at)
          SELECT $1, 'coupon', c.code,
                 CASE WHEN c.ticket_valid_days IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + make_interval(days => c.ticket_valid_days) END
          FROM coupon c, redeemed r, generate_series(1, c.tickets_per_redeem)
          RETURNING id
        )
        SELECT (SELECT count(*) FROM tickets) AS granted
      `, [channelId, code]);
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { code?: string }).code === PG_UNIQUE_VIOLATION) return { status: "already_redeemed" };
      throw error;
    }
    const granted = Number(rows[0]?.granted ?? 0);
    if (granted > 0) return { status: "granted", granted, available: await this.available(channelId) };
    // 못 받은 까닭을 사람에게 말하려고 한 번 더 본다. 그사이 바뀌었을 수 있으니 참고값이다.
    const found: { disabled: boolean; expired: boolean; exhausted: boolean }[] = await this.db().query(`
      SELECT disabled_at IS NOT NULL AS disabled, expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP AS expired,
             max_redemptions IS NOT NULL AND redemption_count >= max_redemptions AS exhausted
      FROM recap.insight_coupons WHERE code = $1
    `, [code]);
    const c = found[0];
    if (!c) return { status: "not_found" };
    if (c.disabled) return { status: "disabled" };
    if (c.expired) return { status: "expired" };
    if (c.exhausted) return { status: "exhausted" };
    return { status: "not_found" };
  }

  /** 티켓 한 장을 쓴다(만료 빠른 것부터). 없으면 null. 랩 요청 번호는 넣은 뒤 attach 로 적는다. */
  async consume(channelId: string): Promise<string | null> {
    const rows: { id: string }[] = await this.db().query(`
      UPDATE recap.insight_tickets SET used_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM recap.insight_tickets WHERE ${AVAILABLE} ORDER BY expires_at NULLS LAST, issued_at LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id
    `, [channelId]);
    return rows[0]?.id ?? null;
  }

  /** 넣은 요청 번호를 티켓에 적는다. */
  async attach(ticketId: string, labRequestId: number): Promise<void> {
    await this.db().query("UPDATE recap.insight_tickets SET lab_request_id = $2 WHERE id = $1", [ticketId, labRequestId]);
  }

  /** 대기열에 넣지 못했으면(랩이 새 요청을 만들지 않았거나 오류) 쓴 표시를 지워 되돌린다. 환불이 아니라 쓰지 않은 것이다. */
  async release(ticketId: string): Promise<void> {
    await this.db().query("UPDATE recap.insight_tickets SET used_at = NULL WHERE id = $1 AND lab_request_id IS NULL", [ticketId]);
  }

  /** 실패로 끝난 요청의 티켓을 환불한다. 쓴 행은 두고 refund 행을 새로 준다. 이미 환불했으면 아무것도 안 하고 0 이다. */
  async refund(channelId: string, labRequestId: number): Promise<number> {
    if (!this.source) return 0;
    const rows: { id: string }[] = await this.source.query(`
      INSERT INTO recap.insight_tickets (channel_id, source, refund_of_ticket_id, expires_at)
      SELECT channel_id, 'refund', id, expires_at FROM recap.insight_tickets
      WHERE channel_id = $1 AND lab_request_id = $2 AND source <> 'refund'
      ON CONFLICT (refund_of_ticket_id) DO NOTHING
      RETURNING id
    `, [channelId, labRequestId]);
    return rows.length;
  }
}
