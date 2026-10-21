import { useEffect, useState } from "react";
import type { ActivityResult, ActivitySummary, SummaryResponse } from "./activity.types";
import "./activity.css";
export type ActivityState<T> = { status: "loading" | "guest" | "error" } | { status: "ready"; data: T; source: string; refreshing: boolean; refreshFailed: boolean };
export function useActivity<T>(url: string, attempt: number): ActivityState<T> {
  const [state, setState] = useState<ActivityState<T>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => previous.status === "ready" ? { ...previous, refreshing: true, refreshFailed: false } : { status: "loading" });
    fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async response => {
        if (controller.signal.aborted) return;
        if (response.status === 401) { setState({ status: "guest" }); return; }
        if (!response.ok) throw new Error("Activity request failed");
        const data = await response.json() as T;
        if (!controller.signal.aborted) setState({ status: "ready", data, source: url, refreshing: false, refreshFailed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState(previous => previous.status === "ready" ? { ...previous, refreshing: false, refreshFailed: true } : { status: "error" });
      });
    return () => controller.abort();
  }, [url, attempt]);
  return state;
}
export const number = (v: number) => v.toLocaleString("ko-KR");
export const dateTime = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export const dateInput = (s: string) => new Date(Date.parse(s) + 9 * 3_600_000).toISOString().slice(0, 10);
export function PeriodLabel({ from, to }: { from: string; to: string }) {
  if (from === "1970-01-01T00:00:00.000Z") return <p className="activity-meta">전체 · 한국 시간 · 확인된 채팅 기준</p>;
  return <p className="activity-meta">{dateInput(from)} ~ {dateInput(new Date(Date.parse(to) - 1).toISOString())} · 한국 시간 · 확인된 채팅 기준</p>;
}
export function ResultNotice({ result }: { result: ActivityResult<unknown> }) {
  if (result.status === "ready") return null;
  return <p className="activity-notice" role="status">{result.reason === "not_configured" ? "활동 정보 준비 중" : result.reason === "rate_limited" ? `요청 한도 초과 · ${result.retryAfterSeconds ?? 1}초 후 재시도` : "활동 정보 조회 실패"}</p>;
}
export function SummaryValues({ result }: { result: ActivityResult<ActivitySummary> }) {
  if (result.status !== "ready") return <ResultNotice result={result} />;
  const d = result.data;
  return <dl className="activity-summary"><div><dt>채팅</dt><dd>{number(d.chatCount)}<span>개</span></dd></div><div><dt>활동일</dt><dd>{number(d.activeDays)}<span>일</span></dd></div><div><dt>활동한 방송</dt><dd>{number(d.channelCount)}<span>개</span></dd></div></dl>;
}
export function MeActivity({ attempt }: { attempt: number }) {
  const state = useActivity<SummaryResponse>("/api/me/activity/summary?period=all", attempt);
  return <>
    {state.status === "ready" ? <><PeriodLabel {...state.data.period} /><SummaryValues result={state.data.summary} />{state.data.summary.status === "ready" && <p className="me-updated">활동 정보 확인 · {dateTime(state.data.fetchedAt)}</p>}</>
      : <p className="activity-notice" role="status">{state.status === "loading" ? "불러오는 중" : state.status === "guest" ? "로그인 필요" : "활동 정보 조회 실패"}</p>}
  </>;
}
