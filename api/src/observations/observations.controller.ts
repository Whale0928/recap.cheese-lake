import { BadRequestException, Controller, Get, Module, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ActivityModule } from "../activity/activity.module.js";
import { ObservationsService } from "./observations.service.js";

@Controller("api/observations")
export class ObservationsController {
  constructor(private readonly observations: ObservationsService) {}
  @Get("daily")
  async daily(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    // 브라우저·CDN의 별도 TTL로 날짜 전환이나 Lab의 만료가 늦춰지지 않게 한다.
    res.setHeader("Cache-Control", "no-store");
    if (Object.keys(query).length) throw new BadRequestException("Query parameters are not supported");
    const result = await this.observations.get();
    res.setHeader("X-Recap-Cache", result.cache);
    return result.data;
  }
}
@Module({ imports: [ActivityModule], controllers: [ObservationsController], providers: [ObservationsService] })
export class ObservationsModule {}
