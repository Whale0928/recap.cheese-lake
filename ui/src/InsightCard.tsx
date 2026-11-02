import type { ViewerInsight } from "./insight.types";
import "./insightCard.css";

// 「내 AI 분석 보기」 창에 그리는 카드. 랩 콘솔의 시청자 분석 미리보기(ViewerInsightCard)와 같은 구역 · 순서이고,
// 색 · 글꼴만 리캡 토큰으로 바꿨다. 구역이 비면 그리지 않는다.

/** 말투 다섯 축. 응답 스펙의 enum 순서와 같다(왼쪽 · 가운데 · 오른쪽). 「판단 어려움」이면 어느 칸도 채우지 않는다 */
const TONE_AXES = [
  { key: "warmth", left: "챙기는 편", right: "놀리는 편", values: ["챙기는 편", "반반", "놀리는 편"] },
  { key: "speech", left: "존댓말", right: "반말", values: ["존댓말 위주", "섞어 씀", "반말 위주"] },
  { key: "energy", left: "차분한", right: "과몰입", values: ["차분한 편", "보통", "과몰입하는 편"] },
  { key: "address", left: "혼잣말형", right: "대화형", values: ["혼잣말형", "반반", "대화형"] },
  { key: "watch", left: "감상형", right: "훈수형", values: ["감상형", "반반", "훈수형"] },
] as const;
/** 말투 막대는 이만큼까지만 보인다. 다섯 줄을 다 쌓으면 머리가 빽빽해진다 */
const TONE_MAX = 4;

/** 판단된 축만 고른다. 넘치면 한쪽으로 뚜렷한 축을 가운데(반반 · 보통)보다 먼저 남기고, 순서는 원래대로 둔다 */
function judgedAxes(tone: ViewerInsight["tone"]) {
  const judged = TONE_AXES.map((a, order) => ({ a, order, at: (a.values as readonly string[]).indexOf(tone[a.key] ?? "") })).filter(t => t.at >= 0);
  return [...judged].sort((p, q) => Number(p.at === 1) - Number(q.at === 1)).slice(0, TONE_MAX).sort((p, q) => p.order - q.order);
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** 서버가 전체 채팅에서 센 언급 수를 대략으로 말한다. 찾을 낱말로 센 근사라 내림해서 「이상」으로 말한다 */
function mentionText(n: number) {
  if (n < 10) return `${n}번 이상 이야기했어요`;
  const step = n < 1000 ? 10 : 100;
  return `${(Math.floor(n / step) * step).toLocaleString("ko-KR")}번 이상 이야기했어요`;
}
/** 이보다 긴 말버릇은 큰 글자 대신 한 단계 작게 쓴다 */
const PHRASE_LONG = 12;
const dateText = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

export function InsightCard({ insight: x, finishedAt }: { insight: ViewerInsight; finishedAt?: string }) {
  const axes = judgedAxes(x.tone);
  const gaps = x.gaps.filter(g => g.trim());
  return <section className="vc">
    <header className="vc-head">
      <div className="vc-head-main">
        <div className="vc-eyebrow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>
          <span>AI가 읽은 채팅방 속 당신</span>
        </div>
        <h2 className="vc-title">{x.headline}</h2>
        {x.summary && <p className="vc-summary">{x.summary}</p>}
      </div>
      {axes.length > 0 && <dl className="vc-tone">
        {axes.map(({ a, at }) => <div key={a.key}>
          <dt><span>{a.left}</span><span>{a.right}</span></dt>
          <dd className="vc-tone-bar">{a.values.map((_, i) => <span key={i} className={i === at ? "on" : ""} />)}</dd>
          <dd className="vc-tone-value">{a.values[at]}</dd>
        </div>)}
      </dl>}
    </header>

    {(x.title || x.roles.length > 0 || (x.topWords?.length ?? 0) > 0) && <div className="vc-strip">
      {x.title && <div className="vc-block vc-title-block">
        <h3 className="vc-label">채팅방 속 당신의 칭호</h3>
        <b className="vc-badge">{x.title.name}</b>
        {x.title.why && <p className="vc-desc">{x.title.why}</p>}
      </div>}
      {x.roles.length > 0 && <div className="vc-block">
        <h3 className="vc-label">채팅방에서 자주 하는 행동</h3>
        <div className="vc-chips vc-role-tags">{x.roles.map((r, i) => <span key={i} className="vc-chip">{r.name}</span>)}</div>
      </div>}
      {x.topWords && x.topWords.length > 0 && <div className="vc-block">
        <h3 className="vc-label">자주 쓰는 말</h3>
        <ol className="vc-words">{x.topWords.map((w, i) => <li key={w}><span className="vc-num">{i + 1}</span>{w}</li>)}</ol>
      </div>}
    </div>}

    {x.quotes.length > 0 && <div className="vc-quotes">
      <div className="vc-chat">
        <div className="vc-chat-head"><span>채팅</span><span className="vc-chat-count">당신다운 채팅 {x.quotes.length}</span></div>
        <div className="vc-chat-body">
          {x.quotes.map((q, i) => <div key={i} className="vc-chat-row">
            <span aria-hidden="true" className="vc-chat-ghost" style={{ width: `${[58, 72, 44][i % 3]}%` }} />
            <p className="vc-bubble"><b>나</b>{q.text}</p>
          </div>)}
        </div>
      </div>
      <div className="vc-why">
        <h3 className="vc-why-title">당신이 가장<br />당신다웠던 채팅</h3>
        <ol>
          {x.quotes.map((q, i) => <li key={i}>
            <span className="vc-num">{i + 1}</span>
            <span>{q.nickname && <b className="vc-nick">{q.nickname}</b>}{q.why}</span>
          </li>)}
        </ol>
      </div>
    </div>}

    {x.change.found && <div className="vc-change">
      <div className="vc-change-main">
        <h3 className="vc-label">예전과 요즘</h3>
        <p className="vc-change-text">{x.change.description}</p>
      </div>
      {x.change.evidence.length > 0 && <div className="vc-chips-wrap">
        <span className="vc-chips-label">예시 채팅</span>
        <div className="vc-chips">{x.change.evidence.map((e, i) => <span key={i} className="vc-chip">{e}</span>)}</div>
      </div>}
    </div>}

    {(x.topics.length > 0 || x.catchphrases.length > 0) && <div className={`vc-bottom${x.catchphrases.length === 0 ? " no-phrases" : ""}`}>
      {x.topics.length > 0 && <div className="vc-block">
        <h3 className="vc-label">자주 꺼내는 이야기</h3>
        <ol className="vc-topics">
          {x.topics.map((t, i) => <li key={i}>
            <span className="vc-num">{pad2(i + 1)}</span>
            <span className="vc-topic-main">
              <b>{t.name}</b>
              {t.description && <span className="vc-desc">{t.description}</span>}
              {t.mentions != null && <span className="vc-mentions">{mentionText(t.mentions)}</span>}
            </span>
            <span className="vc-topic-quote">{t.evidence[0] ? `“${t.evidence[0]}”` : ""}</span>
          </li>)}
        </ol>
      </div>}
      {x.catchphrases.length > 0 && <div className="vc-block">
        <h3 className="vc-label">말버릇</h3>
        <div className="vc-phrases">
          {x.catchphrases.map((c, i) => <div key={i}>
            <span className={`vc-phrase${i === 0 ? " accent" : ""}${c.text.length > PHRASE_LONG ? " long" : ""}`}>{c.text}</span>
            {c.note && <span className="vc-desc">{c.note}</span>}
          </div>)}
        </div>
      </div>}
    </div>}

    <footer className="vc-foot">
      {gaps.length > 0 ? <div className="vc-gaps"><b>이 해석이 말하지 못하는 것</b>{gaps.map((g, i) => <span key={i}>{g}</span>)}</div> : <span />}
      <span className="vc-meta">AI가 채팅 원문을 읽고 쓴 카드예요. 틀린 부분이 있을 수 있어요{finishedAt ? ` · ${dateText(finishedAt)}` : ""}</span>
    </footer>
  </section>;
}
