export type Interval = "day" | "week" | "month";
export type ActivityKind = "summary" | "channels" | "trend" | "patterns" | "activities" | "relationship";
export interface ActivityScope { channelId: string; channelIds: string[]; from: string; to: string; timeZone: "Asia/Seoul"; dataScope: "collected" }
export interface ActivityCounts { chatCount: number; activeDays: number; channelCount: number }
export interface ActivitySummary extends ActivityCounts { scope: ActivityScope }
export interface ActivityChannels { scope: ActivityScope; totalChatCount: number; channels: { channelId: string; channelName: string | null; channelUrl: string; channelImageUrl: string | null; chatCount: number; activeDays: number; share: number }[] }
export interface ActivityTrend { scope: ActivityScope; interval: Interval; points: ({ from: string; to: string } & ActivityCounts)[] }
export interface ActivityPatterns { scope: ActivityScope; patterns: { weekday: number; hour: number; chatCount: number }[] }
export interface ActivityData { summary: ActivitySummary; channels: ActivityChannels; trend: ActivityTrend; patterns: ActivityPatterns; activities: ActivityBundle; relationship: ChannelRelationship }
export type ActivityResult<T> = { status: "ready"; data: T } | { status: "unavailable"; reason: "not_configured" | "rate_limited" | "upstream"; retryAfterSeconds?: number };
export interface ActivityPeriod { from: string; to: string; interval: Interval }
export interface SummaryResponse { period: ActivityPeriod; fetchedAt: string; summary: ActivityResult<ActivitySummary> }
export interface RecapResponse extends SummaryResponse { channels: ActivityResult<ActivityChannels>; trend: ActivityResult<ActivityTrend>; patterns: ActivityResult<ActivityPatterns> }

export interface ActivityBundle {
  scope: ActivityScope;
  totalChatCount: number;
  channels: ActivityChannels["channels"];
  trend: Pick<ActivityTrend, "interval" | "points">;
  patterns: ActivityPatterns["patterns"];
}
export interface ChannelRelationship {
  channel: Pick<ActivityChannels["channels"][number], "channelId" | "channelName" | "channelUrl" | "channelImageUrl">;
  relationship: {
    firstActiveDate: string | null; lastActiveDate: string | null;
    chatCount: number; activeDays: number; longestConsecutiveActiveDays: number;
    mostActiveDay: { date: string; chatCount: number } | null;
    mostActiveMonth: { month: string; chatCount: number } | null;
    share: number; totalUserChatCount: number;
  };
}
export interface ChannelRecordResponse {
  fetchedAt: string;
  calendarPeriod: { from: string; to: string };
  record: ActivityResult<ChannelRelationship>;
  daily: ActivityResult<ActivityTrend>;
  monthly: ActivityResult<ActivityTrend>;
}
