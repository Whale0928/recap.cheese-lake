import type { RelationshipChannel, SharedRelationshipRecord } from "./relationship.data";
import type { ActivityResult, ActivityTrend } from "./activity.types";

// 스트리머 공유 동의 창의 문구. 공유는 상대가 로그인하면 "이 채널에서의 내 기록" 화면을 그대로 보는 것이다.
// 처리방침 제5조의 다섯 항목(제공받는 자·목적·제공 항목·보유 기간·거부권)을 빠뜨리지 않되 계약서처럼 보이지 않게 쓴다.
export const SHARE_INCLUDED = ["채널 기록 카드와 나눈 채팅, 채팅한 날, 최장 연속 활동", "가장 활발했던 날과 달, 월별 기록, 최근 1년 날짜별 기록", "내 닉네임과 프로필"] as const;
export const SHARE_EXCLUDED = "채팅 원문, 다른 방송에서의 활동, 전체 채팅 중 비율은 전해지지 않아요.";
export const SHARE_UNTIL = "내가 해제하거나 리캡을 지우기 전까지예요. 그동안은 늘 최신 기록이 보여요.";
export const SHARE_FINE_PRINT = "공유하지 않아도 내 리캡을 보는 데는 아무 불이익이 없어요. 상대가 다시 퍼뜨리거나 다른 데 쓰는 건 허용하지 않지만, 이미 본 내용까지 되돌려 받을 수는 없어요.";

// 이름 뒤에 붙는 주격 조사. 한글이 아닌 이름은 "이(가)"로 둔다.
export function subjectParticle(name: string): "이" | "가" | "이(가)" {
  const last = name.codePointAt(name.length - 1) ?? 0;
  if (last < 0xac00 || last > 0xd7a3) return "이(가)";
  return (last - 0xac00) % 28 === 0 ? "가" : "이";
}

export interface ShareGrant { consentedAt: string }
// subscriptionMonths·rank 는 Lab 이 나중에 내려 줄 값이다. 아직 오지 않으면 없는 것으로 보고 기본 모양을 쓴다.
export interface ReceivedShare { ownerChannelId: string; ownerChannelName: string | null; ownerChannelImageUrl: string | null; consentedAt: string; subscriptionMonths?: number | null; rank?: number | null }
export interface SharedRecordResponse { fetchedAt: string; calendarPeriod: { from: string; to: string }; record: ActivityResult<{ channel: RelationshipChannel; relationship: SharedRelationshipRecord }>; daily: ActivityResult<ActivityTrend>; monthly: ActivityResult<ActivityTrend>; owner: { channelId: string; channelName: string | null }; consentedAt: string }

export const shareApiHref = (channelId: string) => `/api/me/channels/${encodeURIComponent(channelId)}/share`;
export const sharedRecordHref = (ownerChannelId: string) => `/recap/shared/?${new URLSearchParams({ owner: ownerChannelId })}`;
export const sharedRecordApiHref = (ownerChannelId: string) => `/api/me/shares/received/${encodeURIComponent(ownerChannelId)}/record`;

// 동의 체크를 거친 뒤에만 부른다. 서버도 consent 없이는 받지 않는다.
export async function grantShare(channelId: string, fetchImpl: typeof fetch = fetch): Promise<ShareGrant> {
  const response = await fetchImpl(shareApiHref(channelId), { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ consent: true }) });
  if (!response.ok) throw new Error(`Share request failed: ${response.status}`);
  const body = await response.json() as { share?: ShareGrant };
  if (!body.share || typeof body.share.consentedAt !== "string") throw new Error("Share response malformed");
  return body.share;
}

export async function revokeShare(channelId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(shareApiHref(channelId), { method: "DELETE", credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Share revoke failed: ${response.status}`);
}

export async function fetchShare(channelId: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<ShareGrant | null> {
  const response = await fetchImpl(shareApiHref(channelId), { credentials: "same-origin", headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw new Error(`Share status failed: ${response.status}`);
  const body = await response.json() as { share?: ShareGrant | null };
  return body.share && typeof body.share.consentedAt === "string" ? body.share : null;
}
