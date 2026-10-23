import { useState } from "react";
import { ChannelAvatar } from "./ChannelLink";
import { CalendarGrid } from "./ActivityCalendar";
import { dateInput, dateTime, number, ResultNotice, useActivity } from "./ActivityView";
import type { RelationshipResponse } from "./relationship.data";
import type { ActivityResult, ActivityTrend, ProfileRefresh } from "./activity.types";
import { useChannelProfiles } from "./useChannelProfiles";
import "./relationship.css";

interface ChannelRecordResponse { fetchedAt: string; calendarPeriod: { from: string; to: string }; record: ActivityResult<RelationshipResponse>; daily: ActivityResult<ActivityTrend>; monthly: ActivityResult<ActivityTrend>; profileRefresh?: ProfileRefresh }

const dateLabel = (date: string | null) => date ? date.replaceAll("-", ".") : "기록 없음";

function MonthlyRecord({ trend }: { trend: ActivityTrend }) {
  const months = trend.points;
  const [selected, setSelected] = useState(Math.max(0, months.length - 1));
  if (!months.length) return <p className="activity-notice">기록 없음</p>;
  const index = Math.min(selected, months.length - 1);
  const maximum = Math.max(1, ...months.map(month => month.chatCount));
  const month = months[index];
  return <div className="relationship-monthly">
    <div className="relationship-month-value" aria-live="polite"><span>{dateLabel(dateInput(month.from).slice(0, 7))}</span><strong>{number(month.chatCount)}<small>개</small></strong></div>
    <div className="relationship-month-scroll" tabIndex={0} aria-label="월별 채팅 기록"><div className="relationship-month-bars" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(1.5rem, 1fr))` }}>{months.map((point, itemIndex) =>
      <button key={point.from} type="button" aria-label={`${dateLabel(dateInput(point.from).slice(0, 7))} 채팅 ${number(point.chatCount)}개`} aria-pressed={index === itemIndex} onClick={() => setSelected(itemIndex)}>
        <span style={{ height: `${point.chatCount / maximum * 100}%` }} /><small>{Number(dateInput(point.from).slice(5, 7))}월</small>
      </button>
    )}</div></div>
  </div>;
}

function RelationshipDetails({ response }: { response: ChannelRecordResponse & { record: { status: "ready"; data: RelationshipResponse } } }) {
  const { channel: originalChannel, relationship: r } = response.record.data;
  const [channel = originalChannel] = useChannelProfiles([originalChannel], response.profileRefresh, `/api/me/channels/${originalChannel.channelId}/profile`);
  const today = dateInput(response.fetchedAt);
  const period = response.calendarPeriod;
  const [tab, setTab] = useState<"moments" | "monthly">("moments");
  const [selectedDate, setSelectedDate] = useState(period.to);
  const share = (r.share * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  const elapsed = r.firstActiveDate ? Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${r.firstActiveDate}T00:00:00Z`)) / 86_400_000)) : null;
  return <>
    <div className="relationship-layout">
      <section className="relationship-card" aria-label="나의 채널 기록">
        <div className="relationship-card-heading"><span>나의 채널 기록</span><span>{today.slice(0, 4)}</span></div>
        <div className="relationship-identity">
          <a className="relationship-channel" href={channel.channelUrl} target="_blank" rel="noopener noreferrer" aria-label={`${channel.channelName || "선택한 채널"} 치지직 채널 방문`}>
            <ChannelAvatar channel={channel} /><h2>{channel.channelName || "선택한 채널"}</h2>
          </a>
          {r.share >= .5 && <span className="relationship-home-badge">나의 본진</span>}
        </div>
        <div className="relationship-elapsed"><span>첫 채팅 이후</span><strong>{elapsed === null ? "기록 없음" : number(elapsed)}{elapsed !== null && <small>일</small>}</strong><span>{dateLabel(r.firstActiveDate)} ~ {dateLabel(today)}</span></div>
        <div className="relationship-card-footer"><span>recap</span><span>전체 채팅 중 <strong>{share}%</strong></span></div>
        <div className="relationship-share-action"><button type="button" className="btn btn-default" aria-disabled="true">이 스트리머에게 기록 공유하기</button></div>
      </section>
      <section className="relationship-details" aria-label="채널과의 활동 기록">
        <h2 className="relationship-title">자주 만난 만큼,<br />쌓인 기록들.</h2>
        <dl className="relationship-stats">
          <div><dt>나눈 채팅</dt><dd>{number(r.chatCount)}<small>개</small></dd></div>
          <div><dt>채팅한 날</dt><dd>{number(r.activeDays)}<small>일</small></dd></div>
          <div><dt>최장 연속 활동</dt><dd>{number(r.longestConsecutiveActiveDays)}<small>일</small></dd></div>
        </dl>
        <div className="relationship-tabs" role="group" aria-label="채널 기록 보기">
          <button type="button" aria-pressed={tab === "moments"} aria-controls="relationship-record" onClick={() => setTab("moments")}>기억할 순간</button>
          <button type="button" aria-pressed={tab === "monthly"} aria-controls="relationship-record" onClick={() => setTab("monthly")}>월별 기록</button>
        </div>
        <div id="relationship-record" className="relationship-record">
          {tab === "monthly" ? response.monthly.status === "ready" ? <MonthlyRecord trend={response.monthly.data} /> : <ResultNotice result={response.monthly} /> : <dl className="relationship-moments">
            <div><dt>가장 활발했던 날</dt><dd><strong>{r.mostActiveDay ? dateLabel(r.mostActiveDay.date.slice(5)) : "기록 없음"}</strong>{r.mostActiveDay && <span>{r.mostActiveDay.date.slice(0, 4)}년 · 채팅 {number(r.mostActiveDay.chatCount)}개</span>}</dd></div>
            <div><dt>가장 활발했던 달</dt><dd><strong>{r.mostActiveMonth ? `${Number(r.mostActiveMonth.month.slice(5))}월` : "기록 없음"}</strong>{r.mostActiveMonth && <span>{r.mostActiveMonth.month.slice(0, 4)}년 · 채팅 {number(r.mostActiveMonth.chatCount)}개</span>}</dd></div>
          </dl>}
        </div>
        <div className="relationship-streak"><span>최장 연속 활동</span><strong>{number(r.longestConsecutiveActiveDays)}일</strong><div aria-hidden="true">{Array.from({ length: Math.min(60, r.longestConsecutiveActiveDays) }, (_, i) => <i key={i} />)}</div></div>
        <dl className="relationship-footnotes"><div><dt>최근 채팅</dt><dd>{dateLabel(r.lastActiveDate)}</dd></div><div><dt>전체 채팅</dt><dd>{number(r.totalUserChatCount)}개</dd></div></dl>
      </section>
    </div>
    <section className="relationship-calendar" aria-label="이 채널에서 남긴 채팅"><h2>이 채널에서 남긴 흔적</h2>{response.daily.status === "ready" ? <CalendarGrid trend={response.daily.data} period={period} selected={selectedDate} onSelect={setSelectedDate} /> : <ResultNotice result={response.daily} />}</section>
    <p className="activity-meta">활동 정보 확인 · {dateTime(response.fetchedAt)}</p>
  </>;
}

function ChannelRecord({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  const state = useActivity<ChannelRecordResponse>(`/api/me/channels/${encodeURIComponent(id)}/record`, attempt);
  if (state.status === "loading") return <p className="activity-notice" role="status">불러오는 중</p>;
  if (state.status === "guest") return <a className="btn btn-default" href="/auth/login">내 리캡 보기</a>;
  if (state.status !== "ready") return <div role="status"><p>활동 정보 조회 실패</p><button type="button" className="btn btn-outline" onClick={() => setAttempt(n => n + 1)}>다시 조회</button></div>;
  if (state.data.record.status !== "ready") return <ResultNotice result={state.data.record} />;
  return <RelationshipDetails response={{ ...state.data, record: state.data.record }} />;
}

export function RelationshipPage({ authenticated, pending }: { authenticated: boolean; pending: boolean }) {
  const id = new URLSearchParams(window.location.search).get("channel") ?? "";
  const valid = /^[0-9a-f]{32}$/.test(id);
  return <main id="main" className="me-main relationship-main">
    <div className="me-heading"><div><a className="me-back" href="/recap/">내 리캡으로</a><h1>이 채널에서의 내 기록</h1></div></div>
    {pending ? <p className="activity-notice" role="status">불러오는 중</p> : !authenticated ? <section className="me-section"><a className="btn btn-default" href="/auth/login">내 리캡 보기</a></section> : !valid ? <section className="me-section" role="status">선택한 채널 없음</section> : <ChannelRecord key={id} id={id} />}
  </main>;
}
