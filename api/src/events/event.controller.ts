import { BadRequestException, Body, Controller, Header, HttpCode, Module, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { SessionAuthGuard } from "../activity/activity.controller.js";
import { ActivityModule } from "../activity/activity.module.js";
import { InsightService } from "../insight/insight.service.js";
import { EventStore } from "./event.store.js";
import { EventService } from "./event.service.js";
import { EventConditionFactory } from "./event-condition.factory.js";
@Controller("api/me/events")
@UseGuards(SessionAuthGuard)
export class EventController {
  constructor(private readonly events: EventService) {}
  @Post("entry")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  enter(@Req() req: Request, @Query() query: Record<string, unknown>, @Body() body: unknown) {
    if (Object.keys(query).length || body !== undefined && (body === null || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)) throw new BadRequestException("Body and query must be empty");
    return this.events.enter(req.session.user!.channelId);
  }
}
@Module({ imports: [ActivityModule], controllers: [EventController], providers: [EventStore, EventService, EventConditionFactory, InsightService] })
export class EventModule {}
