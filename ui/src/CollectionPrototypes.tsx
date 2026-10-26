import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import sample from "../prototypes/collection/sample.json";
import "../styles/tokens.css";
import "../styles/components.css";
import "./collectionPrototypes.css";

const count = (value: number) => value.toLocaleString("ko-KR");
type Channel = typeof sample.leader;

function Avatar({ channel }: { channel: Pick<Channel, "channelImageUrl" | "channelName"> }) {
  const [failed, setFailed] = useState(false);
  return <span className="cp-avatar" aria-hidden="true">{!failed && channel.channelImageUrl
    ? <img src={channel.channelImageUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : channel.channelName.slice(0, 1)}</span>;
}

function ChannelStat({ peak = false, compact = false }: { peak?: boolean; compact?: boolean }) {
  const channel = peak ? sample.peak.channel : sample.leader;
  const total = peak ? sample.peak.chatCount : sample.leader.chatCount;
  return <a className={`cp-channel${compact ? " cp-channel-compact" : ""}`} href={channel.channelUrl} target="_blank" rel="noreferrer" title={peak ? "22:32~22:33 · 한국 시간" : undefined}>
    <span className="cp-channel-label">{peak ? "순간 최대" : "어제 채팅 최다"}</span>
    <span className="cp-channel-body"><Avatar channel={channel} /><span className="cp-channel-copy"><strong>{channel.channelName}</strong><span>{peak && "1분간 "}{count(total)}건</span></span><span className="cp-out" aria-hidden="true">↗</span></span>
    <span className="cp-sr-only">새 탭에서 열림</span>
  </a>;
}

function CountStat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return <div className="cp-stat"><span>{label}</span><strong>{count(value)}<small>{unit}</small></strong></div>;
}

function Total({ small = false }: { small?: boolean }) {
  return <div className={`cp-total${small ? " cp-total-small" : ""}`}><span>관측된 채팅</span><strong aria-label={`${count(sample.summary.chatCount)}건`}>836.8<small>만 건</small></strong></div>;
}

function Ticker() {
  return <section className="cp-ticker" aria-label="A 관측 통계">
    <Total small />
    <CountStat label="채팅 참여자" value={sample.summary.participantCount} unit="명" />
    <CountStat label="관측된 채널" value={sample.summary.channelCount} unit="개" />
    <ChannelStat compact /><ChannelStat compact peak />
    <div className="cp-stat cp-hour"><span>채팅 최다 시간대</span><strong>21:00<small>~</small>22:00</strong></div>
  </section>;
}

function Scoreboard() {
  return <section className="cp-scoreboard" aria-label="B 관측 통계">
    <div className="cp-score-totals"><Total /><div className="cp-score-counts"><CountStat label="채팅 참여자" value={sample.summary.participantCount} unit="명" /><CountStat label="관측된 채널" value={sample.summary.channelCount} unit="개" /></div></div>
    <div className="cp-score-channel"><ChannelStat /></div>
    <div className="cp-score-channel cp-score-peak"><ChannelStat peak /><p><span>채팅 최다 시간대</span><strong>21:00 ~ 22:00</strong></p></div>
  </section>;
}

function Spotlight() {
  return <section className="cp-spotlight" aria-label="C 관측 통계">
    <div className="cp-spot-total"><Total /><div className="cp-spot-scope">관측된 채널의 채팅 기준</div></div>
    <div className="cp-spot-right">
      <div className="cp-spot-channels"><ChannelStat /><ChannelStat peak /></div>
      <div className="cp-spot-footer"><CountStat label="채팅 참여자" value={sample.summary.participantCount} unit="명" /><CountStat label="관측된 채널" value={sample.summary.channelCount} unit="개" /><div className="cp-stat cp-hour"><span>채팅 최다 시간대</span><strong>21:00<small>~</small>22:00</strong></div></div>
    </div>
  </section>;
}

function Example({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setHeight(Math.round(node.getBoundingClientRect().height)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <article className="cp-example" id={`variant-${id}`}>
    <header className="cp-example-header"><div><span className="cp-letter">{id}</span><h2>{title}</h2><span className="cp-height">{height}px</span></div><p>{description}</p></header>
    <div className="cp-measure" ref={ref}>{children}</div>
  </article>;
}

function App() {
  const [width, setWidth] = useState("full");
  const [dark, setDark] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); document.documentElement.classList.toggle("light", !dark); }, [dark]);
  return <div className="cp-page">
    <header className="cp-top"><a href="/" className="cp-brand"><img src="/icon.svg" alt="" width="24" height="24" />recap <span>/ 통계 카드 시안</span></a><button type="button" className="cp-control" onClick={() => setDark(!dark)}>{dark ? "라이트 테마" : "다크 테마"}</button></header>
    <main className="cp-main">
      <div className="cp-intro"><div><p>같은 데이터, 다른 구성</p><h1>어느 정도의 존재감이 좋을까요.</h1><span>2026.10.25 관측 데이터 · 현재 홈 카드는 82.5px</span></div><div className="cp-width-controls" role="group" aria-label="미리보기 너비">{[["full", "전체 너비"], ["820", "태블릿"], ["390", "모바일"]].map(([value, label]) => <button className="cp-control" key={value} type="button" aria-pressed={width === value} onClick={() => setWidth(value)}>{label}</button>)}</div></div>
      <div className="cp-stage" style={{ width: width === "full" ? "100%" : `${width}px` }}>
        <Example id="A" title="정보 띠" description="낮고 조용하게. 숫자와 채널을 같은 비중으로 나란히 보여줍니다."><Ticker /></Example>
        <Example id="B" title="숫자 중심" description="관측 규모를 먼저 읽고, 두 채널의 기록을 이어서 봅니다."><Scoreboard /></Example>
        <Example id="C" title="채널 중심" description="두 채널을 크게 보여주고 참여자와 시간대는 아래에 묶습니다."><Spotlight /></Example>
      </div>
      <p className="cp-footnote">세 시안 모두 어제 채팅 최다와 순간 최대를 함께 표시합니다. 높이는 현재 미리보기 너비에서 측정한 값입니다.</p>
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
