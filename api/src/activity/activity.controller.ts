import { CanActivate, Controller, Get, Header, Injectable, Query, Req, UnauthorizedException, UseGuards, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { activityPeriod, recapPeriod } from "./activity.query.js";
import { LabClient } from "./lab.client.js";
import type { RecapResponse, SummaryResponse } from "./activity.types.js";
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
  constructor(private readonly lab: LabClient) {}
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
    const period = recapPeriod(query);
    const subject = req.session.user!.channelId;
    const [summary, channels, trend, patterns] = await Promise.all([this.lab.get("summary", subject, period), this.lab.get("channels", subject, period), this.lab.get("trend", subject, period), this.lab.get("patterns", subject, period)]);
    return { period, fetchedAt: new Date().toISOString(), summary, channels, trend, patterns };
  }
}
