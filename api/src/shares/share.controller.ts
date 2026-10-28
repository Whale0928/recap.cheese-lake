import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Module, NotFoundException, Param, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ActivityModule } from "../activity/activity.module.js";
import { SessionAuthGuard } from "../activity/activity.controller.js";
import { channelRecord } from "../activity/channel.record.js";
import { LabClient } from "../activity/lab.client.js";
import type { ActivityResult, ChannelRecordResponse, ChannelRelationship } from "../activity/activity.types.js";
import { ActivityLogService } from "../database/activity-log.service.js";
import { ActivityType } from "../database/activity-log.types.js";
import { AccessStore } from "../privacy/access.store.js";
import { AuthModule } from "../auth/auth.module.js";
import { ChzzkClient } from "../auth/chzzk.client.js";
import { ChzzkAccountStore } from "../database/chzzk-account.store.js";
import { ShareStore, type ReceivedShare, type ShareGrant } from "./share.store.js";

const channelId = (value: string, message: string): string => {
  if (!/^[0-9a-f]{32}$/.test(value)) throw new BadRequestException(message);
  return value;
};
// 수신자에게는 동의 창에 적은 항목만 준다. 전체 채팅 중 비율과 전체 채팅 수는 다른 방송 활동을 드러내므로 뺀다.
export type SharedRelationship = Omit<ChannelRelationship["relationship"], "share" | "totalUserChatCount">;
export interface SharedRecordResponse extends Omit<ChannelRecordResponse, "record" | "profileRefresh"> {
  record: ActivityResult<{ channel: ChannelRelationship["channel"]; relationship: SharedRelationship }>;
  owner: { channelId: string; channelName: string | null };
  consentedAt: string;
}
export function sharedRecord(record: ChannelRecordResponse["record"]): SharedRecordResponse["record"] {
  if (record.status !== "ready") return record;
  const { firstActiveDate, lastActiveDate, chatCount, activeDays, longestConsecutiveActiveDays, mostActiveDay, mostActiveMonth } = record.data.relationship;
  return { status: "ready", data: { channel: record.data.channel, relationship: { firstActiveDate, lastActiveDate, chatCount, activeDays, longestConsecutiveActiveDays, mostActiveDay, mostActiveMonth } } };
}

// 공유는 "스트리머가 로그인하면 이 채널에서의 내 기록 화면을 그대로 본다"는 뜻이다. 주소만으로는 열리지 않고 동의 행이 있어야 한다.
@Controller("api/me")
@UseGuards(SessionAuthGuard)
export class ShareController {
  constructor(private readonly shares: ShareStore, private readonly lab: LabClient, private readonly logs: ActivityLogService, private readonly access: AccessStore, private readonly chzzk: ChzzkClient, private readonly accounts: ChzzkAccountStore) {}

  @Get("channels/:broadcastId/share")
  @Header("Cache-Control", "no-store")
  async status(@Req() req: Request, @Param("broadcastId") broadcastId: string, @Query() query: Record<string, unknown>): Promise<{ share: ShareGrant | null }> {
    if (Object.keys(query).length) throw new BadRequestException("Invalid share request");
    return { share: await this.shares.status(req.session.user!.channelId, channelId(broadcastId, "Invalid share request")) };
  }

  @Put("channels/:broadcastId/share")
  @Header("Cache-Control", "no-store")
  grant(@Req() req: Request, @Param("broadcastId") broadcastId: string, @Body() body: { consent?: unknown }): Promise<{ share: ShareGrant }> {
    const owner = req.session.user!.channelId;
    const recipient = channelId(broadcastId, "Invalid share request");
    // 동의 체크 없이 보낸 요청과 자기 자신에게 보여 주는 요청은 받지 않는다.
    if (body?.consent !== true) throw new BadRequestException("Consent required");
    if (recipient === owner) throw new BadRequestException("Cannot share with yourself");
    return this.logs.track({ channelId: owner, activityType: ActivityType.SHARE_GRANT }, async () => {
      const share = await this.shares.grant(owner, recipient);
      await this.saveProfileImage(req.session.user!);
      return { share };
    });
  }

  // 동의 창에 "내 닉네임과 프로필"이 전해진다고 적혀 있으므로, 공유하는 시점에 본인 프로필 사진 주소를 계정에 저장한다.
  // 사진은 보조 정보라서 가져오지 못해도 동의 자체는 그대로 성공한다.
  private async saveProfileImage(user: { channelId: string; channelName: string }): Promise<void> {
    const profile = await this.chzzk.getChannel(user.channelId).catch(() => null);
    if (profile?.channelImageUrl) await this.accounts.upsert({ channelId: user.channelId, channelName: user.channelName, channelImageUrl: profile.channelImageUrl });
  }

  @Delete("channels/:broadcastId/share")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  revoke(@Req() req: Request, @Param("broadcastId") broadcastId: string): Promise<{ revoked: boolean }> {
    const owner = req.session.user!.channelId;
    const recipient = channelId(broadcastId, "Invalid share request");
    return this.logs.track({ channelId: owner, activityType: ActivityType.SHARE_REVOKE }, async () => ({ revoked: await this.shares.revoke(owner, recipient) }));
  }

  @Get("shares/received")
  @Header("Cache-Control", "no-store")
  async received(@Req() req: Request, @Query() query: Record<string, unknown>): Promise<{ shares: ReceivedShare[] }> {
    if (Object.keys(query).length) throw new BadRequestException("Invalid share request");
    return { shares: await this.shares.received(req.session.user!.channelId) };
  }

  @Get("shares/received/exists")
  @Header("Cache-Control", "no-store")
  async receivedExists(@Req() req: Request, @Query() query: Record<string, unknown>): Promise<{ exists: boolean }> {
    if (Object.keys(query).length) throw new BadRequestException("Invalid share request");
    return { exists: await this.shares.receivedExists(req.session.user!.channelId) };
  }

  // 수신자가 보는 화면. 소유자의 기록을 소유자 자신의 조회와 같은 캐시·검증으로 가져오되, 동의 행과 소유자의 이용 제한 상태를 먼저 확인한다.
  @Get("shares/received/:ownerId/record")
  @Header("Cache-Control", "no-store")
  async record(@Req() req: Request, @Param("ownerId") ownerId: string, @Query() query: Record<string, unknown>): Promise<SharedRecordResponse> {
    if (Object.keys(query).length) throw new BadRequestException("Invalid shared record request");
    const recipient = req.session.user!.channelId;
    const owner = channelId(ownerId, "Invalid shared record request");
    return this.logs.track({ channelId: recipient, activityType: ActivityType.SHARED_RECORD_VIEW }, async () => {
      const share = (await this.shares.received(recipient)).find(item => item.ownerChannelId === owner);
      if (!share) throw new NotFoundException("Shared record not found");
      if (await this.access.restriction(owner)) throw new ForbiddenException("Shared record unavailable");
      // 프로필 재조회 일정은 본인 화면 전용 경로를 가리키므로 수신자 응답에는 싣지 않는다.
      const { fetchedAt, calendarPeriod, record, daily, monthly } = await channelRecord(this.lab, owner, recipient);
      return { fetchedAt, calendarPeriod, record: sharedRecord(record), daily, monthly, owner: { channelId: owner, channelName: share.ownerChannelName }, consentedAt: share.consentedAt };
    });
  }
}

@Module({ imports: [ActivityModule, AuthModule], controllers: [ShareController], providers: [ShareStore] })
export class ShareModule {}
