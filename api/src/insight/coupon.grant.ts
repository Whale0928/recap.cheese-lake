import type { EntityManager } from "typeorm";

/** 호출자가 계정·쿠폰 잠금과 자격 검증을 끝낸 같은 트랜잭션에서만 호출한다. */
export async function grantCouponTickets(manager: EntityManager, channelId: string, code: string, quantity: number, validDays: number | null): Promise<number> {
  await manager.query("INSERT INTO recap.chzzk_accounts (channel_id) VALUES ($1) ON CONFLICT (channel_id) DO NOTHING", [channelId]);
  await manager.query("INSERT INTO recap.insight_coupon_redemptions (coupon_code, channel_id) VALUES ($1, $2)", [code, channelId]);
  await manager.query(`INSERT INTO recap.insight_tickets (channel_id, source, coupon_code, expires_at)
    SELECT $1, 'coupon', $2, CASE WHEN $3::integer IS NULL THEN NULL ELSE clock_timestamp() + make_interval(days => $3::integer) END
    FROM generate_series(1, $4::integer)`, [channelId, code, validDays, quantity]);
  await manager.query("UPDATE recap.insight_coupons SET redemption_count = redemption_count + 1 WHERE code = $1", [code]);
  const rows: { n: string | number }[] = await manager.query(`SELECT count(*) AS n FROM recap.insight_tickets WHERE channel_id = $1 AND used_at IS NULL AND (expires_at IS NULL OR expires_at > clock_timestamp())`, [channelId]);
  return Number(rows[0]?.n ?? 0);
}
