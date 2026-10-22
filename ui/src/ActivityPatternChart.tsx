import { useEffect, useId, useRef, useState } from "react";
import type { ActivityPatterns } from "./activity.types";
import { number } from "./ActivityView";
import "./activityPatternChart.css";

const weekdays = ["전체", "월", "화", "수", "목", "금", "토", "일"];
const compact = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 });
export function ActivityPatternChart({ data, weekday, onWeekdayChange }: { data: ActivityPatterns; weekday: number; onWeekdayChange: (weekday: number) => void }) {
  const [width, setWidth] = useState(640);
  const container = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const measure = () => { if (container.current) setWidth(Math.max(200, container.current.getBoundingClientRect().width)); };
    measure();
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const counts = Array.from({ length: 24 }, (_, h) => data.patterns.reduce((sum, p) => sum + (p.hour === h && (weekday === 0 || p.weekday === weekday) ? p.chatCount : 0), 0));
  const total = counts.reduce((sum, count) => sum + count, 0);
  const highest = Math.max(1, ...counts);
  const magnitude = 10 ** Math.floor(Math.log10(highest / 4));
  const step = Math.max(1, Math.ceil(highest / 4 / magnitude) * magnitude);
  const ceiling = step * 4;
  const left = 48, right = width - 14, top = 16, bottom = 202;
  const x = (h: number) => left + h / 23 * (right - left);
  const y = (count: number) => bottom - count / ceiling * (bottom - top);
  const line = counts.map((count, h) => `${h ? "L" : "M"}${x(h)},${y(count)}`).join(" ");
  const hourStep = width >= 720 ? 1 : width >= 420 ? 2 : 3;
  const hours = Array.from({ length: 24 }, (_, hour) => hour).filter(hour => hour === 23 || hour % hourStep === 0 && hour <= 23 - hourStep);
  return <div className="activity-pattern-chart" ref={container}>
    <div className="activity-weekday-tabs" role="group" aria-label="활동 요일">{weekdays.map((day, index) => <button key={day} type="button" className={`btn ${weekday === index ? "btn-default" : "btn-outline"}`} aria-pressed={weekday === index} onClick={() => onWeekdayChange(index)}>{day}</button>)}</div>
    {data.patterns.length === 0 ? <p className="activity-notice">활동 기록 없음</p> : <>
      <div className="activity-chart-summary"><span>{weekday === 0 ? "전체 요일" : `${weekdays[weekday]}요일`} · 한국 시간</span><span>채팅 {number(total)}개</span></div>
      <svg className="activity-hour-chart" viewBox={`0 0 ${width} 232`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{weekday === 0 ? "전체 요일" : `${weekdays[weekday]}요일`} 시간대별 채팅 수</title>
        {[0, 1, 2, 3, 4].map(tick => {
          const value = ceiling * tick / 4;
          return <g key={tick}><line className="activity-chart-grid" x1={left} x2={right} y1={y(value)} y2={y(value)} /><text className="activity-chart-axis" x={left - 8} y={y(value) + 4} textAnchor="end">{compact.format(value)}</text></g>;
        })}
        <path className="activity-chart-area" d={`${line} L${right},${bottom} L${left},${bottom} Z`} />
        <path className="activity-chart-line" d={line} />
        {hours.map(h => <text key={h} className="activity-chart-axis activity-chart-hour" x={x(h)} y={224} textAnchor="middle">{h}시</text>)}
      </svg>
    </>}
  </div>;
}
