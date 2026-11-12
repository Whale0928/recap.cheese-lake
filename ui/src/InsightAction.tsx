import { couponError } from "./coupon";
import { useEffect, useRef, useState } from "react";
import type { InsightDenial, InsightHandle, InsightNotice } from "./useInsight";
import "./insightAction.css";

// 조회 기간 옆의 버튼 하나가 흐름을 다 맡는다 (시안 A):
//   「AI 분석 받아보기」 → 동의 창 → 「분석 진행 중 · 앞에 n명」(누르면 순서 창) → 「내 AI 분석 보기」(누르면 카드 창)
// 티켓이 없으면 버튼이 잠기고, 누르면 흔들리며 까닭을 한 줄 보여 준다. 요청이 거절돼도 같은 자리에서 말한다.
const DENIAL_TEXT: Record<InsightDenial, string> = {
  no_ticket: "분석 티켓이 없어요",
  rate_limited: "요청이 몰려요. 잠시 뒤 다시 눌러 주세요",
  unavailable: "지금은 분석을 받을 수 없어요",
  error: "요청을 보내지 못했어요",
};
function noticeText(n: InsightNotice): string {
  switch (n.kind) {
    case "done": return "AI 분석이 끝났어요";
    case "failed": return "분석이 실패했어요. 티켓은 돌려드렸어요";
    case "redeemed": return `분석 티켓 ${n.granted}장을 받았어요`;
    case "redeem_failed": return couponError(n.code);
  }
}
const etaText = (sec: number) => sec < 60 ? `${Math.max(5, Math.round(sec / 5) * 5)}초` : `${Math.ceil(sec / 60)}분`;
const timeText = (s: string) => new Date(s).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });

export function InsightAction({ insight }: { insight: InsightHandle }) {
  const { phase, busy, pending, done, tickets, denial, open, setOpen, request, clearDenial, notice, clearNotice } = insight;
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
  // 끝났다는 토스트는 몇 초 뒤 저절로 사라진다. 「보기」를 누르면 바로 카드 창이다.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clearNotice, 7000);
    return () => window.clearTimeout(timer);
  }, [notice, clearNotice]);
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

  // 요청 버튼과 티켓 안내는 조작용이라 저장 이미지에서는 뺀다.
  // 고리는 버튼 밖으로 퍼져야 하는데 btn-glow 가 overflow: hidden 이라, 버튼 옆에 두고 버튼 크기에 맞춘다.
  return <div data-image-download-exclude className={`insight-action${pulse ? " is-pulse" : ""}${shaking ? " is-shake" : ""}`} onAnimationEnd={e => { if (e.animationName === "insight-shake") setShaking(false); }}>
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
      : <button type="button" className={`btn insight-btn insight-btn-request ${locked ? "btn-outline insight-btn-locked" : "btn-default insight-btn-ready"}`} aria-haspopup={locked ? undefined : "dialog"} aria-disabled={locked || busy} aria-busy={busy} onClick={busy ? undefined : press}>
          {locked
            ? <svg className="insight-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            : <svg className="insight-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>}
          AI 분석 받아보기
          {/* 버튼에 붙은 티켓 조각: 티켓 한 장을 내고 받는 기능이라는 것을 버튼 안에서 보여 준다. */}
          <span className="insight-stub">{locked ? "티켓 필요" : `티켓 ${tickets}장`}</span>
        </button>}
    {(denial || lockedNote) && <p className="insight-denial" role="status">{denial ? DENIAL_TEXT[denial] : DENIAL_TEXT.no_ticket}</p>}
    {!locked && !pending && !done && phase.kind !== "loading" && tickets > 0 && <p className="insight-tickets"><TicketIcon />선물 받은 티켓이에요. 지금 바로 쓸 수 있어요</p>}

    {notice && <div className={`insight-toast is-${notice.kind}`} role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>
      <span>{noticeText(notice)}</span>
      {notice.kind === "done" && <button type="button" className="btn btn-default btn-sm" onClick={() => { clearNotice(); setOpen("view"); }}>보기</button>}
      <button type="button" className="insight-toast-close" aria-label="닫기" onClick={clearNotice}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>}

    <dialog ref={consentDialog} className="insight-dialog" aria-labelledby="insight-dialog-title" onClose={() => { if (open === "consent") close(); }} onClick={e => { if (e.target === consentDialog.current) close(); }}>
      <div className="insight-panel">
        <header className="insight-dialog-head">
          <div>
            <p className="insight-dialog-kicker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>AI 분석</p>
            <h2 id="insight-dialog-title">AI가 채팅방 속 나를 알려 줘요</h2>
          </div>
          <CloseButton onClick={close} />
        </header>
        <p className="insight-dialog-lead">내 채팅을 바탕으로 한 줄 소개와 칭호가 담긴 카드를 만들어요. 카드는 나만 볼 수 있어요.</p>
        <p className="insight-dialog-ticket"><TicketIcon />티켓 1장 사용 · 지금 {tickets}장 있어요</p>
        {/* 동의 내용은 그대로 두고 접어 둔다. 펼치지 않아도 무엇에 동의하는지는 접힌 제목이 말한다. */}
        <details className="insight-terms">
          <summary>채팅 전송과 저장 안내</summary>
          <ul>
            <li>카드를 만들기 위해 내 채팅 원문이 외부 AI 서비스로 전송돼요. 카드를 쓰는 데만 써요.</li>
            <li>만들어진 카드는 리캡에 저장되고 내 리캡에서만 보여요.</li>
            <li>AI가 쓴 글이라 틀린 부분이 있을 수 있어요.</li>
            {done && <li>새로 만들면 지금 카드는 바뀌어요.</li>}
          </ul>
          <p>자세한 내용은 <a href="/privacy/">개인정보 처리방침</a>에 있어요.</p>
        </details>
        <div className="insight-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={close}>취소</button>
          <button type="button" className="btn btn-default" onClick={agree}>동의하고 요청</button>
        </div>
      </div>
    </dialog>

    <dialog ref={queueDialog} className="insight-dialog insight-queue-dialog" aria-labelledby="insight-queue-title" onClose={() => { if (open === "queue") close(); }} onClick={e => { if (e.target === queueDialog.current) close(); }}>
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

export function TicketIcon() {
  return <svg className="insight-ticket-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" /><path d="M14 7v10" strokeDasharray="2 2" /></svg>;
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
