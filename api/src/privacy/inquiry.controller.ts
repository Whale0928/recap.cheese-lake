import { BadRequestException, Body, Controller, Get, Header, Inject, Post, Req, ServiceUnavailableException } from "@nestjs/common";
import type { Request } from "express";
import { DataSource } from "typeorm";
import { ActivityLogService } from "../database/activity-log.service.js";
import { ActivityType } from "../database/activity-log.types.js";
import { subject } from "./session.subject.js";

const TYPES = new Set(["question", "bug", "other"]);
const BODY_LIMIT = 2000;
type InquiryRow = { id: string; type: string; body: string; status: string; reply_body: string | null; replied_at: Date | null; created_at: Date };
const COLUMNS = "id, type, body, status, reply_body, replied_at, created_at";

function toInquiry(row: InquiryRow) {
  return { id: row.id, type: row.type, body: row.body, status: row.status, createdAt: new Date(row.created_at).toISOString(),
    reply: row.reply_body ? { body: row.reply_body, createdAt: new Date(row.replied_at ?? row.created_at).toISOString() } : null };
}

@Controller("api/inquiries")
export class InquiryController {
  constructor(@Inject(DataSource) private readonly source: DataSource | null, private readonly logs: ActivityLogService) {}

  private db(): DataSource {
    if (!this.source) throw new ServiceUnavailableException("Database unavailable");
    return this.source;
  }

  @Post()
  @Header("Cache-Control", "no-store")
  create(@Req() req: Request, @Body() payload: { type?: unknown; body?: unknown }) {
    const channelId = subject(req);
    const body = typeof payload?.body === "string" ? payload.body.trim() : "";
    if (typeof payload?.type !== "string" || !TYPES.has(payload.type) || !body || body.length > BODY_LIMIT) throw new BadRequestException("Invalid inquiry");
    const type = payload.type;
    return this.logs.track({ channelId, activityType: ActivityType.INQUIRY_CREATE }, async () => {
      // 활동 기록과 같은 방식으로 계정 참조를 먼저 보장한다. 저장된 프로필은 바꾸지 않는다.
      const rows: InquiryRow[] = await this.db().query(`
        WITH account AS (INSERT INTO recap.chzzk_accounts (channel_id) VALUES ($1) ON CONFLICT (channel_id) DO NOTHING)
        INSERT INTO recap.inquiries (channel_id, type, body) VALUES ($1, $2, $3) RETURNING ${COLUMNS}
      `, [channelId, type, body]);
      return toInquiry(rows[0]!);
    });
  }

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Req() req: Request) {
    const channelId = subject(req);
    return this.logs.track({ channelId, activityType: ActivityType.INQUIRY_LIST_VIEW }, async () => {
      const rows: InquiryRow[] = await this.db().query(`SELECT ${COLUMNS} FROM recap.inquiries WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 50`, [channelId]);
      return { inquiries: rows.map(toInquiry) };
    });
  }
}
