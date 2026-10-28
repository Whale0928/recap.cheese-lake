import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { storableImage } from "../database/chzzk-account.store.js";

export interface ShareGrant { consentedAt: string }
export interface ReceivedShare { ownerChannelId: string; ownerChannelName: string | null; ownerChannelImageUrl: string | null; consentedAt: string }
type ShareRow = { consented_at: Date };
type ReceivedRow = { owner_channel_id: string; channel_name: string | null; channel_image_url: string | null; consented_at: Date };
const toGrant = (row: ShareRow): ShareGrant => ({ consentedAt: new Date(row.consented_at).toISOString() });

// 목록과 존재 여부가 같은 기준으로 현재 열람 가능한 공유를 판정한다.
const RECEIVED_SHARES = `
  FROM recap.recap_shares s JOIN recap.chzzk_accounts a ON a.channel_id = s.owner_channel_id
  WHERE s.recipient_channel_id = $1
    AND NOT EXISTS (SELECT 1 FROM recap.privacy_requests p WHERE p.channel_id = s.owner_channel_id AND p.restriction_released_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM recap.account_restrictions r WHERE r.channel_id = s.owner_channel_id AND r.released_at IS NULL)
`;

// 소유자(시청자)·수신자(스트리머) 한 쌍의 현재 동의 하나를 다룬다. 기간·항목·스냅샷은 없고, 있으면 보여 주고 지우면 끝이다.
@Injectable()
export class ShareStore {
  constructor(@Inject(DataSource) private readonly source: DataSource | null) {}

  private db(): DataSource {
    if (!this.source) throw new ServiceUnavailableException("Database unavailable");
    return this.source;
  }

  async grant(owner: string, recipient: string): Promise<ShareGrant> {
    // 활동 기록과 같은 방식으로 계정 참조를 먼저 보장한다. 다시 동의하면 시각만 갱신한다.
    const rows: ShareRow[] = await this.db().query(`
      WITH account AS (INSERT INTO recap.chzzk_accounts (channel_id) VALUES ($1) ON CONFLICT (channel_id) DO NOTHING)
      INSERT INTO recap.recap_shares (owner_channel_id, recipient_channel_id) VALUES ($1, $2)
      ON CONFLICT (owner_channel_id, recipient_channel_id) DO UPDATE SET consented_at = CURRENT_TIMESTAMP
      RETURNING consented_at
    `, [owner, recipient]);
    if (!rows[0]) throw new ServiceUnavailableException("Share unavailable");
    return toGrant(rows[0]);
  }

  async revoke(owner: string, recipient: string): Promise<boolean> {
    const rows = await this.db().query("DELETE FROM recap.recap_shares WHERE owner_channel_id = $1 AND recipient_channel_id = $2 RETURNING consented_at", [owner, recipient]);
    return (Array.isArray(rows[0]) ? rows[0] : rows).length > 0;
  }

  async status(owner: string, recipient: string): Promise<ShareGrant | null> {
    if (!this.source) return null;
    const rows: ShareRow[] = await this.source.query("SELECT consented_at FROM recap.recap_shares WHERE owner_channel_id = $1 AND recipient_channel_id = $2", [owner, recipient]);
    return rows[0] ? toGrant(rows[0]) : null;
  }

  // 수신자 화면 목록. 소유자 이름은 로그인 시 저장한 닉네임이다.
  // 수집 거부를 요청했거나 이용이 제한된 소유자는 기록 조회가 막히므로 목록에서도 뺀다(AccessStore.restriction 과 같은 기준).
  async received(recipient: string): Promise<ReceivedShare[]> {
    if (!this.source) return [];
    const rows: ReceivedRow[] = await this.source.query(`
      SELECT s.owner_channel_id, a.channel_name, a.channel_image_url, s.consented_at
      ${RECEIVED_SHARES}
      ORDER BY s.consented_at DESC LIMIT 200
    `, [recipient]);
    return rows.map(row => ({ ownerChannelId: row.owner_channel_id, ownerChannelName: row.channel_name?.trim() || null, ownerChannelImageUrl: storableImage(row.channel_image_url), consentedAt: new Date(row.consented_at).toISOString() }));
  }

  async receivedExists(recipient: string): Promise<boolean> {
    const rows: { exists: boolean }[] = await this.db().query(`SELECT EXISTS (SELECT 1 ${RECEIVED_SHARES}) AS exists`, [recipient]);
    if (!rows[0]) throw new ServiceUnavailableException("Share unavailable");
    return rows[0].exists;
  }
}
