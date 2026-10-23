import { BadRequestException, CanActivate, Controller, Get, Header, Injectable, Param, Query, Req, UnauthorizedException, UseGuards, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { activityPeriod, recapPeriod } from "./activity.query.js";
import { LabClient } from "./lab.client.js";
import type { ChannelRecordResponse, RecapResponse, SummaryResponse } from "./activity.types.js";
import { ActivityLogService } from "../database/activity-log.service.js";
import { ActivityType, type ActivityOutcome, type ActivityErrorCode } from "../database/activity-log.types.js";
@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.session.user || !/^[0-9a-f]{32}$/.test(req.session.user.channelId) || !req.session.expiresAt || req.session.expiresAt <= Date.now()) throw new UnauthorizedException("Login required");
    return true;
  }
}
@Controller("api")
@UseGuards(SessionAuthGuard)
export class ActivityController {
  constructor(private readonly lab: LabClient, private readonly logs: ActivityLogService) {}
  @Get("me/activity/summary")
  @Header("Cache-Control", "no-store")
  async summary(@Req() req: Request, @Query() query: Record<string, unknown>): Promise<SummaryResponse> {
    const period = query.period === undefined ? activityPeriod(query, false) : recapPeriod(query);
    const summary = await this.lab.get("summary", req.session.user!.channelId, period);
    return { period, fetchedAt: new Date().toISOString(), summary };
  }
  @Get("me/activity/trend")
  @Header("Cache-Control", "no-store")
  async trend(@Req() req: Request, @Query() query: Record<string, unknown>) {
    const period = activityPeriod(query, false);
    const trend = await this.lab.get("trend", req.session.user!.channelId, period);
    return { period, fetchedAt: new Date().toISOString(), trend };
  }
  @Get("recap")
  @Header("Cache-Control", "no-store")
  async recap(@Req() req: Request, @Query() query: Record<string, unknown>): Promise<RecapResponse> {
    const subject = req.session.user!.channelId;
    return this.logs.track({ channelId: subject, activityType: ActivityType.RECAP_VIEW }, async () => {
      const period = recapPeriod(query);
      const [summary, activities] = await Promise.all([this.lab.get("summary", subject, period), this.lab.get("activities", subject, period)]);
      const channels = activities.status === "ready" ? { status: "ready" as const, data: { scope: activities.data.scope, totalChatCount: activities.data.totalChatCount, channels: activities.data.channels } } : activities;
      const trend = activities.status === "ready" ? { status: "ready" as const, data: { scope: activities.data.scope, ...activities.data.trend } } : activities;
      const patterns = activities.status === "ready" ? { status: "ready" as const, data: { scope: activities.data.scope, patterns: activities.data.patterns } } : activities;
      return { period, fetchedAt: new Date().toISOString(), summary, channels, trend, patterns };
    }, value => this.outcome(value));
  }

  @Get("me/channels/:broadcastId/record")
  @Header("Cache-Control", "no-store")
  async record(@Req() req: Request, @Param("broadcastId") broadcastId: string, @Query() query: Record<string, unknown>): Promise<ChannelRecordResponse> {
    if (!/^[0-9a-f]{32}$/.test(broadcastId) || Object.keys(query).length) throw new BadRequestException("Invalid channel record request");
    const subject = req.session.user!.channelId;
    const to = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const from = new Date(Date.parse(`${to}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10);
    const recent = activityPeriod({ from, to }, false);
    const all = recapPeriod({ period: "all" });
    const [record, daily, monthly] = await Promise.all([
      this.lab.get("relationship", subject, all, [broadcastId]),
      this.lab.get("trend", subject, recent, [broadcastId]),
      this.lab.get("trend", subject, { ...all, interval: "month" }, [broadcastId]),
    ]);
    return { fetchedAt: new Date().toISOString(), calendarPeriod: { from, to }, record, daily, monthly };
  }

  private outcome(value: RecapResponse): ActivityOutcome {
    const kinds = ["summary", "channels", "trend", "patterns"] as const;
    const failures = kinds.filter(kind => value[kind].status === "unavailable");
    if (!failures.length) return { result: "success" };
    const stage = failures[0]!;
    const result = value[stage];
    const codes: Record<"not_configured" | "rate_limited" | "upstream", ActivityErrorCode> = {
      not_configured: "ACTIVITY_NOT_CONFIGURED", rate_limited: "ACTIVITY_RATE_LIMITED", upstream: "ACTIVITY_UPSTREAM",
    };
    return { result: failures.length === kinds.length ? "failure" : "partial_success", failureStage: stage,
      errorCode: result.status === "unavailable" ? codes[result.reason] : "PROCESSING_FAILED" };
  }
}
