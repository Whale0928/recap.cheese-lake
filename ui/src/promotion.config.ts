export interface Promotion {
  id: string;
  source: string;
  title: string;
  description?: string;
  href: string;
  linkLabel: string;
  image?: { src: string; width: number; height: number };
  schedule?: { startsAt: string; endsAt: string; label: string; note?: string };
}

const togetherNotice: Promotion = {
  id: "kindaichi-season-2",
  source: "치지직 같이보기",
  title: "소년탐정 김전일 2기",
  description: "이번엔 치지직에서\n같이 추리해 볼까요.",
  href: "https://game.naver.com/lounge/chzzk/board/detail/8298140",
  linkLabel: "공식 공지 보기",
  image: { src: "/images/kindaichi_notice.png", width: 1500, height: 5223 },
  schedule: {
    startsAt: "2026-10-16T19:00:00+09:00", endsAt: "2026-11-07T19:00:00+09:00",
    label: "같이보기 기간", note: "시작일·종료일 모두 19시 기준",
  },
};

// 비어 있는 슬롯은 null로 두며, 페이지별로 홍보물을 직접 삽입하지 않는다.
export interface PromotionSlot {
  promotion: Promotion;
  layout: "compact" | "poster";
}

export const promotionSlots: Record<"left" | "right", PromotionSlot | null> = {
  left: { promotion: togetherNotice, layout: "poster" },
  right: { promotion: togetherNotice, layout: "poster" },
};
