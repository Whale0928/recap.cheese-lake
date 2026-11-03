import type { InsightHandle } from "./useInsight";
import "./insightSummary.css";

// 활동 요약 · 습관 카드 줄 아래의 AI 분석 요약. 전체 카드에서 핵심만 뽑는다: 한 줄 · 칭호 · 당신다운 채팅.
// 분석이 끝났을 때만 나오고, 「전체 분석 보기」는 위 버튼과 같은 카드 창을 연다.
export function InsightSummary({ insight }: { insight: InsightHandle }) {
  const st = insight.phase.kind === "ready" ? insight.phase.status : null;
  const x = st?.state === "done" ? st.result : undefined;
  if (!x) return null;
  return <section className="me-section insight-summary" aria-labelledby="insight-summary-heading">
    <div className="insight-summary-inner">
      <div className="insight-summary-main">
        <p className="insight-summary-eyebrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>AI가 읽은 채팅방 속 당신</p>
        <h2 id="insight-summary-heading" className="insight-summary-headline">{x.headline}</h2>
        {x.title && <p className="insight-summary-title"><span className="insight-summary-badge">{x.title.name}</span>{x.title.why && <span className="insight-summary-why">{x.title.why}</span>}</p>}
        <button type="button" className="btn btn-outline insight-summary-more" aria-haspopup="dialog" onClick={() => insight.setOpen("view")}>
          전체 분석 보기<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      {x.quotes.length > 0 && <ul className="insight-summary-quotes" aria-label="당신다운 채팅">
        {x.quotes.slice(0, 3).map((q, i) => <li key={i}>
          <p className="insight-summary-bubble"><b>나</b>{q.text}</p>
          {q.nickname && <span className="insight-summary-nick">{q.nickname}</span>}
        </li>)}
      </ul>}
    </div>
  </section>;
}
