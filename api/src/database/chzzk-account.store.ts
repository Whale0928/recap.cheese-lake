import { Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { ChzzkUser } from "../auth/auth.types.js";

@Injectable()
export class ChzzkAccountStore {
  constructor(@Inject(DataSource) private readonly source: DataSource | null) {}

  async upsert(user: ChzzkUser): Promise<void> {
    if (!this.source) return;
    try {
      await this.source.query(`
        INSERT INTO recap.chzzk_accounts (channel_id, channel_name) VALUES ($1, $2)
        ON CONFLICT (channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name, updated_at = CURRENT_TIMESTAMP
      `, [user.channelId, user.channelName]);
    } catch { Logger.warn("Account reference persistence failed", "ChzzkAccountStore"); }
  }
}
