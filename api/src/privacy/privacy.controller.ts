import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Global, Header, HttpCode, Module, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { ActivityLogService } from "../database/activity-log.service.js";
import { ActivityType } from "../database/activity-log.types.js";
import { AccessStore, type PrivacyRequest } from "./access.store.js";
import { InquiryController } from "./inquiry.controller.js";
import { subject } from "./session.subject.js";

@Controller("api")
export class PrivacyController {
  constructor(private readonly access: AccessStore, private readonly logs: ActivityLogService) {}

  @Post("me/privacy/requests")
  @Header("Cache-Control", "no-store")
  create(@Req() req: Request, @Body() body: { type?: unknown }): Promise<{ request: PrivacyRequest }> {
    const channelId = subject(req);
    const type = body?.type;
    if (type !== "delete" && type !== "delete_and_exclude") throw new BadRequestException("Invalid privacy request type");
    return this.logs.track({ channelId, activityType: ActivityType.PRIVACY_REQUEST }, async () => ({ request: await this.access.requestPrivacy(channelId, type) }));
  }

  @Delete("me/privacy/requests")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  cancel(@Req() req: Request) {
    const channelId = subject(req);
    return this.logs.track({ channelId, activityType: ActivityType.PRIVACY_REQUEST_CANCEL }, async () => {
      if (!await this.access.requestCancel(channelId)) throw new ConflictException("No cancelable privacy request");
      return { cancelRequested: true };
    });
  }

  // 법적 문서는 정적 화면이라 서버를 거치지 않는다. 로그인한 이용자가 열람한 사실만 화면이 알려 기록한다.
  @Post("activity/page-views")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  async pageView(@Req() req: Request, @Body() body: { page?: unknown }): Promise<void> {
    const activityType = body?.page === "privacy" ? ActivityType.PRIVACY_POLICY_VIEW : body?.page === "terms" ? ActivityType.TERMS_VIEW : null;
    if (!activityType) throw new BadRequestException("Invalid page");
    const { user, expiresAt } = req.session;
    if (!user || !expiresAt || expiresAt <= Date.now()) return;
    await this.logs.track({ channelId: user.channelId, activityType }, async () => undefined);
  }

  @Get("me/privacy/requests")
  @Header("Cache-Control", "no-store")
  async current(@Req() req: Request): Promise<{ request: PrivacyRequest | null }> {
    return { request: await this.access.privacyRequest(subject(req)) };
  }
}

@Global()
@Module({ controllers: [PrivacyController, InquiryController], providers: [AccessStore], exports: [AccessStore] })
export class PrivacyModule {}

