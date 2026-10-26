import { useEffect, useRef, useState } from "react";
import "./privacy.css";

type RequestType = "delete" | "delete_and_exclude";
type PrivacyRequest = { type: RequestType; status: "pending" | "cancel_requested" | "processing" | "completed"; requestedAt: string; cancelableUntil: string; cancelRequestedAt?: string };
// 서비스 이용이 막힌 상태. 세션 응답이 알려 주며, 차단 화면이 이 값으로 사유와 다음 행동을 고른다.
type AccessRestriction = { kind: "privacy_request"; request: PrivacyRequest } | { kind: "suspended"; reason: string } | { kind: "ip_blocked" };

const CONTACT_EMAIL = "recap@cheese-lake.com";
const formatDateTime = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
const requestLabels: Record<RequestType, string> = { delete: "기록 지우기", delete_and_exclude: "수집 거부" };

async function send(method: "POST" | "DELETE", path: string, body?: unknown) {
  const response = await fetch(path, { method, credentials: "same-origin", headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`개인정보 요청 실패: ${response.status}`);
}

type AuthState = "loading" | "guest" | "authenticated";

function PrivacyActions({ onClose }: { onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const confirm = () => {
    setPending(true); setError("");
    send("POST", "/api/me/privacy/requests", { type: "delete_and_exclude" })
      // 수집 거부는 서비스 이용 자체를 막으므로 세션을 다시 읽어 차단 화면으로 넘어간다.
      .then(() => window.location.assign("/"))
      .catch(() => setError("요청에 실패했습니다. 잠시 후 다시 시도해 주세요."))
      .finally(() => setPending(false));
  };
  if (confirming) return <div className="privacy-confirm-step">
    <h3>수집 거부를 요청할까요?</h3>
    <section className="privacy-checklist" aria-labelledby="privacy-checklist-title">
      <p id="privacy-checklist-title" className="privacy-checklist-title">확인 사항</p>
      <div>
        <h4>처리되는 내용</h4>
        <ul>
          <li>요청 즉시 적용됩니다.</li>
          <li>앞으로 내 채팅을 수집하지 않습니다.</li>
          <li>7일이 지나면 저장된 기록을 파기합니다.</li>
        </ul>
      </div>
      <div>
        <h4>제한되는 내용</h4>
        <ul>
          <li>본인과 공유 상대 모두 리캡을 볼 수 없습니다.</li>
          <li>이 계정으로 서비스를 이용할 수 없습니다.</li>
          <li>파기된 기록은 복구할 수 없습니다.</li>
        </ul>
      </div>
      <p className="privacy-checklist-note">7일 안에는 요청을 취소할 수 있습니다.</p>
    </section>
    {error && <p className="privacy-error" role="alert">{error}</p>}
    <div className="privacy-confirm-actions">
      <button className="btn btn-outline" type="button" onClick={() => { if (!pending) setConfirming(false); }} autoFocus>취소</button>
      <button className="btn btn-destructive" type="button" onClick={confirm} disabled={pending} aria-busy={pending}>{pending ? "처리 중" : "동의 및 수집 거부 요청"}</button>
    </div>
  </div>;
  return <>
    <ul className="privacy-actions">
      <li>
        <div><h3>수집 거부</h3><p>내 채팅 수집을 중단하고 저장된 기록을 파기합니다.<br />요청 후 7일 안에는 취소할 수 있습니다.</p></div>
        <button className="btn btn-outline btn-sm privacy-danger" type="button" onClick={() => { setError(""); setConfirming(true); }}>수집 거부</button>
      </li>
    </ul>
    <div className="privacy-confirm-actions"><button className="btn btn-outline" type="button" onClick={onClose}>닫기</button></div>
  </>;
}

function PrivacyDialog({ open, authState, onClose }: { open: boolean; authState: AuthState; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return <dialog ref={dialog} className="privacy-dialog" aria-labelledby="privacy-title" onClose={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    {open && <div className="privacy-panel">
      <h2 id="privacy-title">이용 설정</h2>
      {authState === "loading" && <p className="privacy-note">확인 중…</p>}
      {authState === "guest" && <>
        <div className="privacy-note">
          <p>치지직 로그인 후 이용할 수 있습니다.</p>
          <p>로그인이 어려우면 이메일로 요청해 주세요.<br /><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
        </div>
        <div className="privacy-confirm-actions"><button className="btn btn-outline" type="button" onClick={onClose}>닫기</button><a className="btn btn-default" href="/auth/login">치지직 로그인</a></div>
      </>}
      {authState === "authenticated" && <PrivacyActions onClose={onClose} />}
    </div>}
  </dialog>;
}

function AccessBlocked({ restriction, onContact }: { restriction: AccessRestriction; onContact?: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pendingRequest = restriction.kind === "privacy_request" ? restriction.request : null;
  const cancelable = pendingRequest?.status === "pending" && Date.parse(pendingRequest.cancelableUntil) > Date.now();
  const cancel = () => {
    setPending(true); setError("");
    send("DELETE", "/api/me/privacy/requests")
      .then(() => window.location.assign("/"))
      .catch(() => setError("취소에 실패했습니다. 잠시 후 다시 시도해 주세요."))
      .finally(() => setPending(false));
  };
  const foot = <p className="blocked-foot">문의: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · <a href="/privacy/">개인정보 처리방침</a> · <a href="/terms/">이용약관</a></p>;
  if (restriction.kind === "ip_blocked") return <main id="main" className="blocked-main">
    <h1>접속이<br />차단되었습니다.</h1>
    <p className="blocked-lead">현재 네트워크에서는 서비스를 이용할 수 없습니다.<br />차단이 잘못되었다면 이메일로 알려 주세요.</p>
    {foot}
  </main>;
  if (restriction.kind === "suspended") return <main id="main" className="blocked-main">
    <h1>이용이 제한된<br />계정입니다.</h1>
    <p className="blocked-lead">사유: {restriction.reason}</p>
    {onContact && <div className="blocked-actions"><button className="btn btn-outline" type="button" onClick={onContact}>이의 신청</button></div>}
    {foot}
  </main>;
  const { request } = restriction;
  if (request.status === "cancel_requested") return <main id="main" className="blocked-main">
    <h1>취소 요청이<br />접수되었습니다.</h1>
    <p className="blocked-lead">확인 후 처리됩니다. 처리 전까지는 서비스를 이용할 수 없습니다.</p>
    <dl className="blocked-facts">
      <div><dt>{requestLabels[request.type]}</dt><dd>{formatDateTime(request.requestedAt)}</dd></div>
      {request.cancelRequestedAt && <div><dt>취소 요청</dt><dd>{formatDateTime(request.cancelRequestedAt)}</dd></div>}
    </dl>
    {foot}
  </main>;
  return <main id="main" className="blocked-main">
    <h1>{requestLabels[request.type]} 요청이<br />접수되었습니다.</h1>
    <p className="blocked-lead">요청이 처리되는 동안 서비스를 이용할 수 없습니다.</p>
    <dl className="blocked-facts">
      <div><dt>요청 일시</dt><dd>{formatDateTime(request.requestedAt)}</dd></div>
      {cancelable ? <div><dt>취소 기한</dt><dd>{formatDateTime(request.cancelableUntil)}까지</dd></div> : <div><dt>처리 상태</dt><dd>{request.status === "completed" ? "기록 파기 완료" : "기록 파기 진행 중"}</dd></div>}
    </dl>
    {cancelable && <p className="blocked-lead">취소 기한이 지나면 기록이 파기되며, 파기된 기록은 복구할 수 없습니다.</p>}
    {cancelable && <div className="blocked-actions"><button className="btn btn-outline" type="button" onClick={cancel} disabled={pending} aria-busy={pending}>{pending ? "취소 중" : "요청 취소"}</button></div>}
    {error && <p className="privacy-error" role="alert">{error}</p>}
    {foot}
  </main>;
}

export { AccessBlocked, PrivacyDialog, type AccessRestriction };
