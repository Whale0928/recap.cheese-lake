import { Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { ChzzkUser } from "../auth/auth.types.js";

// https 주소만, 너무 길지 않게 저장한다. 화면은 이 값을 그대로 <img> 에 쓰므로 그 밖의 값은 버린다.
export function storableImage(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
}

@Injectable()
export class ChzzkAccountStore {
  constructor(@Inject(DataSource) private readonly source: DataSource | null) {}

  async upsert(user: ChzzkUser): Promise<void> {
    if (!this.source) return;
    try {
      // 사진 주소를 이번에 가져오지 못했다면(null) 이전에 저장한 주소를 지우지 않는다.
      await this.source.query(`
        INSERT INTO recap.chzzk_accounts (channel_id, channel_name, channel_image_url) VALUES ($1, $2, $3)
        ON CONFLICT (channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name,
          channel_image_url = COALESCE(EXCLUDED.channel_image_url, recap.chzzk_accounts.channel_image_url), updated_at = CURRENT_TIMESTAMP
      `, [user.channelId, user.channelName, storableImage(user.channelImageUrl)]);
    } catch { Logger.warn("Account reference persistence failed", "ChzzkAccountStore"); }
  }
}
