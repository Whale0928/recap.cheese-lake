import { useCallback, useEffect, useRef, useState } from "react";
import type { InsightResponse, InsightStatus } from "./insight.types";

// AI 분석은 랩의 대기열이 만든다. 리캡 BFF 가 티켓을 보고 넣어 주며, 여기서는 상태를 묻고 · 동의하고 넣고 · 대기 중이면 몇 초마다 다시 묻는다.
// 활동 정보와 따로 불러와 나머지 화면을 붙잡지 않는다.
export type InsightPhase =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "error" }
  | { kind: "unavailable"; reason: "not_configured" | "rate_limited" | "upstream"; retryAfterSeconds?: number; tickets: number }
  | { kind: "ready"; status: InsightStatus | null; tickets: number; fetchedAt: string };

/** 요청이 거절된 까닭. 버튼 자리에서 짧게 보여 준다 */
export type InsightDenial = "no_ticket" | "rate_limited" | "unavailable" | "error";
export type InsightOpen = "" | "consent" | "queue" | "view";

/** 방금 끝난 일. 대기 · 진행 중이던 요청이 끝나는 순간 한 번만 알린다 */
export type InsightNotice = "done" | "failed";

export interface InsightHandle {
  phase: InsightPhase;
  notice: InsightNotice | null;
  clearNotice: () => void;
  busy: boolean;
  /** 대기 · 진행 중 */
  pending: boolean;
  /** 끝난 결과가 있다 */
  done: boolean;
  tickets: number;
  denial: InsightDenial | null;
  open: InsightOpen;
  setOpen: (o: InsightOpen) => void;
  request: (refresh: boolean) => void;
  reload: () => void;
  clearDenial: () => void;
}

const MAX_RETRY = 3;
/** 대기 중 상태를 다시 묻는 간격. 예상 초의 절반이되 3~15초 사이로 둔다 */
const pollDelay = (st: InsightStatus) => Math.min(15, Math.max(3, Math.round((st.queueEtaSec ?? 10) / 2)));

export function useInsight(): InsightHandle {
  const [phase, setPhase] = useState<InsightPhase>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [denial, setDenial] = useState<InsightDenial | null>(null);
  const [open, setOpen] = useState<InsightOpen>("");
  const [notice, setNotice] = useState<InsightNotice | null>(null);
  const lastState = useRef<InsightStatus["state"] | null>(null);
  const retries = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const applyBody = useCallback((body: InsightResponse) => {
    if (body.insight.status === "ready") {
      retries.current = 0;
      // 기다리던 요청이 끝났으면 알린다. 처음 열었을 때 이미 끝나 있던 것은 알리지 않는다.
      const next = body.insight.data?.state ?? null;
      const was = lastState.current;
      if ((was === "waiting" || was === "running") && (next === "done" || next === "failed")) setNotice(next);
      lastState.current = next;
      setPhase({ kind: "ready", status: body.insight.data, tickets: body.tickets, fetchedAt: body.fetchedAt });
    } else setPhase({ kind: "unavailable", ...body.insight, tickets: body.tickets });
  }, []);

  const reload = useCallback(() => {
    fetch("/api/me/insight", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(async response => {
        if (!alive.current) return;
        if (response.status === 401) { setPhase({ kind: "guest" }); return; }
        if (!response.ok) throw new Error("Insight request failed");
        applyBody(await response.json() as InsightResponse);
      })
      .catch(() => { if (alive.current) setPhase({ kind: "error" }); });
  }, [applyBody]);

  // 동의 뒤 넣는다. 403 no_ticket 과 잠시 거절은 버튼 자리의 반려 표시로, 성공은 새 상태로 이어진다.
  const request = useCallback((refresh: boolean) => {
    setBusy(true); setDenial(null);
    fetch("/api/me/insight", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ consent: true, refresh }) })
      .then(async response => {
        if (!alive.current) return;
        if (response.status === 401) { setPhase({ kind: "guest" }); return; }
        if (response.status === 403) { setDenial("no_ticket"); reload(); return; }
        if (!response.ok) throw new Error("Insight request failed");
        const body = await response.json() as InsightResponse;
        if (body.insight.status === "unavailable") setDenial(body.insight.reason === "rate_limited" ? "rate_limited" : "unavailable");
        applyBody(body);
      })
      .catch(() => { if (alive.current) setDenial("error"); })
      .finally(() => { if (alive.current) setBusy(false); });
  }, [applyBody, reload]);

  useEffect(() => { reload(); }, [reload]);
  // 대기 · 진행 중이면 다시 묻고, 잠시 거절당했으면 Retry-After 만큼 기다려 세 번까지 다시 부른다.
  useEffect(() => {
    let delay = 0;
    if (phase.kind === "ready" && phase.status && (phase.status.state === "waiting" || phase.status.state === "running")) delay = pollDelay(phase.status);
    else if (phase.kind === "unavailable" && phase.reason === "rate_limited" && retries.current < MAX_RETRY) { retries.current += 1; delay = phase.retryAfterSeconds ?? 1; }
    if (!delay) return;
    const timer = window.setTimeout(reload, delay * 1000);
    return () => window.clearTimeout(timer);
  }, [phase, reload]);

  const st = phase.kind === "ready" ? phase.status : null;
  const tickets = phase.kind === "ready" || phase.kind === "unavailable" ? phase.tickets : 0;
  return {
    phase, busy, tickets, denial, open, setOpen, request, reload, notice,
    clearNotice: () => setNotice(null),
    pending: st?.state === "waiting" || st?.state === "running",
    done: st?.state === "done" && !!st.result,
    clearDenial: () => setDenial(null),
  };
}
