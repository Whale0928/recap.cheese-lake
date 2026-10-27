import { useEffect, useState } from "react";
import { RelationshipDetails } from "./RelationshipPage";
import { ResultNotice } from "./ActivityView";
import { sharedRecordApiHref, type SharedRecordResponse } from "./relationship.share";
import "./relationship.css";

type State = { status: "loading" } | { status: "guest" } | { status: "missing" } | { status: "blocked" } | { status: "error" } | { status: "ready"; data: SharedRecordResponse };

// 시청자가 보여 주기로 한 "그 채널에서의 내 기록" 화면을 스트리머가 그대로 본다. 동의가 사라지면 404로 바뀌므로 그에 맞는 안내만 준다.
function SharedRecord({ owner }: { owner: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(sharedRecordApiHref(owner), { credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async response => {
        if (controller.signal.aborted) return;
        if (response.status === 401) { setState({ status: "guest" }); return; }
        if (response.status === 404) { setState({ status: "missing" }); return; }
        if (response.status === 403) { setState({ status: "blocked" }); return; }
        if (!response.ok) throw new Error("Shared record request failed");
        const data = await response.json() as SharedRecordResponse;
        if (!controller.signal.aborted) setState({ status: "ready", data });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [owner, attempt]);
  if (state.status === "loading") return <p className="activity-notice" role="status">불러오는 중</p>;
  if (state.status === "guest") return <a className="btn btn-default" href="/auth/login">내 리캡 보기</a>;
  if (state.status === "missing") return <section className="me-section" role="status"><p>지금은 볼 수 없는 기록이에요. 시청자가 보여 주기를 해제했거나, 처음부터 나에게 보여 준 기록이 아니에요.</p></section>;
  if (state.status === "blocked") return <section className="me-section" role="status"><p>시청자의 요청으로 지금은 볼 수 없는 기록이에요.</p></section>;
  if (state.status === "error") return <div role="status"><p>활동 정보 조회 실패</p><button type="button" className="btn btn-outline" onClick={() => setAttempt(n => n + 1)}>다시 조회</button></div>;
  if (state.data.record.status !== "ready") return <ResultNotice result={state.data.record} />;
  return <RelationshipDetails response={{ ...state.data, record: state.data.record }} owner={state.data.owner} />;
}

export function SharedRecordPage({ authenticated, pending }: { authenticated: boolean; pending: boolean }) {
  const owner = new URLSearchParams(window.location.search).get("owner") ?? "";
  const valid = /^[0-9a-f]{32}$/.test(owner);
  return <main id="main" className="me-main relationship-main">
    <div className="me-heading"><div><a className="me-back" href="/recap/">내 리캡으로</a><h1>나에게 보여 준 기록</h1></div></div>
    {pending ? <p className="activity-notice" role="status">불러오는 중</p> : !authenticated ? <section className="me-section"><a className="btn btn-default" href="/auth/login">내 리캡 보기</a></section> : !valid ? <section className="me-section" role="status">선택한 기록 없음</section> : <SharedRecord key={owner} owner={owner} />}
  </main>;
}
