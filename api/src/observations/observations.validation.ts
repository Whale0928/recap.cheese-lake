import type { DailyObservations, ObservationChannel } from "./observations.types.js";

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function invalid(): never { throw new Error("Invalid observation response"); }
function timestamp(v: unknown): number {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v))) return invalid();
  return Date.parse(v);
}
function channel(v: unknown): ObservationChannel {
  if (!object(v) || typeof v.channelId !== "string" || !/^[0-9a-f]{32}$/.test(v.channelId) || v.channelName !== null && typeof v.channelName !== "string" || v.channelUrl !== `https://chzzk.naver.com/${v.channelId}`) return invalid();
  if (v.channelImageUrl !== null && v.channelImageUrl !== "") {
    if (typeof v.channelImageUrl !== "string") return invalid();
    const u = new URL(v.channelImageUrl);
    if (u.protocol !== "https:" || u.username || u.password) return invalid();
  }
  return { channelId: v.channelId, channelName: typeof v.channelName === "string" ? v.channelName.trim() || null : null, channelImageUrl: v.channelImageUrl as string | null, channelUrl: v.channelUrl };
}

export function observationDay(now: number): { date: string; from: number; to: number; midnight: number } {
  const kst = new Date(now + 9 * 3_600_000);
  const midnight = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3_600_000;
  return { date: new Date(midnight - 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10), from: midnight - 86_400_000, to: midnight, midnight: midnight + 86_400_000 };
}

export function observationData(value: unknown, date: string, now = Date.now()): DailyObservations {
  if (!object(value) || !object(value.scope) || !object(value.summary)) return invalid();
  const start = Date.parse(`${date}T00:00:00+09:00`), end = start + 86_400_000;
  const scope = value.scope, s = value.summary;
  if (scope.date !== date || scope.timeZone !== "Asia/Seoul" || scope.dataScope !== "collected" || timestamp(scope.from) !== start || timestamp(scope.to) !== end || timestamp(value.generatedAt) > now + 60_000) return invalid();
  if (!count(s.chatCount) || !count(s.participantCount) || !count(s.channelCount) || s.participantCount > s.chatCount || s.channelCount > s.chatCount) return invalid();
  const summary = { chatCount: s.chatCount, participantCount: s.participantCount, channelCount: s.channelCount };
  const base = { scope: { date, from: scope.from as string, to: scope.to as string, timeZone: "Asia/Seoul" as const, dataScope: "collected" as const }, generatedAt: value.generatedAt as string, summary };
  if (s.chatCount === 0) {
    if (s.participantCount !== 0 || s.channelCount !== 0 || value.dailyChatLeader !== null || value.peakChatMinute !== null || value.peakChatHour !== null) return invalid();
    return { ...base, dailyChatLeader: null, peakChatMinute: null, peakChatHour: null };
  }
  if (s.participantCount < 1 || s.channelCount < 1) return invalid();
  const leader = value.dailyChatLeader, minute = value.peakChatMinute, hour = value.peakChatHour;
  for (const peak of [leader, minute, hour]) if (!object(peak) || !count(peak.chatCount) || peak.chatCount < 1 || peak.chatCount > s.chatCount) return invalid();
  if (!object(leader) || !object(minute) || !object(hour)) return invalid();
  for (const [peak, duration] of [[minute, 60_000], [hour, 3_600_000]] as const) {
    const from = timestamp(peak.from), to = timestamp(peak.to);
    if (from < start || to > end || to - from !== duration || (from - start) % duration !== 0) return invalid();
  }
  return { ...base,
    dailyChatLeader: { channel: channel(leader.channel), chatCount: leader.chatCount as number },
    peakChatMinute: { channel: channel(minute.channel), chatCount: minute.chatCount as number, from: minute.from as string, to: minute.to as string },
    peakChatHour: { chatCount: hour.chatCount as number, from: hour.from as string, to: hour.to as string },
  };
}
