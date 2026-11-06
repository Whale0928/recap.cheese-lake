import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { grantCouponTickets } from "../insight/coupon.grant.js";
import type { EventCandidate, EventGrant, EventViewer } from "./event.types.js";

const candidateColumns = `e.id::text AS id,e.title,e.coupon_code AS "couponCode",e.group_key AS "groupKey",
 e.condition_type AS "conditionType",e.condition_params AS "conditionParams",e.xmin::text||':'||md5(jsonb_build_array(c.code,c.tickets_per_redeem,c.ticket_valid_days,c.max_redemptions,c.expires_at,c.disabled_at,c.allow_with_available_tickets,c.allow_with_completed_review)::text) AS version,
 c.tickets_per_redeem AS "ticketsPerRedeem",c.ticket_valid_days AS "ticketValidDays"`;
@Injectable()
export class EventStore {
  constructor(@Inject(DataSource) private readonly source: DataSource | null) {}
  private db(): DataSource { if (!this.source) throw new ServiceUnavailableException("Database unavailable"); return this.source; }
  async candidates(): Promise<EventCandidate[]> {
    return this.db().query(`SELECT ${candidateColumns} FROM recap.insight_events e JOIN recap.insight_coupons c ON c.code=e.coupon_code
      WHERE c.disabled_at IS NULL AND e.starts_at<=clock_timestamp() AND (c.expires_at IS NULL OR c.expires_at>clock_timestamp())
      AND (c.max_redemptions IS NULL OR c.redemption_count<c.max_redemptions) ORDER BY e.group_key,e.sort_order,e.id LIMIT 500`);
  }
  async viewer(subject: string, manager = this.db().manager): Promise<EventViewer | null> {
    const rows: EventViewer[] = await manager.query(`SELECT s.balance,s.pending,s.version,
      EXISTS(SELECT 1 FROM recap.insight_coupon_redemptions r JOIN recap.insight_events e ON e.coupon_code=r.coupon_code
        WHERE r.channel_id=$1) AS "receivedEvent"
      FROM recap.chzzk_accounts a CROSS JOIN LATERAL (
        SELECT count(*) FILTER(WHERE used_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))::int AS balance,
        COALESCE(bool_or(used_at IS NOT NULL AND lab_request_id IS NULL),false) AS pending,
        md5(COALESCE(jsonb_agg(jsonb_build_array(id,used_at,lab_request_id,expires_at,source) ORDER BY id)::text,'[]')) AS version
        FROM recap.insight_tickets WHERE channel_id=$1
      )s WHERE a.channel_id=$1`, [subject]);
    return rows[0] ?? null;
  }
  async grant(subject: string, candidate: EventCandidate, viewer: EventViewer, recheck: (fresh: EventViewer) => boolean): Promise<EventGrant> {
    return this.db().transaction(async manager => {
      await manager.query("SET LOCAL lock_timeout='3s'");
      // 수동 쿠폰·분석 차감·환불과 같은 계정 잠금이다. 외부 API 호출은 이 안에서 하지 않는다.
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [subject]);
      const rows: (EventCandidate & { usable: boolean })[] = await manager.query(`SELECT ${candidateColumns},
        c.disabled_at IS NULL AND e.starts_at<=clock_timestamp() AND (c.expires_at IS NULL OR c.expires_at>clock_timestamp())
        AND (c.max_redemptions IS NULL OR c.redemption_count<c.max_redemptions) AS usable
        FROM recap.insight_events e JOIN recap.insight_coupons c ON c.code=e.coupon_code WHERE e.id=$1 FOR UPDATE OF c`, [candidate.id]);
      const current = rows[0];
      if (!current || current.version !== candidate.version) return { status: "hold" };
      if (!current.usable) return { status: "skip" };
      const fresh = await this.viewer(subject, manager);
      if (!fresh || fresh.version !== viewer.version) return { status: "hold" };
      if (fresh.pending) return { status: "hold" };
      if (!recheck(fresh)) return { status: "skip" };
      const tickets = await grantCouponTickets(manager, subject, current.couponCode, current.ticketsPerRedeem, current.ticketValidDays);
      return { status: "granted", tickets };
    });
  }
}
