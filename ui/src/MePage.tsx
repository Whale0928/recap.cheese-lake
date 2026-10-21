import { useEffect, useState } from "react";
import type { MeResponse } from "./MePage.types";
import "./me.css";

type State = { status: "loading" | "guest" | "error" } | { status: "ready"; profile: MeResponse };

export function MePage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    setImageFailed(false);
    fetch("/api/me", { credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) { setState({ status: "guest" }); return; }
        if (!response.ok) throw new Error("Profile request failed");
        const profile = await response.json() as MeResponse;
        setState({ status: "ready", profile });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  const profile = state.status === "ready" ? state.profile : null;
  const channel = profile?.chzzk.status === "ready" ? profile.chzzk.data : null;
  const nickname = channel?.channelName ?? profile?.identity.channelName;
  const pending = state.status === "loading";

  return (
    <main id="main" className="me-main">
      <div className="me-heading">
        <div><a className="me-back" href="/">홈으로</a><h1>내 정보</h1></div>
        <div className="me-actions">
          <button className="btn btn-outline btn-sm" disabled={pending} onClick={() => setAttempt(a => a + 1)}>새로고침</button>
        </div>
      </div>

      <section className="me-section" aria-labelledby="chzzk-heading" aria-busy={pending}>
        <div className="me-section-heading"><div><p className="me-source">치지직 제공</p><h2 id="chzzk-heading">치지직 프로필</h2></div><span className="me-status">{channel ? "조회 완료" : pending ? "확인 중" : "미확인"}</span></div>
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
          {profile?.chzzk.status === "unavailable" && <p role="alert">{profile.chzzk.message}</p>}
        </div>
        {profile && channel && <p className="me-updated">치지직 정보 확인 · {new Date(profile.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (한국 시간)</p>}
      </section>

      <section className="me-section me-lab" aria-labelledby="lab-heading">
        <div className="me-section-heading"><div><p className="me-source">Lab 제공</p><h2 id="lab-heading">내 활동 정보</h2></div><span className="me-status">연동 예정</span></div>
        <div className="me-lab-placeholder" aria-hidden="true" />
      </section>
    </main>
  );
}
