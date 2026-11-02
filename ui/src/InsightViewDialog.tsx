import { useEffect, useRef } from "react";
import { CloseButton, type InsightMockHandle } from "./InsightAction";
import { InsightCard } from "./InsightCard";
import { SAMPLE_FINISHED_AT, SAMPLE_INSIGHT } from "./insight.sample";

// 「내 AI 분석 보기」 창. 위 버튼과 아래 요약 칸이 같은 창을 연다. 버튼 안이 아니라 페이지에 따로 두어, 어디서 열어도
// 화면이 위로 튀지 않는다. 포커스는 창 자체에 주되 preventScroll 로 바탕 화면을 움직이지 않고, 닫으면 누르던 버튼으로 돌아간다.
export function InsightViewDialog({ handle: { open, setOpen } }: { handle: InsightMockHandle }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open === "view" && !el.open) { el.showModal(); el.focus({ preventScroll: true }); el.scrollTop = 0; }
    if (open !== "view" && el.open) el.close();
  }, [open]);
  const close = () => setOpen("");
  return <dialog ref={dialog} className="insight-view-dialog" aria-label="내 AI 분석" tabIndex={-1} onClose={close} onClick={e => { if (e.target === dialog.current) close(); }}>
    <div className="insight-view-head"><CloseButton onClick={close} /></div>
    <InsightCard insight={SAMPLE_INSIGHT} finishedAt={SAMPLE_FINISHED_AT} />
  </dialog>;
}
