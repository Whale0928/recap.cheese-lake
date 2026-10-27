import { activityPeriod, recapPeriod } from "./activity.query.js";
import type { LabClient } from "./lab.client.js";
import type { ChannelRecordResponse } from "./activity.types.js";

// "이 채널에서의 내 기록" 화면 한 장에 필요한 조회 묶음. 본인 조회와 공유받은 스트리머의 조회가 같은 화면을 쓰므로 함께 쓴다.
export async function channelRecord(lab: LabClient, subject: string, broadcastId: string): Promise<ChannelRecordResponse> {
  const to = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10);
  const recent = activityPeriod({ from, to }, false);
  const all = recapPeriod({ period: "all" });
  const [record, daily, monthly] = await Promise.all([
    lab.get("relationship", subject, all, [broadcastId]),
    lab.get("trend", subject, recent, [broadcastId]),
    lab.get("trend", subject, { ...all, interval: "month" }, [broadcastId]),
  ]);
  return { fetchedAt: new Date().toISOString(), calendarPeriod: { from, to }, record, daily, monthly,
    ...(record.status === "ready" && record.profileRefresh ? { profileRefresh: record.profileRefresh } : {}) };
}
