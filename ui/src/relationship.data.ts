import type { ActivityChannels } from "./activity.types";

export type RelationshipChannel = Pick<ActivityChannels["channels"][number], "channelId" | "channelName" | "channelImageUrl" | "channelUrl">;
export interface RelationshipResponse {
  channel: RelationshipChannel;
  relationship: {
    firstActiveDate: string | null;
    lastActiveDate: string | null;
    chatCount: number;
    activeDays: number;
    longestConsecutiveActiveDays: number;
    mostActiveDay: { date: string; chatCount: number } | null;
    mostActiveMonth: { month: string; chatCount: number } | null;
    share: number;
    totalUserChatCount: number;
  };
}

const previewChannelKey = "recap.relationship.previewChannel";
export const relationshipHref = (channelId: string) => `/recap/channel/?${new URLSearchParams({ channel: channelId })}`;

export function rememberRelationshipChannel(channel: RelationshipChannel): void {
  try {
    // 페이지 사이에 공개 채널 정보만 전달하고 본인의 활동·인증정보는 저장하지 않는다.
    sessionStorage.setItem(previewChannelKey, JSON.stringify({ channelId: channel.channelId, channelName: channel.channelName, channelImageUrl: channel.channelImageUrl }));
  } catch {
    // 저장소가 차단되어도 페이지 이동은 유지한다.
  }
}

export function relationshipPreview(channelId: string): RelationshipResponse {
  let channelName: string | null = null;
  let channelImageUrl: string | null = null;
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(previewChannelKey) ?? "null");
    if (saved && typeof saved === "object" && "channelId" in saved && saved.channelId === channelId) {
      if ("channelName" in saved && typeof saved.channelName === "string") channelName = saved.channelName.trim() || null;
      if ("channelImageUrl" in saved && typeof saved.channelImageUrl === "string") {
        const image = new URL(saved.channelImageUrl);
        if (image.protocol === "https:" && !image.username && !image.password) channelImageUrl = image.href;
      }
    }
  } catch {
    // 직접 접근하거나 저장소가 차단되면 채널 메타데이터 없이 미리보기를 표시한다.
  }
  return {
    channel: { channelId, channelName, channelImageUrl, channelUrl: `https://chzzk.naver.com/${channelId}` },
    relationship: {
      firstActiveDate: "2026-01-20", lastActiveDate: "2026-10-22", chatCount: 12000, activeDays: 124,
      longestConsecutiveActiveDays: 32, mostActiveDay: { date: "2026-09-15", chatCount: 420 },
      mostActiveMonth: { month: "2026-09", chatCount: 2300 }, share: 0.8, totalUserChatCount: 15000
    }
  };
}

