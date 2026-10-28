import { useEffect, useRef, useState } from "react";
import { cardFileName, cardTheme, type CardInput } from "./relationship.card";
import { renderCardImage } from "./relationship.card.render";

type CardState = { status: "pending" } | { status: "ready"; url: string } | { status: "failed" };

// 브라우저가 그린 카드 PNG를 먼저 보여 주고, 이용자가 확인한 뒤에만 내려받게 한다.
export function RelationshipCardDialog({ open, channelId, hasAvatar, input, onClose }: { open: boolean; channelId: string; hasAvatar: boolean; input: CardInput; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<CardState>({ status: "pending" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    let objectUrl: string | undefined;
    setState({ status: "pending" });
    const theme = cardTheme(document.documentElement, window.matchMedia("(prefers-color-scheme: dark)").matches);
    renderCardImage(channelId, hasAvatar, input, theme)
      .then(blob => {
        const url = URL.createObjectURL(blob);
        if (!active) { URL.revokeObjectURL(url); return; }
        objectUrl = url;
        setState({ status: "ready", url });
      }, () => { if (active) setState({ status: "failed" }); });
    // 창을 닫거나 다시 만들면 이전 이미지 주소를 해제한다.
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // input 은 렌더마다 새 객체이므로 창을 열 때와 다시 시도할 때만 그린다.
  }, [open, channelId, attempt]);
  const title = `${input.channelName || "선택한 채널"} 채널 기록 카드`;
  return <dialog ref={dialog} className="relationship-card-dialog" aria-labelledby="relationship-card-title" onClose={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="relationship-card-panel">
      <header className="relationship-card-head">
        <div><h2 id="relationship-card-title">이미지 미리보기</h2><p>이 이미지가 저장됩니다. 채팅 원문과 다른 채널 활동은 담기지 않습니다.</p></div>
        <button className="btn btn-ghost btn-sm btn-icon" type="button" onClick={onClose} aria-label="닫기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </header>
      <div className="relationship-card-preview" aria-busy={state.status === "pending"}>
        {state.status === "ready" && <img src={state.url} alt={title} width={1080} height={1350} />}
        {state.status === "pending" && <p role="status">이미지 만드는 중…</p>}
        {state.status === "failed" && <p role="status">이미지 생성 실패 · 잠시 후 다시 시도</p>}
      </div>
      <div className="relationship-card-actions">
        {state.status === "ready" && <a className="btn btn-default" href={state.url} download={cardFileName(input.channelName, input.today)}>내려받기</a>}
        {state.status === "pending" && <button className="btn btn-default" type="button" disabled aria-busy="true">만드는 중</button>}
        {state.status === "failed" && <button className="btn btn-default" type="button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button>}
        <button className="btn btn-outline" type="button" onClick={onClose}>닫기</button>
      </div>
    </div>
  </dialog>;
}
