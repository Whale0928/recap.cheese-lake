import type { ActivityData, ActivityKind, ActivityPeriod, ActivityScope } from "./activity.types.js";
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const id = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{32}$/.test(v);
const time = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
function invalid(): never { throw new Error("Invalid Lab response"); }
export function activityData<K extends ActivityKind>(kind: K, value: unknown, subject: string, period: ActivityPeriod): ActivityData[K] {
  if (!object(value) || !object(value.scope)) return invalid();
  const s = value.scope;
  if (s.channelId !== subject || !Array.isArray(s.channelIds) || s.channelIds.length !== 0 || s.timeZone !== "Asia/Seoul" || s.dataScope !== "collected" || !time(s.from) || !time(s.to) || Date.parse(s.from) !== Date.parse(period.from) || Date.parse(s.to) !== Date.parse(period.to)) return invalid();
  const scope: ActivityScope = { channelId: subject, channelIds: [], from: s.from, to: s.to, timeZone: "Asia/Seoul", dataScope: "collected" };
  let result: ActivityData[ActivityKind];
  switch (kind) {
    case "summary":
      if (!count(value.chatCount) || !count(value.activeDays) || !count(value.channelCount)) return invalid();
      result = { scope, chatCount: value.chatCount, activeDays: value.activeDays, channelCount: value.channelCount }; break;
    case "channels":
      if (!count(value.totalChatCount) || !Array.isArray(value.channels)) return invalid();
      result = { scope, totalChatCount: value.totalChatCount, channels: value.channels.map(c => {
        if (!object(c) || !id(c.channelId) || !count(c.chatCount) || !count(c.activeDays) || typeof c.share !== "number" || !Number.isFinite(c.share) || c.share < 0 || c.share > 1) return invalid();
        return { channelId: c.channelId, chatCount: c.chatCount, activeDays: c.activeDays, share: c.share };
      }) }; break;
    case "trend":
      if (value.interval !== period.interval || !Array.isArray(value.points)) return invalid();
      result = { scope, interval: period.interval, points: value.points.map(p => {
        if (!object(p) || !time(p.from) || !time(p.to) || Date.parse(p.from) >= Date.parse(p.to) || Date.parse(p.from) < Date.parse(period.from) || Date.parse(p.to) > Date.parse(period.to) || !count(p.chatCount) || !count(p.activeDays) || !count(p.channelCount)) return invalid();
        return { from: p.from, to: p.to, chatCount: p.chatCount, activeDays: p.activeDays, channelCount: p.channelCount };
      }) }; break;
    case "patterns":
      if (!Array.isArray(value.patterns)) return invalid();
      result = { scope, patterns: value.patterns.map(p => {
        if (!object(p) || !count(p.weekday) || p.weekday < 1 || p.weekday > 7 || !count(p.hour) || p.hour > 23 || !count(p.chatCount)) return invalid();
        return { weekday: p.weekday, hour: p.hour, chatCount: p.chatCount };
      }) }; break;
  }
  // kind와 검증한 응답의 대응은 위 분기에서 고정한다.
  return result as ActivityData[K];
}
