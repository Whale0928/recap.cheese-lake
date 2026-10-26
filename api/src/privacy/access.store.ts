import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { cidrMatcher } from "../runtime/network.config.js";

export type PrivacyRequestType = "delete" | "delete_and_exclude";
export type PrivacyRequest = { type: PrivacyRequestType; status: string; requestedAt: string; cancelableUntil: string; cancelRequestedAt?: string };
export type AccessRestriction = { kind: "privacy_request"; request: PrivacyRequest } | { kind: "suspended"; reason: string };

type PrivacyRow = { request_type: PrivacyRequestType; status: string; requested_at: Date; cancelable_until: Date; cancel_requested_at: Date | null };
const PRIVACY_COLUMNS = "request_type, status, requested_at, cancelable_until, cancel_requested_at";
const BLOCKLIST_TTL_MS = 60_000;

function toRequest(row: PrivacyRow): PrivacyRequest {
  return { type: row.request_type, status: row.status, requestedAt: new Date(row.requested_at).toISOString(), cancelableUntil: new Date(row.cancelable_until).toISOString(),
    ...(row.cancel_requested_at ? { cancelRequestedAt: new Date(row.cancel_requested_at).toISOString() } : {}) };
}

// 수집 거부, 운영자 이용 제한, 접속 차단을 한곳에서 판정한다. 화면 차단과 API 차단이 같은 기준을 쓰게 하려는 것이다.
@Injectable()
export class AccessStore {
  private blocklist: { matches: (address: string | undefined) => boolean; loadedAt: number } | null = null;
  private loading: Promise<void> | null = null;

  constructor(@Inject(DataSource) private readonly source: DataSource | null) {}

  private db(): DataSource {
    if (!this.source) throw new ServiceUnavailableException("Database unavailable");
    return this.source;
  }

  async privacyRequest(channelId: string): Promise<PrivacyRequest | null> {
    if (!this.source) return null;
    const rows: PrivacyRow[] = await this.source.query(`SELECT ${PRIVACY_COLUMNS} FROM recap.privacy_requests WHERE channel_id = $1 AND restriction_released_at IS NULL`, [channelId]);
    return rows[0] ? toRequest(rows[0]) : null;
  }

  // 운영자가 이용을 다시 열어 준 이전 요청은 새 요청으로 덮어쓴다. 차단 중인 요청은 바꾸지 않고 그대로 돌려준다.
  async requestPrivacy(channelId: string, type: PrivacyRequestType): Promise<PrivacyRequest> {
    const rows: PrivacyRow[] = await this.db().query(`
      INSERT INTO recap.privacy_requests (channel_id, request_type, cancelable_until)
      VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '7 days')
      ON CONFLICT (channel_id) DO UPDATE SET
        request_type = EXCLUDED.request_type, status = 'pending', requested_at = CURRENT_TIMESTAMP, cancelable_until = EXCLUDED.cancelable_until,
        cancel_requested_at = NULL, processing_started_at = NULL, completed_at = NULL, restriction_released_at = NULL, error_code = NULL
      WHERE recap.privacy_requests.restriction_released_at IS NOT NULL
      RETURNING ${PRIVACY_COLUMNS}
    `, [channelId, type]);
    if (rows[0]) return toRequest(rows[0]);
    const existing = await this.privacyRequest(channelId);
    if (!existing) throw new ServiceUnavailableException("Privacy request unavailable");
    return existing;
  }

  // 취소는 요청만 기록한다. 이용 재개는 운영자가 restriction_released_at을 채워야 이루어진다.
  async requestCancel(channelId: string): Promise<boolean> {
    const rows = await this.db().query(`
      UPDATE recap.privacy_requests SET status = 'cancel_requested', cancel_requested_at = CURRENT_TIMESTAMP
      WHERE channel_id = $1 AND status = 'pending' AND restriction_released_at IS NULL AND cancelable_until > CURRENT_TIMESTAMP
      RETURNING channel_id
    `, [channelId]);
    return (Array.isArray(rows[0]) ? rows[0] : rows).length > 0;
  }

  async restriction(channelId: string): Promise<AccessRestriction | null> {
    if (!this.source) return null;
    const request = await this.privacyRequest(channelId);
    if (request) return { kind: "privacy_request", request };
    const rows: { reason: string }[] = await this.source.query("SELECT reason FROM recap.account_restrictions WHERE channel_id = $1 AND released_at IS NULL", [channelId]);
    return rows[0] ? { kind: "suspended", reason: rows[0].reason } : null;
  }

  // 요청마다 DB를 읽지 않도록 차단 목록을 잠시 메모리에 둔다. 갱신에 실패하면 직전 목록을 계속 쓴다.
  async isBlocked(address: string | undefined): Promise<boolean> {
    if (!this.source) return false;
    if (!this.blocklist || Date.now() - this.blocklist.loadedAt > BLOCKLIST_TTL_MS) {
      this.loading ??= this.loadBlocklist().finally(() => { this.loading = null; });
      await this.loading;
    }
    return this.blocklist?.matches(address) ?? false;
  }

  private async loadBlocklist(): Promise<void> {
    try {
      const rows: { network: string }[] = await this.source!.query("SELECT network::text AS network FROM recap.blocked_networks WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP");
      const networks = rows.map(row => row.network).filter(Boolean);
      this.blocklist = { matches: networks.length ? cidrMatcher(networks.join(",")) : () => false, loadedAt: Date.now() };
    } catch {
      Logger.warn("Blocked network list unavailable", "AccessStore");
      if (this.blocklist) this.blocklist.loadedAt = Date.now();
    }
  }
}
