import { useEffect, useRef, useState } from "react";
import type { InsightDenial, InsightHandle } from "./useInsight";
import "./insightAction.css";

// 조회 기간 옆의 버튼 하나가 흐름을 다 맡는다 (시안 A):
//   「AI 분석 요청」 → 동의 창 → 「분석 진행 중 · 앞에 n명」(누르면 순서 창) → 「내 AI 분석 보기」(누르면 카드 창)
// 티켓이 없으면 버튼이 잠기고, 누르면 흔들리며 까닭을 한 줄 보여 준다. 요청이 거절돼도 같은 자리에서 말한다.
const DENIAL_TEXT: Record<InsightDenial, string> = {
  no_ticket: "분석 티켓이 없어요",
  rate_limited: "요청이 몰려요. 잠시 뒤 다시 눌러 주세요",
  unavailable: "지금은 분석을 받을 수 없어요",
  error: "요청을 보내지 못했어요",
};
const etaText = (sec: number) => sec < 60 ? `${Math.max(5, Math.round(sec / 5) * 5)}초` : `${Math.ceil(sec / 60)}분`;
const timeText = (s: string) => new Date(s).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });

export function InsightAction({ insight }: { insight: InsightHandle }) {
  const { phase, busy, pending, done, tickets, denial, open, setOpen, request, clearDenial } = insight;
  const [pulse, setPulse] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [lockedNote, setLockedNote] = useState(false);
  const consentDialog = useRef<HTMLDialogElement>(null);
  const queueDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { sync(consentDialog.current, open === "consent"); sync(queueDialog.current, open === "queue"); }, [open]);
  useEffect(() => {
    if (!pulse) return;
    const timer = window.setTimeout(() => setPulse(0), 700);
    return () => window.clearTimeout(timer);
  }, [pulse]);
  // 거절되면 흔들고, 까닭은 몇 초 보여 준 뒤 지운다. 잠긴 버튼을 눌렀을 때도 같다.
  useEffect(() => {
    if (!denial) return;
    setShaking(true);
    const timer = window.setTimeout(clearDenial, 4000);
    return () => window.clearTimeout(timer);
  }, [denial, clearDenial]);
  useEffect(() => {
    if (!lockedNote) return;
    const timer = window.setTimeout(() => setLockedNote(false), 4000);
    return () => window.clearTimeout(timer);
  }, [lockedNote]);
  if (phase.kind === "guest") return null;
  const st = phase.kind === "ready" ? phase.status : null;
  const locked = phase.kind !== "loading" && !pending && !done && tickets === 0;
  const close = () => setOpen("");
  const agree = () => { close(); setPulse(n => n + 1); request(done); };
  const press = () => {
    if (pending) { setOpen("queue"); return; }
    if (done) { setOpen("view"); return; }
    if (locked) { setShaking(true); setLockedNote(true); return; }
    setOpen("consent");
  };

  // 고리는 버튼 밖으로 퍼져야 하는데 btn-glow 가 overflow: hidden 이라, 버튼 옆에 두고 버튼 크기에 맞춘다.
  return <div className={`insight-action${pulse ? " is-pulse" : ""}${shaking ? " is-shake" : ""}`} onAnimationEnd={e => { if (e.animationName === "insight-shake") setShaking(false); }}>
    <span key={pulse} className="insight-ring" aria-hidden="true" />
    {phase.kind === "loading"
      ? <button type="button" className="btn btn-outline insight-btn" disabled aria-busy="true">확인 중…</button>
      : pending && st
      ? <button type="button" className="btn btn-outline insight-btn insight-btn-queued" aria-haspopup="dialog" aria-live="polite" onClick={press}>
          <i className="insight-dot" aria-hidden="true" />{st.state === "running" ? "분석 중…" : `분석 진행 중${st.queueAhead !== undefined ? ` · 앞에 ${st.queueAhead}명` : ""}`}
        </button>
      : done
      ? <button type="button" className="btn btn-default insight-btn insight-btn-done" aria-haspopup="dialog" onClick={press}>
          <svg className="insight-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>내 AI 분석 보기
        </button>
      : <button type="button" className={`btn btn-outline insight-btn${locked ? " insight-btn-locked" : " btn-glow"}`} aria-haspopup={locked ? undefined : "dialog"} aria-disabled={locked || busy} aria-busy={busy} onClick={busy ? undefined : press}>
          {locked
            ? <svg className="insight-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            : <svg className="insight-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>}
          AI 분석 요청
        </button>}
    {(denial || lockedNote) && <p className="insight-denial" role="status">{denial ? DENIAL_TEXT[denial] : DENIAL_TEXT.no_ticket}</p>}
    {!locked && !pending && !done && phase.kind !== "loading" && tickets > 0 && <p className="insight-tickets">티켓 {tickets}장</p>}

    <dialog ref={consentDialog} className="insight-dialog" aria-labelledby="insight-dialog-title" onClose={close} onClick={e => { if (e.target === consentDialog.current) close(); }}>
      <div className="insight-panel">
        <header className="insight-dialog-head">
          <div>
            <p className="insight-dialog-kicker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>AI 분석</p>
            <h2 id="insight-dialog-title">내 채팅을 AI가 읽고 한 줄로 말해 줘요</h2>
          </div>
          <CloseButton onClick={close} />
        </header>
        <ul className="insight-terms">
          <li><b>내 채팅 원문이 외부 AI 서비스로 전송돼요.</b> 카드를 쓰는 데만 써요.</li>
          <li>만들어진 카드는 리캡에 저장되고 내 리캡에서만 보여요.</li>
          <li>AI가 쓴 글이라 틀린 부분이 있을 수 있어요.</li>
          <li>티켓 한 장을 써요. 지금 {tickets}장 있어요.{done ? " 새로 만들면 지금 카드는 바뀌어요." : ""}</li>
        </ul>
        <p className="insight-dialog-note">자세한 내용은 <a href="/privacy/">개인정보 처리방침</a>에 있어요.</p>
        <div className="insight-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={close}>취소</button>
          <button type="button" className="btn btn-default" onClick={agree}>동의하고 요청</button>
        </div>
      </div>
    </dialog>

    <dialog ref={queueDialog} className="insight-dialog insight-queue-dialog" aria-labelledby="insight-queue-title" onClose={close} onClick={e => { if (e.target === queueDialog.current) close(); }}>
      <div className="insight-panel">
        <header className="insight-dialog-head">
          <div>
            <p className="insight-dialog-kicker"><i className="insight-dot" aria-hidden="true" />{st?.state === "running" ? "분석 중" : "분석 진행 중"}</p>
            <h2 id="insight-queue-title">내 순서</h2>
          </div>
          <CloseButton onClick={close} />
        </header>
        {st && <dl className="insight-queue">
          <div><dt>앞에 기다리는 사람</dt><dd>{st.state === "running" ? "없음 · 내 차례" : st.queueAhead !== undefined ? `${st.queueAhead}명` : "확인 중"}</dd></div>
          <div><dt>시작 예상</dt><dd>{st.state === "running" ? "읽는 중이에요" : st.queueEtaSec !== undefined ? `약 ${etaText(st.queueEtaSec)} 뒤 시작 예정` : "곧"}</dd></div>
          <div><dt>요청 시각</dt><dd>{timeText(st.enqueuedAt)}</dd></div>
        </dl>}
        <p className="insight-dialog-note">이 화면을 떠나도 계속 만들어져요. 끝나면 버튼이 「내 AI 분석 보기」로 바뀌어요.</p>
        <div className="insight-dialog-actions">
          <button type="button" className="btn btn-default" onClick={close}>닫기</button>
        </div>
      </div>
    </dialog>
  </div>;
}

export function sync(el: HTMLDialogElement | null, open: boolean) {
  if (!el) return;
  if (open && !el.open) el.showModal();
  if (!open && el.open) el.close();
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return <button className="btn btn-ghost btn-sm btn-icon" type="button" onClick={onClick} aria-label="닫기">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
  </button>;
}
