import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import type { RecapResponse } from "./activity.types";
import { dateTime, number, PeriodLabel, ResultNotice, SummaryValues, useActivity } from "./ActivityView";
import { ActivityPatternChart } from "./ActivityPatternChart";
import { ActivityChannels } from "./ActivityChannels";
import { HomeChannelCard } from "./HomeChannelCard";
export function RecapPage() {
  const currentMonth = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 7);
  const [mode, setMode] = useState<"all" | "month">("all");
  const [weekday, setWeekday] = useState(0);
  const [month, setMonth] = useState(currentMonth);
  const [attempt, setAttempt] = useState(0);
  const search = mode === "all" ? "period=all" : new URLSearchParams({ month }).toString();
  const url = `/api/recap?${search}`;
  const state = useActivity<RecapResponse>(url, attempt);
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
  const data = state.status === "ready" ? state.data : null;
  const periodControls = <div className="activity-filters">
      <div className="activity-period-tabs" role="group" aria-label="조회 기간">
        <button type="button" className={`btn ${mode === "all" ? "btn-default" : "btn-outline"}`} aria-pressed={mode === "all"} onClick={event => { preservePosition(event); setMode("all"); }}>전체</button>
        <button type="button" className={`btn ${mode === "month" ? "btn-default" : "btn-outline"}`} aria-pressed={mode === "month"} onClick={event => { preservePosition(event); setMode("month"); }}>월별</button>
      </div>
      {mode === "month" && <label>조회 월<input type="month" required value={month} min="1970-02" max={currentMonth} onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) && e.target.value >= "1970-02" && e.target.value <= currentMonth) { preservePosition(e); setMonth(e.target.value); } }} /></label>}
    </div>;
  return <main id="main" className="me-main recap-data" aria-busy={state.status === "loading" || state.status === "ready" && state.refreshing}>
    <div className="me-heading"><div><a className="me-back" href="/">홈으로</a><h1>내 리캡</h1></div></div>
    <section className="recap-period" aria-labelledby="period-heading"><h2 id="period-heading">조회 기간</h2>{periodControls}</section>
    <div className="activity-refresh-status" role="status" aria-live="polite">
      {state.status === "ready" && (state.refreshing ? "갱신 중" : state.refreshFailed ? <><span>갱신 실패</span><button type="button" onClick={() => setAttempt(n => n + 1)}>다시 조회</button></> : null)}
    </div>
    {data ? <>
      {data.period.from === "1970-01-01T00:00:00.000Z" ? <p className="activity-meta">전체 · 한국 시간 · 확인된 채팅 기준</p> : <PeriodLabel {...data.period} />}
      <HomeChannelCard result={data.channels} />
      <section className="me-section" aria-labelledby="summary-heading"><div className="me-section-heading"><h2 id="summary-heading">활동 요약</h2></div><SummaryValues result={data.summary} /></section>
      <ActivityChannels result={data.channels} />
      <section className="me-section" aria-labelledby="patterns-heading"><h2 id="patterns-heading">요일·시간대별 활동</h2>
        {data.patterns.status === "ready" ? <ActivityPatternChart data={data.patterns.data} weekday={weekday} onWeekdayChange={setWeekday} /> : <ResultNotice result={data.patterns} />}
      </section>
      <p className="activity-meta">활동 정보 확인 · {dateTime(data.fetchedAt)}</p>
    </> : <div className="me-section" role="status">{state.status === "loading" ? "불러오는 중" : state.status === "guest" ? <a className="btn btn-default" href="/auth/login">내 리캡 보기</a> : <><p>활동 정보 조회 실패</p><button className="btn btn-outline" onClick={() => setAttempt(n => n + 1)}>다시 조회</button></>}</div>}
    <div ref={spacer} aria-hidden="true" />
  </main>;
}
