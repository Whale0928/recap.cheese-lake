export interface EventCandidate {
  id: string; title: string; couponCode: string; groupKey: string; conditionType: string;
  conditionParams: unknown; version: string; ticketsPerRedeem: number; ticketValidDays: number | null;
}
export interface EventViewer {
  balance: number; receivedEvent: boolean; pending: boolean; version: string;
}
export interface ConditionContext { viewer: EventViewer; hasSummary: boolean }
export type ConditionDecision = { status: "match"; recheck: (viewer: EventViewer) => boolean } | { status: "skip" } | { status: "hold" };
export interface EventCondition { evaluate(params: unknown, context: ConditionContext): Promise<ConditionDecision> }
export type EventGrant = { status: "granted"; tickets: number } | { status: "skip" | "hold" };
export type EventEntryResponse = { status: "none" | "deferred" } | {
  status: "granted"; tickets: number;
  reward: { eventId: string; title: string; kind: "insight_ticket"; quantity: number; href: "/recap/#period-heading" };
};
