import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import type { RecapResponse } from "./activity.types";
import { dateTime, PeriodLabel, ResultNotice, SummaryValues, useActivity } from "./ActivityView";
import { ActivityPatternChart } from "./ActivityPatternChart";
import { ActivityChannels } from "./ActivityChannels";
import { ActivityCalendar } from "./ActivityCalendar";
import { RecapProfile } from "./RecapProfile";
import "./me.css";
import "./recapOverview.css";
import { HomeChannelCard } from "./HomeChannelCard";
import { useChannelProfiles } from "./useChannelProfiles";
import { TraitsCard } from "./TraitsCard";
import { InsightAction } from "./InsightAction";
import { useInsight } from "./useInsight";
import { InsightSummary } from "./InsightSummary";
import { InsightViewDialog } from "./InsightViewDialog";
/** 이 페이지가 떠 있는 동안 이미 보낸 쿠폰 코드 */
const redeemedCodes = new Set<string>();

// 머리글에 쓸 닉네임. 세션 응답의 channelName 이고, 못 읽거나 손님이면 「내 리캡」으로 둔다. 활동 로그에는 남지 않는 조회다.
function useSessionName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session", { credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal })
      .then(r => r.ok ? r.json() as Promise<{ loggedIn: boolean; session?: { channelName?: string } }> : null)
      .then(s => { if (!controller.signal.aborted && s?.loggedIn && s.session?.channelName) setName(s.session.channelName); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return name;
}

export function RecapPage() {
  const sessionName = useSessionName();
  const page = useRef<HTMLElement>(null), downloading = useRef(false);
  const [downloadState, setDownloadState] = useState<"idle" | "pending" | "failed">("idle");
  const download = async () => {
    if (!page.current || downloading.current) return;
    downloading.current = true; setDownloadState("pending");
    try {
      const { downloadRecapPage } = await import("./recap.download");
      await downloadRecapPage(page.current);
      setDownloadState("idle");
    } catch { setDownloadState("failed"); }
    finally { downloading.current = false; }
  };
  const currentMonth = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);
  const [mode, setMode] = useState<"all" | "month">("all");
  const [weekday, setWeekday] = useState(0);
  const [month, setMonth] = useState(currentMonth);
  const [attempt, setAttempt] = useState(0);
  const search = mode === "all" ? "period=all" : new URLSearchParams({ month }).toString();
  const url = `/api/recap?${search}`;
  const state = useActivity<RecapResponse>(url, attempt);
  const profileChannels = useChannelProfiles(state.status === "ready" && state.data.channels.status === "ready" ? state.data.channels.data.channels : [], state.status === "ready" && state.source === url && !state.refreshing ? state.data.profileRefresh : undefined, `/api/me/activity/profiles?${search}`);
  const spacer = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ element: Element; top: number } | null>(null);
  const preservePosition = (event: SyntheticEvent<HTMLElement>) => {
    const element = event.currentTarget.closest(".activity-filters");
    if (element) anchor.current = { element, top: element.getBoundingClientRect().top };
  };
  useEffect(() => {
    const cancel = () => { anchor.current = null; };
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchmove", cancel, { passive: true });
    return () => { window.removeEventListener("wheel", cancel); window.removeEventListener("touchmove", cancel); };
  }, []);
  useLayoutEffect(() => {
    const current = anchor.current;
    if (!current?.element.isConnected) { anchor.current = null; return; }
    const delta = current.element.getBoundingClientRect().top - current.top;
    if (Math.abs(delta) > 1) {
      const target = window.scrollY + delta;
      const missing = target - (document.documentElement.scrollHeight - window.innerHeight);
      // 페이지 하단에서도 클릭한 필터 위치를 유지할 만큼만 공간을 확보한다.
      if (missing > 0 && spacer.current) spacer.current.style.height = `${spacer.current.offsetHeight + Math.ceil(missing)}px`;
      window.scrollTo({ top: target, behavior: "instant" });
    }
    if (state.status === "guest" || state.status === "error" || state.status === "ready" && !state.refreshing && (state.source === url || state.refreshFailed)) anchor.current = null;
  }, [state, url]);
  const insight = useInsight();
  // 쿠폰 링크(/recap/?ticket=CODE)로 들어오면 로그인 확인 뒤 한 번 받고, 주소에서 코드를 지운다 — 새로고침에 또 받지 않게.
  // StrictMode 가 effect 를 두 번 돌리거나 페이지가 다시 마운트돼도 같은 코드를 한 번만 보내도록 모듈 단위로 기억한다.
  useEffect(() => {
    if (insight.phase.kind === "loading" || insight.phase.kind === "guest") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ticket");
    if (!code || redeemedCodes.has(code)) return;
    redeemedCodes.add(code);
    params.delete("ticket");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    insight.redeem(code);
  }, [insight]);
  const data = state.status === "ready" ? state.data : null;
  const channelResult = data?.channels.status === "ready" ? { ...data.channels, data: { ...data.channels.data, channels: profileChannels } } : data?.channels;
  const periodControls = <div className="activity-filters">
      <div className="activity-period-tabs" role="group" aria-label="조회 기간">
        <button type="button" className={`btn ${mode === "all" ? "btn-default" : "btn-outline"}`} aria-pressed={mode === "all"} onClick={event => { preservePosition(event); setMode("all"); }}>전체</button>
        <button type="button" className={`btn ${mode === "month" ? "btn-default" : "btn-outline"}`} aria-pressed={mode === "month"} onClick={event => { preservePosition(event); setMode("month"); }}>월별</button>
      </div>
      {mode === "month" && <label>조회 월<input type="month" required value={month} min="1970-02" max={currentMonth} onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) && e.target.value >= "1970-02" && e.target.value <= currentMonth) { preservePosition(e); setMonth(e.target.value); } }} /></label>}
    </div>;
  return <main ref={page} id="main" className="me-main recap-data" data-image-period={state.status === "ready" ? state.source.split("?")[1] : undefined} aria-busy={state.status === "loading" || state.status === "ready" && state.refreshing}>
    <div className="me-heading"><div><a className="me-back" href="/">홈으로</a><RecapProfile sessionName={sessionName} /></div>
      {data && <button type="button" className="btn btn-outline recap-download" data-image-download-control disabled={downloadState === "pending" || state.status === "ready" && state.refreshing} aria-busy={downloadState === "pending"} onClick={() => { void download(); }}>{downloadState === "pending" ? "저장 중…" : downloadState === "failed" ? "다시 다운로드" : "다운로드"}</button>}
    </div>
    {downloadState === "failed" && <p className="recap-download-error" data-image-download-control role="alert">이미지를 저장하지 못했습니다. 다시 시도해 주세요.</p>}
    <section className="recap-period" aria-labelledby="period-heading">
      <div><h2 id="period-heading">조회 기간</h2>{periodControls}</div>
      <InsightAction insight={insight} />
    </section>
    {data && <PeriodLabel {...data.period} />}
    <div className="activity-refresh-status" role="status" aria-live="polite">
      {state.status === "ready" && (state.refreshing ? "선택 기간을 불러오는 중 · 아래는 이전 조회 결과입니다" : state.refreshFailed ? <><span>갱신 실패 · 아래는 이전 조회 결과입니다</span><button type="button" onClick={() => setAttempt(n => n + 1)}>다시 조회</button></> : null)}
    </div>
    {state.status !== "guest" && <section className="recap-personal-panel" aria-label="본진과 최근 활동">
      <div className="recap-home-area" aria-busy={state.status === "loading"}>
        {state.status === "loading" ? <div className="recap-home-loading" role="status"><span className="recap-visually-hidden">본진 불러오는 중</span><div className="recap-skeleton" aria-hidden="true" /></div>
          : channelResult?.status === "ready" ? <HomeChannelCard result={channelResult} />
          : <div className="activity-notice"><p role="status">본진 정보를 불러오지 못했습니다.</p><button className="btn btn-outline btn-sm" onClick={() => setAttempt(n => n + 1)}>다시 불러오기</button></div>}
      </div>
      <ActivityCalendar recap />
    </section>}
    {data && channelResult ? <>
      {/* 활동 요약(3)과 습관 카드(7)를 한 줄에 둔다. 좁은 화면에서는 위아래로 쌓인다. */}
      <div className="recap-overview">
        <section className="me-section recap-summary" aria-labelledby="summary-heading"><div className="me-section-heading"><h2 id="summary-heading">선택 기간 활동</h2></div><SummaryValues result={data.summary} /></section>
        <TraitsCard />
      </div>
      <InsightSummary insight={insight} />
      <InsightViewDialog insight={insight} />
      <ActivityChannels result={channelResult} />
      <section className="me-section" aria-labelledby="patterns-heading"><h2 id="patterns-heading">요일·시간대별 활동</h2>
        {data.patterns.status === "ready" ? <ActivityPatternChart data={data.patterns.data} weekday={weekday} onWeekdayChange={setWeekday} /> : <ResultNotice result={data.patterns} />}
      </section>
      <p className="activity-meta">활동 정보 확인 · {dateTime(data.fetchedAt)}</p>
    </> : <div className="me-section" role="status">{state.status === "loading" ? "불러오는 중" : state.status === "guest" ? <a className="btn btn-default" href="/auth/login">내 리캡 보기</a> : <><p>활동 정보 조회 실패</p><button className="btn btn-outline" onClick={() => setAttempt(n => n + 1)}>다시 조회</button></>}</div>}
    <div ref={spacer} aria-hidden="true" />
  </main>;
}
