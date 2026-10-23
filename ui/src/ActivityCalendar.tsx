import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { dateInput, number, ResultNotice, useActivity } from "./ActivityView";
import type { ActivityPeriod, ActivityResult, ActivityTrend } from "./activity.types";
import "./activityCalendar.css";

const DAY = 86_400_000;
const activityLevels = [
  { emoji: "💤", label: "활동 없음" },
  { emoji: "🌱", label: "활동 적음" },
  { emoji: "🌿", label: "활동 보통" },
  { emoji: "🍀", label: "활동 많음" },
  { emoji: "🌳", label: "활동 아주 많음" },
];
interface TrendResponse { period: ActivityPeriod; fetchedAt: string; trend: ActivityResult<ActivityTrend> }
function calendarPeriod() {
  const to = dateInput(new Date().toISOString());
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 364 * DAY).toISOString().slice(0, 10);
  return { from, to };
}
export function ActivityCalendar() {
  const [period] = useState(calendarPeriod);
  const state = useActivity<TrendResponse>(`/api/me/activity/trend?${new URLSearchParams(period)}`, 0);
  const [selected, setSelected] = useState(period.to);
  if (state.status !== "ready") return <p className="activity-notice" role="status">{state.status === "loading" ? "활동 달력 불러오는 중" : state.status === "guest" ? "로그인 필요" : "활동 달력 조회 실패"}</p>;
  if (state.data.trend.status !== "ready") return <ResultNotice result={state.data.trend} />;
  return <CalendarGrid trend={state.data.trend.data} period={period} selected={selected} onSelect={setSelected} />;
}
export function CalendarGrid({ trend, period, selected, onSelect }: { trend: Pick<ActivityTrend, "points">; period: { from: string; to: string }; selected: string; onSelect: (date: string) => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const alignRecent = () => { element.scrollLeft = element.scrollWidth; };
    alignRecent();
    const observer = new ResizeObserver(alignRecent);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const counts = new Map(trend.points.map(p => [dateInput(p.from), p.chatCount]));
  const max = Math.max(1, ...counts.values());
  const levelFor = (count: number) => count === 0 ? 0 : Math.min(4, Math.ceil(count / max * 4));
  const selectedActivity = activityLevels[levelFor(counts.get(selected) ?? 0)];
  const first = Date.parse(`${period.from}T00:00:00Z`);
  const offset = new Date(first).getUTCDay();
  const weeks = Math.ceil((365 + offset) / 7);
  const total = trend.points.reduce((sum, p) => sum + p.chatCount, 0);
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7, Home: -index, End: 364 - index }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(364, index + delta));
    onSelect(new Date(first + next * DAY).toISOString().slice(0, 10));
    event.currentTarget.closest(".activity-calendar-grid")?.querySelector<HTMLButtonElement>(`[data-day-index="${next}"]`)?.focus();
  };
  return <div className="activity-calendar">
    <div className="activity-calendar-heading"><h3>최근 1년</h3><span>채팅 {number(total)}개</span></div>
    <div ref={scroll} className="activity-calendar-scroll" role="region" aria-label="최근 1년 날짜별 채팅 수" tabIndex={0}>
      <div className="activity-calendar-layout" style={{ "--calendar-weeks": weeks } as CSSProperties}>
        <div className="activity-calendar-months" aria-hidden="true">{Array.from({ length: weeks }, (_, week) => {
          const date = new Date(first + (week * 7 - offset) * DAY);
          return <span key={week}>{week === 0 || date.getUTCDate() <= 7 ? `${date.getUTCMonth() + 1}월` : ""}</span>;
        })}</div>
        <div className="activity-calendar-weekdays" aria-hidden="true">{["", "월", "", "수", "", "금", ""].map((day, i) => <span key={i}>{day}</span>)}</div>
        <div className="activity-calendar-grid">{Array.from({ length: weeks * 7 }, (_, cell) => {
          const index = cell - offset;
          if (index < 0 || index >= 365) return <span key={cell} />;
          const date = new Date(first + index * DAY).toISOString().slice(0, 10);
          const count = counts.get(date) ?? 0;
          const level = levelFor(count);
          const label = `${date} · 채팅 ${number(count)}개`;
          return <button key={cell} type="button" className={`activity-calendar-cell heat-${level}`} data-day-index={index} aria-label={label} aria-pressed={selected === date} title={label} tabIndex={selected === date ? 0 : -1} onFocus={() => onSelect(date)} onClick={() => onSelect(date)} onKeyDown={e => move(e, index)} />;
        })}</div>
      </div>
    </div>
    <div className="activity-calendar-footer"><p aria-live="polite"><span className="activity-calendar-mood" role="img" aria-label={`${selected} · ${selectedActivity.label}`}>{selectedActivity.emoji}</span></p><div className="activity-calendar-legend" aria-label="채팅 수가 많을수록 진한 색"><span aria-hidden="true">{activityLevels[0].emoji}</span>{[0, 1, 2, 3, 4].map(level => <span key={level} className={`activity-calendar-swatch heat-${level}`} aria-hidden="true" />)}<span aria-hidden="true">{activityLevels[4].emoji}</span></div></div>
  </div>;
}
