import { BadRequestException, Controller, Get, Header, Module, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ActivityModule } from "../activity/activity.module.js";
import { SessionAuthGuard } from "../activity/activity.controller.js";
import { TraitsService } from "./traits.service.js";

// 로그인한 본인의 시청 습관 라벨이다. 조회 주체는 세션에서만 정한다.
@Controller("api/me")
@UseGuards(SessionAuthGuard)
export class TraitsController {
  constructor(private readonly traits: TraitsService) {}
  @Get("traits")
  @Header("Cache-Control", "no-store")
  async get(@Req() req: Request, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw new BadRequestException("Query parameters are not supported");
    return { fetchedAt: new Date().toISOString(), traits: await this.traits.get(req.session.user!.channelId) };
  }
}
@Module({ imports: [ActivityModule], controllers: [TraitsController], providers: [TraitsService] })
export class TraitsModule {}
