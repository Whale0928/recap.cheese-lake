import { ReceivedShares } from "./ReceivedShares";
import { SharedRecord } from "./SharedRecordView";
import "./relationship.css";

export function SharedRecordPage({ authenticated, pending }: { authenticated: boolean; pending: boolean }) {
  const owner = new URLSearchParams(window.location.search).get("owner");
  const valid = owner !== null && /^[0-9a-f]{32}$/.test(owner);
  return <main id="main" className="me-main relationship-main">
    <div className="me-heading"><div><a className="me-back" href={owner === null ? "/" : "/recap/shared/"}>{owner === null ? "홈으로" : "공유받은 리캡으로"}</a><h1>{owner === null ? "공유받은 리캡" : "나에게 보여 준 기록"}</h1></div>{owner === null && <div id="shared-view-slot" />}</div>
    {pending ? <p className="activity-notice" role="status">불러오는 중</p> : !authenticated ? <section className="me-section"><a className="btn btn-default" href="/auth/login">로그인하기</a></section> : owner === null ? <ReceivedShares /> : !valid ? <section className="me-section" role="status">선택한 기록 없음</section> : <SharedRecord key={owner} owner={owner} />}
  </main>;
}
