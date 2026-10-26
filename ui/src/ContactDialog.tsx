import { useEffect, useRef, useState, type FormEvent } from "react";
import "./contact.css";

type AuthState = "loading" | "guest" | "authenticated";
type InquiryType = "question" | "bug" | "other";
type InquiryStatus = "received" | "in_progress" | "answered" | "completed";
type Inquiry = { id: string; type: InquiryType; body: string; status: InquiryStatus; createdAt: string; reply?: { body: string; createdAt: string } | null };
type View = "form" | "done" | "list";

const CONTACT_EMAIL = "recap@cheese-lake.com";
const BODY_LIMIT = 2000;

const typeOptions: [InquiryType, string][] = [["question", "서비스 문의"], ["bug", "오류 제보"], ["other", "기타"]];
const typeLabels = Object.fromEntries(typeOptions) as Record<InquiryType, string>;

const statusLabels: Record<InquiryStatus, string> = { received: "접수됨", in_progress: "처리 중", answered: "답변 완료", completed: "처리 완료" };
const statusBadge: Record<InquiryStatus, string> = { received: "badge-outline", in_progress: "badge-secondary", answered: "badge-default", completed: "badge-default" };
const formatDate = (value: string) => new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

function GuestChoice() {
  return <div className="contact-choice">
    <section className="contact-option">
      <h3>로그인 후 문의</h3>
      <p>답변은 "내 문의"에서 확인할 수 있습니다.</p>
      <a className="btn btn-default" href="/auth/login">치지직 로그인</a>
    </section>
    <section className="contact-option">
      <h3>이메일 문의</h3>
      <p>로그인 없이 문의할 수 있습니다.<br />답변은 보낸 주소로 드립니다.</p>
      <a className="btn btn-outline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    </section>
  </div>;
}

function InquiryForm({ onSent }: { onSent: (inquiry: Inquiry | null) => void }) {
  const [type, setType] = useState<InquiryType | "">("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!type || !body.trim()) { setError("문의 유형과 내용을 입력해 주세요."); return; }
    setError(""); setPending(true);
    fetch("/api/inquiries", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ type, body: body.trim() }) })
      .then(async response => {
        if (!response.ok) throw new Error(`문의 접수 실패: ${response.status}`);
        onSent(await response.json().catch(() => null) as Inquiry | null);
      })
      .catch(() => setError("전송에 실패했습니다. 잠시 후 다시 시도하거나 이메일로 보내 주세요."))
      .finally(() => setPending(false));
  };
  return <form className="contact-form" onSubmit={submit} noValidate>
    <label className="label" htmlFor="contact-type">문의 유형</label>
    <select className="contact-select" id="contact-type" value={type} onChange={event => setType(event.target.value as InquiryType | "")} required>
      <option value="">유형을 선택하세요</option>
      {typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <label className="label" htmlFor="contact-body">내용</label>
    <textarea className="contact-textarea" id="contact-body" value={body} maxLength={BODY_LIMIT} onChange={event => setBody(event.target.value)} placeholder="내용을 입력해 주세요." required />
    <div className="contact-form-meta">
      <p>연락처, 신분증 등 개인정보는 적지 마세요.</p>
      <span className="mono" aria-live="polite">{body.length} / {BODY_LIMIT}</span>
    </div>
    {error && <p className="contact-error" role="alert">{error}</p>}
    <div className="contact-actions"><button className="btn btn-default" type="submit" disabled={pending} aria-busy={pending}>{pending ? "보내는 중" : "보내기"}</button></div>
  </form>;
}

function InquiryList() {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; inquiries: Inquiry[] } | { status: "error" }>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/inquiries", { headers: { Accept: "application/json" }, credentials: "same-origin", signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`문의 목록 조회 실패: ${response.status}`); return response.json() as Promise<{ inquiries: Inquiry[] }>; })
      .then(result => setState({ status: "ready", inquiries: Array.isArray(result.inquiries) ? result.inquiries : [] }))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setState({ status: "error" }); });
    return () => controller.abort();
  }, []);
  if (state.status === "loading") return <p className="contact-empty">불러오는 중…</p>;
  if (state.status === "error") return <p className="contact-empty">목록을 불러오지 못했습니다.</p>;
  if (!state.inquiries.length) return <p className="contact-empty">보낸 문의가 없습니다.</p>;
  return <ul className="contact-list">{state.inquiries.map(inquiry => <li key={inquiry.id}>
    <details>
      <summary>
        <span className="contact-list-title">{typeLabels[inquiry.type] ?? "문의"}</span>
        <span className={`badge ${statusBadge[inquiry.status] ?? "badge-outline"}`}>{statusLabels[inquiry.status] ?? "접수됨"}</span>
        <span className="contact-list-meta mono">{formatDate(inquiry.createdAt)} 접수</span>
      </summary>
      <div className="contact-thread">
        <article><header>내 문의</header><p>{inquiry.body}</p></article>
        {inquiry.reply && <article className="contact-reply"><header>운영자 답변 · {formatDate(inquiry.reply.createdAt)}</header><p>{inquiry.reply.body}</p></article>}
      </div>
    </details>
  </li>)}</ul>;
}

function ContactDialog({ open, authState, onClose }: { open: boolean; authState: AuthState; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View>("form");
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) { setView("form"); element.showModal(); }
    if (!open && element.open) element.close();
  }, [open]);
  const authenticated = authState === "authenticated";
  return <dialog ref={dialog} className="contact-dialog" aria-labelledby="contact-title" onClose={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="contact-panel">
      <header className="contact-head">
        <div><h2 id="contact-title">문의하기</h2><p>서비스 이용 문의와 오류 제보를 받습니다.</p></div>
        <button className="btn btn-ghost btn-sm btn-icon" type="button" onClick={onClose} aria-label="닫기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </header>
      {authState === "loading" && <p className="contact-empty">확인 중…</p>}
      {authState === "guest" && <GuestChoice />}
      {authenticated && <>
        <div className="contact-tabs" role="tablist" aria-label="문의 화면">
          <button type="button" role="tab" aria-selected={view !== "list"} onClick={() => setView("form")}>문의 작성</button>
          <button type="button" role="tab" aria-selected={view === "list"} onClick={() => setView("list")}>내 문의</button>
        </div>
        {view === "form" && <InquiryForm onSent={() => setView("done")} />}
        {view === "done" && <div className="contact-done" role="status">
          <h3>문의가 접수되었습니다.</h3>
          <p>답변은 "내 문의"에서 확인할 수 있습니다.</p>
          <div className="contact-actions"><button className="btn btn-default" type="button" onClick={() => setView("list")}>내 문의 보기</button><button className="btn btn-outline" type="button" onClick={onClose}>닫기</button></div>
        </div>}
        {view === "list" && <InquiryList />}
        <p className="contact-foot">이메일 문의: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      </>}
    </div>
  </dialog>;
}

export { ContactDialog };
