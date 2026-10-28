import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ReceivedShare } from "./relationship.share";
import { ShareRecordDialog } from "./ShareRecordDialog";
import { ShareStage } from "./ShareStage";
import { DEFAULT_SHARE_VIEW, MODE_HINT, SHARE_VIEWS, SHARE_VIEW_KEY, parseReceivedShare, parseShareView, type ShareView } from "./sharedViews";
import "./receivedShares.css";

const loadView = (): ShareView => {
  try { return parseShareView(window.localStorage.getItem(SHARE_VIEW_KEY)); } catch { return DEFAULT_SHARE_VIEW; }
};
// 보기 방식은 이 브라우저에서만 쓰는 편의 설정이라, 저장하지 못해도 화면은 그대로 동작한다.
const saveView = (view: ShareView) => {
  try { window.localStorage.setItem(SHARE_VIEW_KEY, view); } catch { /* 저장소를 쓸 수 없는 환경에서는 기억하지 않는다 */ }
};

function ViewSwitch({ view, onChange }: { view: ShareView; onChange: (view: ShareView) => void }) {
  return <div className="share-view-switch" role="group" aria-label="보기 방식" style={{ "--n": SHARE_VIEWS.length, "--i": SHARE_VIEWS.findIndex(item => item.id === view) } as CSSProperties}>
    {SHARE_VIEWS.map(item => <button key={item.id} type="button" aria-pressed={item.id === view} onClick={() => onChange(item.id)}>{item.label}</button>)}
  </div>;
}

// 공유받은 리캡 페이지에서만 시청자 목록을 조회한다. 보기 방식은 페이지 제목 옆에 두고, 계산과 움직임은 모두 브라우저에서 한다.
export function ReceivedShares() {
  const [shares, setShares] = useState<ReceivedShare[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "guest" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<ShareView>(loadView);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shuffleTick, setShuffleTick] = useState(0);
  const [pickTick, setPickTick] = useState(0);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("shared-view-slot")), []);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch("/api/me/shares/received", { credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async response => {
        if (controller.signal.aborted) return;
        if (response.status === 401) { setStatus("guest"); return; }
        if (!response.ok) throw new Error("Received shares request failed");
        const body = await response.json() as { shares?: unknown };
        if (!Array.isArray(body.shares)) throw new Error("Received shares response malformed");
        if (!controller.signal.aborted) {
          setShares(body.shares.map(parseReceivedShare).filter((share): share is ReceivedShare => share !== null));
          setStatus("ready");
        }
      })
      .catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [attempt]);
  const changeView = (next: ShareView) => { setView(next); saveView(next); };
  if (status === "loading") return <p className="activity-notice" role="status">불러오는 중</p>;
  if (status === "guest") return <section className="me-section"><a className="btn btn-default" href="/auth/login">로그인하기</a></section>;
  if (status === "error") return <section className="me-section" role="status"><p>공유받은 리캡을 불러오지 못했어요.</p><button className="btn btn-outline" type="button" onClick={() => setAttempt(n => n + 1)}>다시 조회</button></section>;
  if (!shares.length) return <section className="me-section" role="status">아직 공유받은 리캡이 없어요.</section>;
  const selected = shares.find(share => share.ownerChannelId === selectedId) ?? shares[0];
  const opened = shares.find(share => share.ownerChannelId === openId) ?? null;
  // 누르는 즉시 기록을 모달로 연다. 고른 시청자도 함께 바뀐다.
  const open = (id: string) => { setSelectedId(id); setOpenId(id); };
  const switcher = <ViewSwitch view={view} onChange={changeView} />;
  return <>
    {slot ? createPortal(switcher, slot) : switcher}
    <section className="me-section recap-received share-views" aria-labelledby="received-heading">
      <div className="me-section-heading"><div><h2 id="received-heading">나에게 보여 준 기록</h2><p className="me-source">내 방송에서 남긴 자기 기록을 보여 주기로 한 시청자예요.</p></div><span className="me-status">시청자 {shares.length}명</span></div>
      <ShareStage shares={shares} mode={view} selectedId={selected.ownerChannelId} onSelect={setSelectedId} onOpen={open} shuffleTick={shuffleTick} pickTick={pickTick} />
      <div className="share-tools">
        <p className="share-hint">{MODE_HINT[view]}</p>
        <div className="share-actions">
          {view === "fan" && <button className="btn btn-outline share-tool" type="button" onClick={() => setShuffleTick(n => n + 1)}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4.5h2.2c1.6 0 2.4.8 3.3 2.2l1.1 1.6c.9 1.4 1.7 2.2 3.3 2.2H14M2 11.5h2.2c1.6 0 2.4-.8 3.3-2.2M10.4 4.5c-.9.6-1.4 1.2-1.9 2M12 3l2 1.5-2 1.5M12 10l2 1.5-2 1.5" /></svg>
            셔플
          </button>}
          <button className="btn btn-outline share-tool" type="button" onClick={() => setPickTick(n => n + 1)}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /><circle cx="5.7" cy="5.7" r=".7" fill="currentColor" /><circle cx="10.3" cy="10.3" r=".7" fill="currentColor" /><circle cx="8" cy="8" r=".7" fill="currentColor" /></svg>
            랜덤 선택
          </button>
        </div>
      </div>
    </section>
    <ShareRecordDialog share={opened} onClose={() => setOpenId(null)} />
  </>;
}
