import { useEffect, useRef, useState } from "react";
import "./insightAction.css";

// 조회 기간 옆의 「AI 분석 요청」 버튼 (시안 A). 누르면 동의 확인 창이 열리고, 「동의하고 요청」 뒤에는 진행 중 표시로 바뀐다.
// 아직 API 는 붙이지 않았다: 순서 · 예상 시간은 가짜 숫자다. 동의 기록은 리캡 스키마에 남기기로 했다 (다음 단계).
export type InsightMock = { state: "idle" } | { state: "queued"; ahead: number; etaSec: number };

export function InsightAction({ mock, onChange }: { mock: InsightMock; onChange: (next: InsightMock) => void }) {
  const [open, setOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [pulse, setPulse] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const queueDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { sync(dialog.current, open); }, [open]);
  useEffect(() => { sync(queueDialog.current, queueOpen); }, [queueOpen]);
  useEffect(() => {
    if (!pulse) return;
    const timer = window.setTimeout(() => setPulse(0), 700);
    return () => window.clearTimeout(timer);
  }, [pulse]);
  const agree = () => { setOpen(false); setPulse(n => n + 1); onChange({ state: "queued", ahead: 2, etaSec: 40 }); };
  const queued = mock.state === "queued";
  // 고리는 버튼 밖으로 퍼져야 하는데 btn-glow 가 overflow: hidden 이라, 버튼 옆에 두고 버튼 크기에 맞춘다.
  return <div className={`insight-action${pulse ? " is-pulse" : ""}${queued ? " is-queued" : ""}`}>
    <span key={pulse} className="insight-ring" aria-hidden="true" />
    {/* 버튼은 하나다. 진행 중이면 글이 바뀌고, 누르면 순서 창이 열린다. */}
    {queued
      ? <button type="button" className="btn btn-outline insight-btn insight-btn-queued" aria-haspopup="dialog" aria-live="polite" onClick={() => setQueueOpen(true)}>
          <i className="insight-dot" aria-hidden="true" />분석 진행 중 · 앞에 {mock.ahead}명
        </button>
      : <button type="button" className="btn btn-outline btn-glow insight-btn" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <svg className="insight-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>AI 분석 요청
        </button>}

    <dialog ref={dialog} className="insight-dialog" aria-labelledby="insight-dialog-title" onClose={() => setOpen(false)} onClick={e => { if (e.target === dialog.current) setOpen(false); }}>
      <div className="insight-panel">
        <header className="insight-dialog-head">
          <div>
            <p className="insight-dialog-kicker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>AI 분석</p>
            <h2 id="insight-dialog-title">내 채팅을 AI가 읽고 한 줄로 말해 줘요</h2>
          </div>
          <CloseButton onClick={() => setOpen(false)} />
        </header>
        <ul className="insight-terms">
          <li><b>내 채팅 원문이 외부 AI 서비스로 전송돼요.</b> 카드를 쓰는 데만 써요.</li>
          <li>만들어진 카드는 리캡에 저장되고 내 리캡에서만 보여요.</li>
          <li>AI가 쓴 글이라 틀린 부분이 있을 수 있어요.</li>
        </ul>
        <p className="insight-dialog-note">자세한 내용은 <a href="/privacy/">개인정보 처리방침</a>에 있어요.</p>
        <div className="insight-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>취소</button>
          <button type="button" className="btn btn-default" onClick={agree}>동의하고 요청</button>
        </div>
      </div>
    </dialog>

    <dialog ref={queueDialog} className="insight-dialog insight-queue-dialog" aria-labelledby="insight-queue-title" onClose={() => setQueueOpen(false)} onClick={e => { if (e.target === queueDialog.current) setQueueOpen(false); }}>
      <div className="insight-panel">
        <header className="insight-dialog-head">
          <div>
            <p className="insight-dialog-kicker"><i className="insight-dot" aria-hidden="true" />분석 진행 중</p>
            <h2 id="insight-queue-title">내 순서</h2>
          </div>
          <CloseButton onClick={() => setQueueOpen(false)} />
        </header>
        {queued && <dl className="insight-queue">
          <div><dt>앞에 기다리는 사람</dt><dd>{mock.ahead}명</dd></div>
          <div><dt>시작 예상</dt><dd>약 {mock.etaSec}초 뒤 시작 예정</dd></div>
          <div><dt>요청 시각</dt><dd>오늘 오후 4:32</dd></div>
        </dl>}
        <p className="insight-dialog-note">이 화면을 떠나도 계속 만들어져요. 끝나면 내 리캡에 카드가 나와요.</p>
        <div className="insight-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={() => { setQueueOpen(false); onChange({ state: "idle" }); }}>요청 취소</button>
          <button type="button" className="btn btn-default" onClick={() => setQueueOpen(false)}>닫기</button>
        </div>
      </div>
    </dialog>
  </div>;
}

function sync(el: HTMLDialogElement | null, open: boolean) {
  if (!el) return;
  if (open && !el.open) el.showModal();
  if (!open && el.open) el.close();
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return <button className="btn btn-ghost btn-sm btn-icon" type="button" onClick={onClick} aria-label="닫기">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
  </button>;
}
