import { useState } from "react";
import { createRoot } from "react-dom/client";
import { relationshipPreview } from "./relationship.data";
import "../styles/tokens.css";
import "./relationshipPrototypes.css";

type Variant = "a" | "b" | "c";
const variants = { a: ["A", "인연 타임라인"], b: ["B", "활동 아틀라스"], c: ["C", "인연 카드"] } as const;
const query = new URLSearchParams(location.search);
const target = query.get("channel") ?? "4de764d9dad3b25602284be6db3ac647";
const channel = relationshipPreview(/^[0-9a-f]{32}$/.test(target) ? target : "4de764d9dad3b25602284be6db3ac647").channel;
const name = channel.channelName || "아리사";
const monthly = [280, 640, 820, 980, 1100, 1240, 1420, 1760, 2300, 1460];
const weekdays = [48, 65, 43, 70, 94, 82, 56];
const format = (n: number) => n.toLocaleString("ko-KR");
// 모든 안에서 같은 가상 기록을 사용한다. API를 호출하거나 실제 활동을 저장하지 않는다.
const activeDates = new Set([...Array.from({length:32}, (_,i)=>19+i), ...Array.from({length:92}, (_,i)=>55+Math.floor(i*239/91))]);
const dates = Array.from({ length: 365 }, (_, i) => {
  const active = activeDates.has(i);
  const value = active ? 1 + ((i * 17) % 4) : 0;
  return { date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), value, future: i > 294 };
});
function Portrait({ large = false }: { large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={`rp-portrait${large ? " rp-portrait-large" : ""}`}>{channel.channelImageUrl && !failed ? <img src={channel.channelImageUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span>{name.slice(0, 1)}</span>}</span>;
}
function Identity() { return <div className="rp-identity"><Portrait/><div><strong>{name}</strong><span>채널과 나의 인연</span></div></div>; }
function Stats() { return <dl className="rp-stats"><div><dt>나눈 채팅</dt><dd>12,000<small>개</small></dd></div><div><dt>채팅한 날</dt><dd>124<small>일</small></dd></div><div><dt>최장 연속 활동</dt><dd>32<small>일</small></dd></div></dl>; }
function Calendar() {
  const [selected, setSelected] = useState<string | null>(null);
  return <div className="rp-calendar"><div className="rp-calendar-scroll" tabIndex={0} aria-label="2026년 활동 달력, 좌우로 스크롤"><div className="rp-calendar-months">{Array.from({length:12},(_,i)=><span key={i}>{i+1}월</span>)}</div><div className="rp-grass">{dates.map(d=><button key={d.date} disabled={d.future} type="button" className={`rp-cell rp-heat-${d.value}`} aria-label={`${d.date} ${d.future ? "예정" : d.value ? "활동 있음" : "활동 없음"}`} aria-pressed={selected === d.date} onClick={()=>setSelected(d.date)} title={d.date}/>)}</div></div><div className="rp-calendar-foot"><span aria-live="polite">{selected ?? "2026년"}</span><span>적음 <i className="rp-heat-0"/><i className="rp-heat-1"/><i className="rp-heat-2"/><i className="rp-heat-3"/><i className="rp-heat-4"/> 많음</span></div></div>;
}
function Monthly() {
  const [selected, setSelected] = useState(8);
  return <div className="rp-monthly"><div className="rp-chart-readout"><span>2026년 {selected+1}월</span><strong>{format(monthly[selected])}<small>개</small></strong></div><div className="rp-bars">{monthly.map((count,i)=><button type="button" key={i} aria-label={`${i+1}월 채팅 ${format(count)}개`} aria-pressed={selected===i} onClick={()=>setSelected(i)}><span style={{height:`${count/2300*100}%`}}/><small>{i+1}월</small></button>)}</div></div>;
}
function Hours() {
  return <div className="rp-hours"><div className="rp-hours-axis"><span/><span>00</span><span>06</span><span>12</span><span>18</span><span>24시</span></div>{weekdays.map((strength,day)=><div className="rp-hour-row" key={day}><span>{["월","화","수","목","금","토","일"][day]}</span><div>{Array.from({length:24},(_,hour)=><i key={hour} className={`rp-heat-${hour>=19 || hour<2 ? Math.max(1,Math.floor(strength/24)-(hour%2)) : 0}`} title={`${["월","화","수","목","금","토","일"][day]}요일 ${hour}시`}/>)}</div></div>)}</div>;
}
function Moments() { return <div className="rp-moments"><div><span>가장 활발했던 날</span><strong>09.15</strong><small>2026년 · 채팅 420개</small></div><div><span>가장 활발했던 달</span><strong>9월</strong><small>2026년 · 채팅 2,300개</small></div></div>; }
function Timeline() { return <article className="rp-timeline"><header className="rp-a-hero"><Identity/><h1>첫 채팅부터,<br/>오늘의 인연까지.</h1><div className="rp-date-ribbon"><span>2026.01.20</span><span aria-hidden="true"/><strong>275일</strong><span aria-hidden="true"/><span>2026.10.22</span></div></header><Stats/><div className="rp-story"><section><div className="rp-story-date">01.20<small>2026</small></div><div className="rp-story-body"><span className="rp-tag">첫 인연</span><h2>첫 채팅을 남긴 날</h2><p className="rp-short">{name} 채널에서 시작한 기록</p></div></section><section><div className="rp-story-date">01—10<small>2026</small></div><div className="rp-story-body"><h2>채팅으로 채운 날들</h2><Calendar/></div></section><section><div className="rp-story-date">09.15<small>2026</small></div><div className="rp-story-body"><span className="rp-tag">가장 활발했던 날</span><h2>하루에 나눈 채팅 420개</h2><Moments/></div></section></div><footer className="rp-a-end"><Portrait/><span>전체 채팅의 <strong>80%</strong>를<br/>{name} 채널에서 남겼어요.</span></footer></article>; }
function Atlas() { return <article className="rp-atlas"><header className="rp-b-header"><Identity/><span className="rp-period">2026.01.20 — 10.22</span></header><div className="rp-b-intro"><h1>우리의 활동 지도</h1><p>2026년</p></div><div className="rp-b-summary"><Stats/><div className="rp-share-orbit"><svg viewBox="0 0 100 100" aria-label="전체 채팅의 80%"><circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="40" strokeDasharray="201 252"/></svg><div><strong>80%</strong><span>내 채팅 비율</span></div></div></div><section className="rp-panel rp-wide"><div className="rp-panel-title"><h2>채팅한 날</h2><span>124일</span></div><Calendar/></section><div className="rp-b-columns"><section className="rp-panel"><div className="rp-panel-title"><h2>월별 채팅</h2><span>총 12,000개</span></div><Monthly/></section><section className="rp-panel"><div className="rp-panel-title"><h2>주로 만난 시간</h2><span>한국 시간</span></div><Hours/></section></div><section className="rp-b-records"><h2>기록에 남은 순간</h2><Moments/></section></article>; }
function Keepsake() { const [side, setSide]=useState(false); return <article className="rp-keepsake"><div className="rp-c-layout"><div className="rp-passport"><div className="rp-passport-top"><span>나의 인연 카드</span><span>2026</span></div><div className="rp-passport-center"><Portrait large/><h1>{name}</h1><span className="rp-tag">나의 본진</span></div><div className="rp-passport-number"><span>첫 채팅 이후</span><strong>275<small>일</small></strong><span>2026.01.20 — 2026.10.22</span></div><div className="rp-passport-bottom"><span>recap</span><span>전체 채팅 중 <strong>80%</strong></span></div></div><div className="rp-c-details"><div className="rp-c-title"><h2>자주 만난 만큼,<br/>쌓인 기록들.</h2></div><Stats/><div className="rp-c-tabs" role="group" aria-label="카드 상세 보기"><button type="button" aria-pressed={!side} onClick={()=>setSide(false)}>기억할 순간</button><button type="button" aria-pressed={side} onClick={()=>setSide(true)}>월별 기록</button></div><div className="rp-c-content">{side ? <Monthly/> : <Moments/>}</div><div className="rp-c-streak"><span>최장 연속 활동</span><div aria-hidden="true">{Array.from({length:32},(_,i)=><i key={i}/>)}</div><strong>32일</strong></div></div></div><section className="rp-c-calendar"><div className="rp-panel-title"><h2>2026년, 채팅으로 남긴 흔적</h2><span>124일</span></div><Calendar/></section></article>; }
function App() {
  const initial=query.get("type");
  const [variant,setVariant]=useState<Variant>(initial==="b"||initial==="c"?initial:"a");
  const [dark,setDark]=useState(matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.className=dark?"dark":"light";
  function choose(value:Variant) {setVariant(value); const url=new URL(location.href); url.searchParams.set("type",value); history.replaceState(null,"",url);}
  return <><header className="rp-toolbar"><a className="rp-logo" href="/recap/">r<span>recap</span></a><nav aria-label="인연 페이지 시안">{(Object.keys(variants) as Variant[]).map(key=><button type="button" key={key} aria-label={`${variants[key][0]} ${variants[key][1]}`} aria-pressed={variant===key} onClick={()=>choose(key)}><b>{variants[key][0]}</b><span>{variants[key][1]}</span></button>)}</nav><button className="rp-theme" type="button" aria-label={dark?"라이트 모드":"다크 모드"} onClick={()=>setDark(!dark)}>{dark?"라이트":"다크"}</button></header><main className={`rp-main rp-type-${variant}`}><div className="rp-context"><span>인연 페이지 프로토타입</span><span>예시 데이터</span></div>{variant==="a"?<Timeline/>:variant==="b"?<Atlas/>:<Keepsake/>}<footer className="rp-bottom">{variants[variant][0]} · {variants[variant][1]}<span>2026.10.22 기준</span></footer></main></>;
}
createRoot(document.getElementById("root")!).render(<App/>);
