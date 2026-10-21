import { ActivityCalendar } from "./ActivityCalendar";
import { MeActivity, useActivity } from "./ActivityView";
import { useEffect, useState } from "react";
import type { MeResponse } from "./MePage.types";
import "./me.css";

export function MePage() {
  const [attempt, setAttempt] = useState(0);
  const state = useActivity<MeResponse>("/api/me", attempt);
  const [imageFailed, setImageFailed] = useState(false);
  const profile = state.status === "ready" ? state.data : null;
  const channel = profile?.chzzk.status === "ready" ? profile.chzzk.data : null;
  const nickname = channel?.channelName ?? profile?.identity.channelName;
  const pending = state.status === "loading" || state.status === "ready" && state.refreshing;
  useEffect(() => setImageFailed(false), [channel?.channelImageUrl]);

  return (
    <main id="main" className="me-main">
      <div className="me-heading">
        <div><a className="me-back" href="/">홈으로</a><h1>내 정보</h1></div>
        <div className="me-actions">
          <button className="btn btn-outline btn-sm" disabled={pending} onClick={() => setAttempt(a => a + 1)}>새로고침</button>
        </div>
      </div>

      <section className="me-section" aria-labelledby="chzzk-heading" aria-busy={pending}>
        <div className="me-section-heading"><div><p className="me-source">치지직 제공</p><h2 id="chzzk-heading">치지직 프로필</h2></div><span className="me-status">{pending ? profile ? "갱신 중" : "확인 중" : channel ? "조회 완료" : "미확인"}</span></div>
        <div className="me-profile">
          <div className="me-avatar">
            {channel?.channelImageUrl && !imageFailed
              ? <img src={channel.channelImageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
              : <span aria-hidden="true">{nickname?.slice(0, 1) ?? "r"}</span>}
          </div>
          <div><h3>{nickname ?? (pending ? "불러오는 중" : "로그인 필요")}</h3></div>
        </div>
        <div className="me-notice" aria-live="polite">
          {state.status === "guest" && <><a className="btn btn-default" href="/auth/login">내 리캡 보기</a></>}
          {state.status === "error" && <p role="alert">프로필 조회 실패</p>}
          {state.status === "ready" && state.refreshFailed && <p role="alert">프로필 갱신 실패</p>}
          {profile?.chzzk.status === "unavailable" && <p role="alert">{profile.chzzk.message}</p>}
        </div>
        {profile && channel && <p className="me-updated">치지직 정보 확인 · {new Date(profile.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간)</p>}
      </section>

      <section className="me-section me-activity" aria-labelledby="activity-heading">
        <div className="me-section-heading"><div><h2 id="activity-heading">내 활동 정보</h2></div></div>
        <MeActivity attempt={attempt} />
        {profile && <ActivityCalendar key={profile.identity.channelId} />}
      </section>
    </main>
  );
}
