import type { ActivityData, ActivityKind, ActivityPeriod, ActivityScope, ChannelRelationship } from "./activity.types.js";
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const id = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{32}$/.test(v);
const time = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const imageUrl = (v: unknown): v is string | null => {
  if (v === null) return true;
  if (typeof v !== "string") return false;
  try { const url = new URL(v); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
};
function invalid(): never { throw new Error("Invalid Lab response"); }
export function activityData<K extends ActivityKind>(kind: K, value: unknown, subject: string, period: ActivityPeriod, channelIds: string[] = []): ActivityData[K] {
  if (kind === "relationship") return relationshipData(value, channelIds[0]!) as ActivityData[K];
  if (!object(value) || !object(value.scope)) return invalid();
  const s = value.scope;
  if (s.channelId !== subject || !Array.isArray(s.channelIds) || s.channelIds.length !== channelIds.length || [...s.channelIds].sort().some((id, index) => id !== [...channelIds].sort()[index]) || s.timeZone !== "Asia/Seoul" || s.dataScope !== "collected" || !time(s.from) || !time(s.to) || Date.parse(s.from) !== Date.parse(period.from) || Date.parse(s.to) !== Date.parse(period.to)) return invalid();
  const scope: ActivityScope = { channelId: subject, channelIds: [...channelIds], from: s.from, to: s.to, timeZone: "Asia/Seoul", dataScope: "collected" };
  let result: ActivityData[ActivityKind];
  switch (kind) {
    case "activities": {
      if (!object(value.trend)) return invalid();
      const channels = activityData("channels", value, subject, period, channelIds);
      const trend = activityData("trend", { ...value.trend, scope }, subject, period, channelIds);
      const patterns = activityData("patterns", value, subject, period, channelIds);
      result = { scope, totalChatCount: channels.totalChatCount, channels: channels.channels, trend: { interval: trend.interval, points: trend.points }, patterns: patterns.patterns };
      break;
    }
    case "summary":
      if (!count(value.chatCount) || !count(value.activeDays) || !count(value.channelCount)) return invalid();
      result = { scope, chatCount: value.chatCount, activeDays: value.activeDays, channelCount: value.channelCount }; break;
    case "channels":
      if (!count(value.totalChatCount) || !Array.isArray(value.channels)) return invalid();
      result = { scope, totalChatCount: value.totalChatCount, channels: value.channels.map(c => {
        if (!object(c) || !id(c.channelId) || (c.channelName !== null && typeof c.channelName !== "string") || typeof c.channelUrl !== "string" || c.channelUrl !== `https://chzzk.naver.com/${c.channelId}` || !imageUrl(c.channelImageUrl) || !count(c.chatCount) || !count(c.activeDays) || typeof c.share !== "number" || !Number.isFinite(c.share) || c.share < 0 || c.share > 1) return invalid();
        return { channelId: c.channelId, channelName: typeof c.channelName === "string" ? c.channelName.trim() || null : null, channelUrl: c.channelUrl, channelImageUrl: c.channelImageUrl, chatCount: c.chatCount, activeDays: c.activeDays, share: c.share };
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
    default: return invalid();
  }
  // kind와 검증한 응답의 대응은 위 분기에서 고정한다.
  return result as ActivityData[K];
}

const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && time(v) && new Date(v).toISOString().slice(0, 10) === v;
function relationshipData(value: unknown, target: string): ChannelRelationship {
  if (!object(value) || !object(value.channel) || !object(value.relationship)) return invalid();
  const c = value.channel;
  const r = value.relationship;
  if (c.channelId !== target || !id(c.channelId) || c.channelName !== null && typeof c.channelName !== "string" || c.channelUrl !== `https://chzzk.naver.com/${target}` || !imageUrl(c.channelImageUrl)) return invalid();
  if (!count(r.chatCount) || !count(r.activeDays) || !count(r.longestConsecutiveActiveDays) || !count(r.totalUserChatCount) || r.chatCount > r.totalUserChatCount || r.activeDays > r.chatCount || r.longestConsecutiveActiveDays > r.activeDays || typeof r.share !== "number" || !Number.isFinite(r.share) || r.share < 0 || r.share > 1) return invalid();
  const expectedShare = r.totalUserChatCount ? r.chatCount / r.totalUserChatCount : 0;
  if (Math.abs(r.share - expectedShare) > 1e-9) return invalid();
  if (r.chatCount === 0) {
    if (r.firstActiveDate !== null || r.lastActiveDate !== null || r.mostActiveDay !== null || r.mostActiveMonth !== null) return invalid();
    return { channel: { channelId: target, channelName: typeof c.channelName === "string" ? c.channelName.trim() || null : null, channelUrl: c.channelUrl, channelImageUrl: c.channelImageUrl }, relationship: { firstActiveDate: null, lastActiveDate: null, chatCount: 0, activeDays: 0, longestConsecutiveActiveDays: 0, mostActiveDay: null, mostActiveMonth: null, share: 0, totalUserChatCount: r.totalUserChatCount } };
  }
  if (!date(r.firstActiveDate) || !date(r.lastActiveDate) || r.firstActiveDate > r.lastActiveDate || !object(r.mostActiveDay) || !date(r.mostActiveDay.date) || !count(r.mostActiveDay.chatCount) || r.mostActiveDay.chatCount < 1 || r.mostActiveDay.chatCount > r.chatCount || !object(r.mostActiveMonth) || typeof r.mostActiveMonth.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.mostActiveMonth.month) || !count(r.mostActiveMonth.chatCount) || r.mostActiveMonth.chatCount < r.mostActiveDay.chatCount || r.mostActiveMonth.chatCount > r.chatCount) return invalid();
  return {
    channel: { channelId: target, channelName: typeof c.channelName === "string" ? c.channelName.trim() || null : null, channelUrl: c.channelUrl, channelImageUrl: c.channelImageUrl },
    relationship: { firstActiveDate: r.firstActiveDate, lastActiveDate: r.lastActiveDate, chatCount: r.chatCount, activeDays: r.activeDays, longestConsecutiveActiveDays: r.longestConsecutiveActiveDays, mostActiveDay: { date: r.mostActiveDay.date, chatCount: r.mostActiveDay.chatCount }, mostActiveMonth: { month: r.mostActiveMonth.month, chatCount: r.mostActiveMonth.chatCount }, share: r.share, totalUserChatCount: r.totalUserChatCount }
  };
}
