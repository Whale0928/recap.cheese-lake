import type { ViewerInsight } from "./insight.types";
import type { InsightMock } from "./InsightAction";
import "./insightSection.css";

// 활동 요약 · 습관 카드 줄 아래의 AI 분석 응답 자리. 아직 API 를 붙이지 않았고, 자리와 모양을 보려고 샘플 글을 그린다.
// 샘플은 실제 사람의 결과가 아니라 지어낸 것이다.
const SAMPLE: ViewerInsight = {
  headline: "당신은 명조 얘기에 “?”와 “오”로 반응해요.",
  summary: "명조의 뽑기와 스토리 이야기에 짧은 감탄과 되묻기로 반응하는 모습이 자주 보여요. 긴 설명보다는 한두 글자로 흐름을 받아 주는 채팅이 많아요.",
  title: { name: "한 글자 리액션러", why: "한두 글자로 흐름을 받아 주는 채팅이 가장 먼저 보여요." },
  topWords: ["오", "?", "ㅋㅋ", "헉", "ㄹㅇ"],
  roles: [{ name: "맞장구치기", description: "", evidence: [] }, { name: "감탄하기", description: "", evidence: [] }, { name: "질문하기", description: "", evidence: [] }],
  quotes: [
    { text: "?", nickname: "되묻기 담당", why: "무슨 일인지 짧게 되묻는 말이에요." },
    { text: "오", nickname: "감탄 한마디 담당", why: "장면이 좋을 때 한 글자로 반응해요." },
    { text: "80뽑 안에 나옵니다", nickname: "명조 뽑기 훈수꾼", why: "뽑기 천장을 알려 주는 말이에요." },
  ],
  topics: [{ name: "명조 뽑기", description: "", evidence: [], mentions: 120 }, { name: "스토리", description: "", evidence: [], mentions: 40 }],
  tone: { warmth: "반반", speech: "반말 위주", energy: "보통", address: "대화형", watch: "감상형", note: "" },
  catchphrases: [], change: { found: false, description: "", evidence: [] }, gaps: [],
};

export function InsightSection({ mock }: { mock: InsightMock }) {
  if (mock.state === "queued") return <section className="me-section insight-section" aria-labelledby="insight-heading" aria-busy="true" role="status">
    <h2 id="insight-heading" className="insight-sr-only">AI 분석 준비 중</h2>
    <div className="insight-wait">
      <p className="insight-wait-title">분석 차례를 기다리고 있어요</p>
      <p className="insight-wait-note">앞에 {mock.ahead}명 · 예상 약 {mock.etaSec}초 뒤 시작 예정 · 이 화면을 떠나도 계속 만들어져요</p>
      <div className="insight-sk" aria-hidden="true"><i className="sk sk-title" /><i className="sk sk-line" /><i className="sk sk-line" /></div>
    </div>
  </section>;
  return <section className="me-section insight-section" aria-labelledby="insight-heading">
    <h2 id="insight-heading" className="insight-sr-only">AI가 읽은 채팅방 속 당신</h2>
    <InsightBody data={SAMPLE} finishedAt="2026-11-02T06:00:00Z" />
  </section>;
}

/** 말투 다섯 축. 응답 값의 순서가 왼쪽 · 가운데 · 오른쪽이다. 「판단 어려움」은 숨긴다 */
const TONE_AXES = [
  { key: "warmth", left: "챙기는 편", right: "놀리는 편", values: ["챙기는 편", "반반", "놀리는 편"] },
  { key: "speech", left: "존댓말", right: "반말", values: ["존댓말 위주", "섞어 씀", "반말 위주"] },
  { key: "energy", left: "차분한", right: "과몰입", values: ["차분한 편", "보통", "과몰입하는 편"] },
  { key: "address", left: "혼잣말형", right: "대화형", values: ["혼잣말형", "반반", "대화형"] },
  { key: "watch", left: "감상형", right: "훈수형", values: ["감상형", "반반", "훈수형"] },
] as const;

const dateText = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
const mentionText = (n: number) => n < 10 ? `${n}번 이상` : `${(Math.floor(n / (n < 1000 ? 10 : 100)) * (n < 1000 ? 10 : 100)).toLocaleString("ko-KR")}번 이상`;

function InsightBody({ data: x, finishedAt }: { data: ViewerInsight; finishedAt?: string }) {
  const axes = TONE_AXES.map(a => ({ a, at: (a.values as readonly string[]).indexOf(x.tone[a.key]) })).filter(t => t.at >= 0).slice(0, 4);
  const topics = x.topics.filter(t => t.name.trim());
  return <article className="insight-card">
    <header className="insight-head">
      <p className="insight-eyebrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>AI가 읽은 채팅방 속 당신</p>
      <p className="insight-headline">{x.headline}</p>
      {x.summary && <p className="insight-summary">{x.summary}</p>}
    </header>
    {(x.title || x.roles.length > 0 || (x.topWords?.length ?? 0) > 0) && <div className="insight-strip">
      {x.title && <div className="insight-block">
        <h3 className="insight-label">채팅방 속 당신의 칭호</h3>
        <b className="insight-badge">{x.title.name}</b>
        {x.title.why && <p className="insight-desc">{x.title.why}</p>}
      </div>}
      {x.roles.length > 0 && <div className="insight-block">
        <h3 className="insight-label">자주 하는 행동</h3>
        <ul className="insight-chips">{x.roles.map(r => <li key={r.name} title={r.description}>{r.name}</li>)}</ul>
      </div>}
      {x.topWords && x.topWords.length > 0 && <div className="insight-block">
        <h3 className="insight-label">자주 쓰는 말</h3>
        <ol className="insight-words">{x.topWords.slice(0, 5).map((w, i) => <li key={w}><span>{i + 1}</span>{w}</li>)}</ol>
      </div>}
    </div>}
    {x.quotes.length > 0 && <div className="insight-quotes">
      <h3 className="insight-label">당신다운 채팅 {x.quotes.length}</h3>
      <ul>{x.quotes.map((q, i) => <li key={i}>
        <p className="insight-bubble"><b>나</b>{q.text}</p>
        <p className="insight-why">{q.nickname && <em>{q.nickname}</em>}{q.why}</p>
      </li>)}</ul>
    </div>}
    {(topics.length > 0 || axes.length > 0) && <div className="insight-foot">
      {topics.length > 0 && <div className="insight-block">
        <h3 className="insight-label">자주 꺼내는 이야기</h3>
        <ul className="insight-topics">{topics.slice(0, 5).map(t => <li key={t.name}><b>{t.name}</b>{t.mentions !== undefined && <span>{mentionText(t.mentions)}</span>}</li>)}</ul>
      </div>}
      {axes.length > 0 && <dl className="insight-tone" aria-label="말투">
        {axes.map(({ a, at }) => <div key={a.key}>
          <dt><span>{a.left}</span><span>{a.right}</span></dt>
          <dd className="insight-tone-bar">{a.values.map((_, i) => <span key={i} className={i === at ? "on" : ""} />)}</dd>
          <dd className="insight-tone-value">{a.values[at]}</dd>
        </div>)}
      </dl>}
    </div>}
    <p className="insight-meta">AI가 채팅 원문을 읽고 쓴 카드예요. 틀린 부분이 있을 수 있어요{finishedAt ? ` · ${dateText(finishedAt)}` : ""}</p>
  </article>;
}
