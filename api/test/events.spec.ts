import { describe, it, expect, jest } from "@jest/globals";
import { EventConditionFactory } from "../src/events/event-condition.factory.js";
import { EventService } from "../src/events/event.service.js";
import type { EventStore } from "../src/events/event.store.js";
import type { InsightService } from "../src/insight/insight.service.js";
import type { ActivityLogService } from "../src/database/activity-log.service.js";
import type { EventCandidate, EventViewer } from "../src/events/event.types.js";

const subject = "a".repeat(32);
const viewer: EventViewer = { balance: 0, receivedEvent: false, pending: false, version: "v1" };
const event = (id: string, params: unknown = { maxActivityLogsExclusive: 5 }, type = "newcomer"): EventCandidate => ({ id, title: id, couponCode: id, groupKey: "first", conditionType: type, conditionParams: params, version: "1", ticketsPerRedeem: 1, ticketValidDays: 30 });
const factory = new EventConditionFactory();

describe("fixed event eligibility", () => {
  it("keeps the saved condition key and excludes unsupported types", () => {
    expect(factory.get("newcomer")).toBeDefined();
    expect(factory.get("subscriber_months")).toBeUndefined();
    expect(factory.get("unknown")).toBeUndefined();
  });
  it.each([false, true].flatMap(receivedEvent => [0, 1].flatMap(balance => [false, true].map(hasSummary => ({ receivedEvent, balance, hasSummary })))))
    ("requires no prior reward, no summary and zero available tickets: %j", async ({ receivedEvent, balance, hasSummary }) => {
      const r = await factory.get("newcomer")!.evaluate({}, { viewer: { ...viewer, receivedEvent, balance }, hasSummary });
      expect(r.status).toBe(!receivedEvent && balance === 0 && !hasSummary ? "match" : "skip");
      if (r.status === "match") {
        expect(r.recheck({ ...viewer, receivedEvent: true })).toBe(false);
        expect(r.recheck({ ...viewer, balance: 1 })).toBe(false);
      }
    });
  it.each([{}, { maxActivityLogsExclusive: 0 }, { maxActivityLogsExclusive: 5 }, { maxActivityLogsExclusive: 1000 }])("stored log thresholds do not affect eligibility: %j", async params => {
    expect((await factory.get("newcomer")!.evaluate(params, { viewer, hasSummary: false })).status).toBe("match");
  });
});
function fixture(events: EventCandidate[], v = viewer) {
  const store = { candidates: jest.fn<EventStore["candidates"]>().mockResolvedValue(events), viewer: jest.fn<EventStore["viewer"]>().mockResolvedValue(v), grant: jest.fn<EventStore["grant"]>().mockResolvedValue({ status: "granted", tickets: 1 }) };
  const insight = { get: jest.fn<InsightService["get"]>().mockResolvedValue({ status: "ready", data: null }) };
  const logs = { track: async (_: unknown, work: () => Promise<unknown>) => work() };
  const service = new EventService(store as unknown as EventStore, factory, insight as unknown as InsightService, logs as ActivityLogService);
  return { store, insight, service };
}
describe("entry evaluation", () => {
  const events = () => [event("first"), event("next")];
  it("grants the first matching configured event, once per entry", async () => {
    const f = fixture(events());
    expect(await f.service.enter(subject)).toMatchObject({ status: "granted", reward: { eventId: "first", quantity: 1 } });
    expect(f.store.grant).toHaveBeenCalledTimes(1);
  });
  it("unsupported conditions do not grant or fall through", async () => {
    const f = fixture([event("unknown", {}, "unsupported"), event("next")]);
    expect(await f.service.enter(subject)).toEqual({ status: "deferred" }); expect(f.store.grant).not.toHaveBeenCalled();
  });
  it.each([{ balance: 1 }, { receivedEvent: true }])("excludes ineligible viewer before Lab: %j", async state => {
    const f = fixture(events(), { ...viewer, ...state });
    expect(await f.service.enter(subject)).toEqual({ status: "none" }); expect(f.insight.get).not.toHaveBeenCalled(); expect(f.store.grant).not.toHaveBeenCalled();
  });
  it("defers a locally pending analysis", async () => {
    const f = fixture(events(), { ...viewer, pending: true });
    expect(await f.service.enter(subject)).toEqual({ status: "deferred" }); expect(f.insight.get).not.toHaveBeenCalled();
  });
  it.each(["waiting", "running"] as const)("defers Lab state %s", async state => {
    const f = fixture(events()); f.insight.get.mockResolvedValue({ status: "ready", data: { channelId: subject, requestId: 1, state, enqueuedAt: new Date().toISOString() } });
    expect(await f.service.enter(subject)).toEqual({ status: "deferred" }); expect(f.store.grant).not.toHaveBeenCalled();
  });
  it.each(["failed", "cancelled"] as const)("permits %s without a summary or available ticket", async state => {
    const f = fixture(events()); f.insight.get.mockResolvedValue({ status: "ready", data: { channelId: subject, requestId: 1, state, enqueuedAt: new Date().toISOString() } });
    expect(await f.service.enter(subject)).toMatchObject({ status: "granted" });
  });
  it("excludes a completed summary", async () => {
    const f = fixture(events()); f.insight.get.mockResolvedValue({ status: "ready", data: { channelId: subject, requestId: 1, state: "done", enqueuedAt: new Date().toISOString() } });
    expect(await f.service.enter(subject)).toEqual({ status: "none" }); expect(f.store.grant).not.toHaveBeenCalled();
  });
  it("defers unavailable review state", async () => {
    const f = fixture(events()); f.insight.get.mockResolvedValue({ status: "unavailable", reason: "upstream" });
    expect(await f.service.enter(subject)).toEqual({ status: "deferred" }); expect(f.store.grant).not.toHaveBeenCalled();
  });
  it("does not fall through when configuration changes during the request", async () => {
    const f = fixture(events()); f.store.grant.mockResolvedValue({ status: "hold" });
    expect(await f.service.enter(subject)).toEqual({ status: "deferred" }); expect(f.store.grant).toHaveBeenCalledTimes(1);
  });
  it("does no upstream work without active events", async () => {
    const f = fixture([]); expect(await f.service.enter(subject)).toEqual({ status: "none" }); expect(f.store.viewer).not.toHaveBeenCalled(); expect(f.insight.get).not.toHaveBeenCalled();
  });
});
