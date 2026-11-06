import { Injectable } from "@nestjs/common";
import { InsightService } from "../insight/insight.service.js";
import { ActivityLogService } from "../database/activity-log.service.js";
import { ActivityType } from "../database/activity-log.types.js";
import { EventStore } from "./event.store.js";
import { EventConditionFactory } from "./event-condition.factory.js";
import type { EventEntryResponse } from "./event.types.js";
@Injectable()
export class EventService {
  constructor(private readonly store: EventStore, private readonly factory: EventConditionFactory,
    private readonly insight: InsightService, private readonly logs: ActivityLogService) {}
  async enter(subject: string): Promise<EventEntryResponse> {
    const events = await this.store.candidates();
    if (!events.length) return { status: "none" };
    const viewer = await this.store.viewer(subject);
    if (!viewer) return { status: "deferred" };
    if (viewer.receivedEvent || viewer.balance > 0) return { status: "none" };
    if (viewer.pending) return { status: "deferred" };
    const review = await this.insight.get(subject);
    if (review.status !== "ready") return { status: "deferred" };
    if (review.data?.state === "waiting" || review.data?.state === "running") return { status: "deferred" };
    const hasSummary = review.data?.state === "done";
    for (const event of events) {
      const condition = this.factory.get(event.conditionType);
      if (!condition) return { status: "deferred" };
      const decision = await condition.evaluate(event.conditionParams, { viewer, hasSummary });
      if (decision.status === "hold") return { status: "deferred" };
      if (decision.status === "skip") continue;
      const result = await this.logs.track({ channelId: subject, activityType: ActivityType.INSIGHT_EVENT_GRANT },
        () => this.store.grant(subject, event, viewer, decision.recheck),
        r => r.status === "granted" ? { result: "success" } : { result: "failure", failureStage: "request", errorCode: "COUPON_UNUSABLE" });
      if (result.status === "hold") return { status: "deferred" };
      if (result.status === "granted") return { status: "granted", tickets: result.tickets,
        reward: { eventId: event.id, title: event.title, kind: "insight_ticket", quantity: event.ticketsPerRedeem, href: "/recap/#period-heading" } };
    }
    return { status: "none" };
  }
}
