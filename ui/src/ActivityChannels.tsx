import { useId, useMemo, useState } from "react";
import type { ActivityChannels as ChannelData, ActivityResult } from "./activity.types";
import { number, ResultNotice } from "./ActivityView";
import { ChannelLink } from "./ChannelLink";
import { ChannelDistribution } from "./ChannelDistribution";
import "./activityChannels.css";

type Channel = ChannelData["channels"][number];
type View = "cards" | "list" | "donut" | "treemap";
const viewNames: Record<View, string> = { cards: "카드", list: "목록", donut: "도넛", treemap: "트리맵" };
const defaultChannelCount = 15;
const share = (value: number) => `${(value * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;

function ChannelCollection({ channels, view }: { channels: Channel[]; view: "cards" | "list" }) {
  if (view === "list") return <div className="activity-table-wrap" tabIndex={0} role="region" aria-label="방송별 활동 표"><table>
    <thead><tr><th>방송 채널</th><th>채팅</th><th>활동일</th><th>비율</th></tr></thead>
    <tbody>{channels.map(channel => <tr key={channel.channelId}><td><ChannelLink channel={channel} /></td><td>{number(channel.chatCount)}</td><td>{number(channel.activeDays)}</td><td>{share(channel.share)}</td></tr>)}</tbody>
  </table></div>;
  return <ul className="channel-cards">{channels.map(channel => <li className="channel-card" key={channel.channelId}>
    <ChannelLink channel={channel} />
    <dl className="channel-card-stats">
      <div className="channel-card-chat"><dt>채팅</dt><dd>{number(channel.chatCount)}</dd></div>
      <div><dt>활동일</dt><dd>{number(channel.activeDays)}<span>일</span></dd></div>
      <div><dt>비율</dt><dd>{share(channel.share)}</dd></div>
    </dl>
    <div className="channel-card-share" aria-hidden="true"><span style={{ width: `${channel.share * 100}%` }} /></div>
  </li>)}</ul>;
}

function ViewIcon({ view }: { view: View }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
    {view === "cards" ? <><rect x="2" y="2" width="4" height="4" rx=".7" /><rect x="10" y="2" width="4" height="4" rx=".7" /><rect x="2" y="10" width="4" height="4" rx=".7" /><rect x="10" y="10" width="4" height="4" rx=".7" /></> : view === "list" ? <><path d="M5 3h9M5 8h9M5 13h9" /><path strokeWidth="2" d="M1.5 3h1M1.5 8h1M1.5 13h1" /></> : view === "donut" ? <><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.5" /><path d="M8 2v3.5M10.5 8H14" /></> : <><rect x="2" y="2" width="12" height="12" rx=".7" /><path d="M9 2v12M9 7h5" /></>}
  </svg>;
}

export function ActivityChannels({ result }: { result: ActivityResult<ChannelData> }) {
  const [view, setView] = useState<View>("donut");
  const [expanded, setExpanded] = useState(false);
  const foldedId = useId();
  const data = result.status === "ready" ? result.data : null;
  const channels = useMemo(() => [...(data?.channels ?? [])].sort((a, b) => b.chatCount - a.chatCount), [data?.channels]);
  const visible = channels.slice(0, defaultChannelCount);
  const folded = channels.slice(defaultChannelCount);
  return <section className="me-section channel-activity" aria-labelledby="channels-heading">
    <div className="channel-activity-heading">
      <h2 id="channels-heading">방송별 활동</h2>
      <div className="channel-view-switch" role="group" aria-label="방송별 활동 보기 방식">
        {(["cards", "list", "donut", "treemap"] as const).map(option => <button type="button" key={option} aria-pressed={view === option} onClick={() => setView(option)}><ViewIcon view={option} />{viewNames[option]}</button>)}
      </div>
    </div>
    {data ? <>
      <p className="activity-meta">총 채팅 {number(data.totalChatCount)}개 · {number(data.channels.length)}개 방송</p>
      {view === "donut" || view === "treemap" ? <ChannelDistribution channels={channels} view={view} limit={defaultChannelCount} /> : <>
      {visible.length > 0 && <ChannelCollection channels={visible} view={view} />}
      {folded.length > 0 && <>
        <button type="button" className="channel-fold-toggle" aria-expanded={expanded} aria-controls={foldedId} onClick={() => setExpanded(value => !value)}>
          <span>그 외 방송 <span className="channel-fold-count">{number(folded.length)}개</span></span>
          <span>{expanded ? "접기" : "펼치기"}<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={expanded ? "m4 10 4-4 4 4" : "m4 6 4 4 4-4"} /></svg></span>
        </button>
        <div id={foldedId} hidden={!expanded}>{expanded && <ChannelCollection channels={folded} view={view} />}</div>
      </>}
      </>}
      {!data.channels.length && (view === "cards" || view === "list") && <p className="activity-notice">활동 기록 없음</p>}
    </> : <ResultNotice result={result} />}
  </section>;
}
