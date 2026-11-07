import { downloadElementImage } from "./image.download";
import cardCSS from "./insightCard.css?raw";

// 스크롤하는 dialog가 아니라 카드 본문을 캡처해 아래쪽 분석까지 한 장에 담는다.
export async function downloadInsightCard(card: HTMLElement): Promise<void> {
  // 캡처용 style 노드를 첫 구역으로 세어 구분선을 넣지 않는다.
  await downloadElementImage(card, `${cardCSS}\n.vc > style:first-child + .vc-head { border-top: 0; padding-top: 0; }`, "내 AI 분석.png");
}
