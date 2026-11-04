import { useState } from "react";
import { useActivity } from "./ActivityView";
import type { MeResponse } from "./RecapProfile.types";

export function RecapProfile({ sessionName }: { sessionName: string | null }) {
  const [attempt, setAttempt] = useState(0);
  const state = useActivity<MeResponse>("/api/me", attempt);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const profile = state.status === "ready" ? state.data : null;
  const channel = profile?.chzzk.status === "ready" ? profile.chzzk.data : null;
  const name = channel?.channelName ?? profile?.identity.channelName ?? sessionName;
  const loading = state.status === "loading" || state.status === "ready" && state.refreshing;
  const showSkeleton = loading && !channel;
  return <div className="recap-profile-heading" aria-busy={loading}>
    <div className={`me-avatar recap-profile-avatar${showSkeleton ? " recap-skeleton" : ""}`} aria-hidden="true">
      {!showSkeleton && (channel?.channelImageUrl && failedImage !== channel.channelImageUrl
        ? <img src={channel.channelImageUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedImage(channel.channelImageUrl)} />
        : <span>{Array.from(name ?? "r")[0]}</span>)}
    </div>
    <div className="recap-profile-name">
      <h1>{name ? <><span className="me-heading-name">{name}</span> 님의 리캡</> : "내 리캡"}</h1>
      {loading && <span className="recap-visually-hidden" role="status">프로필 불러오는 중</span>}
      {(state.status === "error" || profile?.chzzk.status === "unavailable") && <button type="button" className="recap-profile-retry" disabled={loading} onClick={() => setAttempt(n => n + 1)}>{loading ? "프로필 불러오는 중" : "프로필 다시 불러오기"}</button>}
    </div>
  </div>;
}
