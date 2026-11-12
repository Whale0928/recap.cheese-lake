import type { InsightHandle } from "./useInsight";
import { TicketIcon } from "./InsightAction";
import "./insightTeaser.css";

// 티켓은 있는데 아직 분석을 받지 않은 사람에게만 나온다. 받은 티켓을 화면에 계속 남겨 두고,
// 결과가 어떤 모양인지 예시로 미리 보여 준다. 예시에는 채팅 원문을 넣지 않는다.
export function InsightTeaser({ insight }: { insight: InsightHandle }) {
  const { phase, pending, done, tickets } = insight;
  if (phase.kind !== "ready" && phase.kind !== "unavailable" || pending || done || tickets < 1) return null;
  return <section className="me-section insight-teaser" data-image-download-exclude aria-labelledby="insight-teaser-heading">
    <div className="insight-teaser-inner">
      <div className="insight-teaser-main">
        <p className="insight-teaser-ticket"><TicketIcon />선물 받은 분석 티켓 {tickets}장</p>
        <h2 id="insight-teaser-heading">AI가 채팅방 속 나를 한 줄로 말해 줘요</h2>
        <p className="insight-teaser-copy">한 줄 소개와 칭호, 맡은 역할, 말투까지 카드 한 장에 담아요. 받은 티켓으로 지금 바로 볼 수 있어요.</p>
        <button type="button" className="btn btn-default insight-teaser-cta" aria-haspopup="dialog" onClick={() => insight.setOpen("consent")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>AI 분석 받아보기
        </button>
      </div>
      <div className="insight-teaser-sample" aria-hidden="true">
        <span className="insight-teaser-tag">예시</span>
        <p className="insight-teaser-headline">새벽마다 나타나 분위기를 띄우는 사람</p>
        <p className="insight-teaser-badge">새벽반 반장</p>
        <dl>
          <div><dt>맡은 역할</dt><dd><i /><i /></dd></div>
          <div><dt>자주 꺼낸 이야기</dt><dd><i /><i /><i /></dd></div>
          <div><dt>말투</dt><dd><i /></dd></div>
        </dl>
      </div>
    </div>
  </section>;
}
