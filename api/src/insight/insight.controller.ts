import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, HttpCode, Module, NotFoundException, Post, Query, Req, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ActivityModule } from "../activity/activity.module.js";
import { SessionAuthGuard } from "../activity/activity.controller.js";
import { ActivityLogService } from "../database/activity-log.service.js";
import { ActivityType, type ActivityOutcome } from "../database/activity-log.types.js";
import { InsightService, type InsightResult } from "./insight.service.js";
import { TicketStore, type RedeemResult } from "./ticket.store.js";
import { ConsentStore } from "./consent.store.js";

export interface InsightResponse { fetchedAt: string; insight: InsightResult; tickets: number }
export interface RedeemResponse { granted: number; tickets: number }

const COUPON_CODE = /^[A-Z0-9]{4,32}$/;
const rejected = (errorCode: "NO_TICKET" | "COUPON_UNUSABLE", responseStatus = 403): ActivityOutcome => ({ result: "failure", failureStage: "request", errorCode, responseStatus });

// 로그인한 본인의 AI 분석 카드와 분석 티켓이다. 대상은 세션에서만 정하고 요청의 다른 ID 는 쓰지 않는다.
// 티켓은 리캡이 발급 · 차감 · 환불을 다 맡고 랩은 분석만 한다. 사람이 한 일(받기 · 요청)과 그에 따른 환불은 활동 로그에 남긴다.
@Controller("api/me")
@UseGuards(SessionAuthGuard)
export class InsightController {
  constructor(private readonly insight: InsightService, private readonly tickets: TicketStore, private readonly consents: ConsentStore, private readonly logs: ActivityLogService) {}

  @Get("insight")
  @Header("Cache-Control", "no-store")
  async get(@Req() req: Request, @Query() query: Record<string, unknown>): Promise<InsightResponse> {
    if (Object.keys(query).length) throw new BadRequestException("Query parameters are not supported");
    const channelId = req.session.user!.channelId;
    const insight = await this.insight.get(channelId);
    // 랩이 실패로 끝낸 요청이면 그때 쓴 티켓을 돌려준다. 같은 요청은 한 번만 돌려주므로 조회할 때마다 봐도 된다.
    if (insight.status === "ready" && insight.data?.state === "failed") {
      const refunded = await this.tickets.refund(channelId, insight.data.requestId);
      if (refunded > 0) await this.logs.track({ channelId, activityType: ActivityType.INSIGHT_TICKET_REFUND }, async () => undefined);
    }
    return { fetchedAt: new Date().toISOString(), insight, tickets: await this.tickets.available(channelId) };
  }

  // 본문은 { consent: true, refresh?: boolean } 다. 동의가 없으면 받지 않는다 — 채팅 원문이 외부 AI 로 나가는 일이라 동의를 먼저 남긴다.
  // 티켓 한 장을 쓰고 랩에 넣는다. 랩이 새 요청을 만들지 않았으면(대기 중 · 끝난 결과 재사용 · 오류) 티켓을 되돌린다.
  @Post("insight")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async request(@Req() req: Request, @Query() query: Record<string, unknown>, @Body() body: unknown): Promise<InsightResponse> {
    if (Object.keys(query).length) throw new BadRequestException("Query parameters are not supported");
    const b = body as { consent?: unknown; refresh?: unknown } | undefined;
    if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).some(k => k !== "refresh" && k !== "consent") || (b?.refresh !== undefined && typeof b.refresh !== "boolean") || typeof b?.consent !== "boolean") {
      throw new BadRequestException("Body must be { consent: boolean, refresh?: boolean }");
    }
    if (b.consent !== true) throw new BadRequestException({ code: "consent_required", message: "동의해야 요청할 수 있다" });
    const refresh = b.refresh === true;
    const channelId = req.session.user!.channelId;
    const outcome = await this.logs.track({ channelId, activityType: ActivityType.INSIGHT_REQUEST }, async (): Promise<{ kind: "no_ticket" } | { kind: "sent"; insight: InsightResult }> => {
      const consentId = await this.consents.record(channelId);
      const ticketId = await this.tickets.consume(channelId);
      if (!ticketId) return { kind: "no_ticket" };
      let insight: InsightResult;
      try { insight = await this.insight.request(channelId, refresh); }
      catch (error) { await this.tickets.release(ticketId); throw error; }
      if (insight.status === "ready" && insight.created && insight.data) {
        await this.tickets.attach(ticketId, insight.data.requestId);
        await this.consents.attach(consentId, insight.data.requestId);
      } else await this.tickets.release(ticketId);
      return { kind: "sent", insight };
    }, value => value.kind === "no_ticket" ? rejected("NO_TICKET") : { result: "success" });
    if (outcome.kind === "no_ticket") throw new ForbiddenException({ code: "no_ticket", message: "분석 티켓이 없다" });
    return { fetchedAt: new Date().toISOString(), insight: outcome.insight, tickets: await this.tickets.available(channelId) };
  }

  // 쿠폰 코드로 티켓을 받는다. URL 의 ?ticket=CODE 도 화면이 이 경로로 보낸다. 본문은 { code } 뿐이다.
  @Post("insight/redeem")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async redeem(@Req() req: Request, @Query() query: Record<string, unknown>, @Body() body: unknown): Promise<RedeemResponse> {
    if (Object.keys(query).length) throw new BadRequestException("Query parameters are not supported");
    const raw = (body as { code?: unknown } | undefined)?.code;
    if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).some(k => k !== "code") || typeof raw !== "string") throw new BadRequestException("Body must be { code }");
    const code = raw.trim().toUpperCase();
    if (!COUPON_CODE.test(code)) throw new BadRequestException({ code: "invalid_code", message: "쿠폰 코드 모양이 아니다" });
    const channelId = req.session.user!.channelId;
    const result = await this.logs.track({ channelId, activityType: ActivityType.INSIGHT_TICKET_REDEEM },
      (): Promise<RedeemResult> => this.tickets.redeem(channelId, code, async () => {
        const state = await this.insight.get(channelId);
        if (state.status !== "ready") return "unavailable";
        if (state.data?.state === "done") return "completed";
        if (state.data?.state === "failed") return "failed";
        if (state.data?.state === "waiting" || state.data?.state === "running") return "pending";
        return "none";
      }),
      value => value.status === "granted" ? { result: "success" } : rejected("COUPON_UNUSABLE", value.status === "not_found" ? 404 : value.status === "eligibility_unavailable" ? 503 : 409));
    switch (result.status) {
      case "granted": return { granted: result.granted, tickets: result.available };
      case "eligibility_unavailable": throw new ServiceUnavailableException({ code: "coupon_eligibility_unavailable", message: "AI 분석 상태를 확인하지 못했다" });
      case "not_found": throw new NotFoundException({ code: "coupon_not_found", message: "없는 쿠폰 코드다" });
      default: throw new ConflictException({ code: `coupon_${result.status}`, message: couponMessage(result.status) });
    }
  }
}

function couponMessage(status: Exclude<RedeemResult["status"], "granted" | "not_found">): string {
  switch (status) {
    case "event_only": return "이벤트 조건을 확인해 자동으로 지급하는 쿠폰이다";
    case "already_redeemed": return "이미 받은 쿠폰이다";
    case "available_tickets": return "사용 가능한 티켓이 있다";
    case "completed_review": return "이미 완료된 AI 리뷰가 있다";
    case "analysis_pending": return "AI 분석이 진행 중이다";
    case "analysis_failed": return "분석 실패 또는 환불 이력이 있다";
    case "eligibility_unavailable": return "AI 분석 상태를 확인하지 못했다";
    case "disabled": return "운영자가 막은 쿠폰이다";
    case "expired": return "기한이 지난 쿠폰이다";
    case "exhausted": return "받을 수 있는 사람 수가 다 찼다";
  }
}

@Module({ imports: [ActivityModule], controllers: [InsightController], providers: [InsightService, TicketStore, ConsentStore] })
export class InsightModule {}
