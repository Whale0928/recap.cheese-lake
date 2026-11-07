import { useEffect, useRef, useState } from "react";
import { CloseButton } from "./InsightAction";
import { InsightCard } from "./InsightCard";
import type { InsightHandle } from "./useInsight";

// 「내 AI 분석 보기」 창. 위 버튼과 아래 요약 칸이 같은 창을 연다. 버튼 안이 아니라 페이지에 따로 두어, 어디서 열어도
// 화면이 위로 튀지 않는다. 포커스는 창 자체에 주되 preventScroll 로 바탕 화면을 움직이지 않고, 닫으면 누르던 버튼으로 돌아간다.
// 열 때마다 활동 로그(AI 분석 카드 열람)를 보낸다 — 상태 폴링 경로에는 남기지 않기로 했기 때문이다.
export function InsightViewDialog({ insight }: { insight: InsightHandle }) {
  const { open, setOpen, phase, tickets } = insight;
  const dialog = useRef<HTMLDialogElement>(null);
  const downloading = useRef(false);
  const [downloadState, setDownloadState] = useState<"idle" | "pending" | "failed">("idle");
  const st = phase.kind === "ready" ? phase.status : null;
  const result = st?.state === "done" ? st.result : undefined;
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open === "view" && result && !el.open) {
      el.showModal(); el.focus({ preventScroll: true }); el.scrollTop = 0;
      void fetch("/api/activity/page-views", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: "insight" }) }).catch(() => undefined);
    }
    if ((open !== "view" || !result) && el.open) el.close();
  }, [open, result]);
  const close = () => setOpen("");
  const download = async () => {
    const card = dialog.current?.querySelector<HTMLElement>(".vc");
    if (!card || downloading.current) return;
    downloading.current = true; setDownloadState("pending");
    try {
      const { downloadInsightCard } = await import("./insight.download");
      await downloadInsightCard(card);
      setDownloadState("idle");
    } catch { setDownloadState("failed"); }
    finally { downloading.current = false; }
  };
  return <dialog ref={dialog} className="insight-view-dialog" aria-label="내 AI 분석" tabIndex={-1} onClose={() => { if (open === "view") close(); }} onClick={e => { if (e.target === dialog.current) close(); }}>
    <div className="insight-view-head">
      {/* 새로 만들기는 티켓이 있을 때만. 동의 창은 버튼 쪽 것을 그대로 쓴다 */}
      {tickets > 0 && <button type="button" className="btn btn-outline btn-sm insight-view-again" onClick={() => setOpen("consent")}>새로 분석하기 · 티켓 {tickets}장</button>}
      {result && <button type="button" className="btn btn-outline btn-sm insight-download" disabled={downloadState === "pending"} aria-busy={downloadState === "pending"} onClick={() => { void download(); }}>{downloadState === "pending" ? "저장 중…" : downloadState === "failed" ? "다시 다운로드" : "다운로드"}</button>}
      <CloseButton onClick={close} />
    </div>
    {downloadState === "failed" && <p className="insight-download-error" role="alert">이미지를 저장하지 못했습니다. 다시 시도해 주세요.</p>}
    {result && <InsightCard insight={result} finishedAt={st?.finishedAt ?? undefined} />}
  </dialog>;
}
