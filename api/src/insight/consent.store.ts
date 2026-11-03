import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";

// AI 분석 요청 때 한 동의 (마이그레이션 AddInsightConsents). 문구가 바뀌면 버전을 올린다 — 화면의 동의 창 문구와 짝이다.
export const INSIGHT_TERMS_VERSION = "2026.11.03";

@Injectable()
export class ConsentStore {
  constructor(@Inject(DataSource) private readonly source: DataSource | null) {}

  private db(): DataSource {
    if (!this.source) throw new ServiceUnavailableException("Database unavailable");
    return this.source;
  }

  /** 동의 한 건을 남기고 id 를 준다. 티켓이 없어 요청을 못 넣어도 동의한 사실은 남는다. */
  async record(channelId: string): Promise<string> {
    const rows: { id: string }[] = await this.db().query(`
      WITH account AS (INSERT INTO recap.chzzk_accounts (channel_id) VALUES ($1) ON CONFLICT (channel_id) DO NOTHING)
      INSERT INTO recap.insight_consents (channel_id, terms_version) VALUES ($1, $2) RETURNING id
    `, [channelId, INSIGHT_TERMS_VERSION]);
    if (!rows[0]) throw new ServiceUnavailableException("Consent unavailable");
    return rows[0].id;
  }

  /** 이 동의로 넣은 랩 요청 번호를 적는다. */
  async attach(consentId: string, labRequestId: number): Promise<void> {
    await this.db().query("UPDATE recap.insight_consents SET lab_request_id = $2 WHERE id = $1", [consentId, labRequestId]);
  }
}
