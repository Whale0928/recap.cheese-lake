import { useState } from "react";
import type { ReceivedShare } from "./relationship.share";
import { shareInitial, thumb, viewerBadge } from "./sharedViews";

export type AvatarShare = Pick<ReceivedShare, "ownerChannelName" | "ownerChannelImageUrl" | "subscriptionMonths" | "rank">;

// 시청자 아바타. 프로필 사진이 있으면 사진을, 없으면 유형(랭커·구독자·기본)별 기본 모양을 그린다.
// 구독 개월 수가 길수록 테두리 효과가 화려해진다(viewerBadge). 크기는 부모가 정하고, px 는 받아 올 사진 크기의 기준이다.
// large 일 때만 왕관·별 같은 작은 표식을 붙인다.
export function ShareAvatar({ share, px, large = false }: { share: AvatarShare; px: number; large?: boolean }) {
  const badge = viewerBadge(share);
  const [failed, setFailed] = useState<string | null>(null);
  const url = share.ownerChannelImageUrl;
  const src = url && failed !== url ? thumb(url, px) : null;
  return <span className={`vw-avatar${large ? " is-large" : ""}`} data-kind={badge.kind} data-tier={badge.tier} data-medal={badge.medal ?? undefined} data-image={src ? "yes" : "no"} aria-hidden="true">
    <span className="vw-art">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(url)} /> : <span className="vw-initial">{shareInitial(share)}</span>}
    </span>
    {badge.tier > 0 && <span className="vw-fx" />}
    {badge.tier >= 4 && <span className="vw-spark"><i /><i /><i /></span>}
    {large && badge.kind === "ranker" && <svg className="vw-crown" viewBox="0 0 20 14" focusable="false"><path d="M1.5 12.5 3 4l4.2 3.8L10 1.5l2.8 6.3L17 4l1.5 8.5z" /></svg>}
    {large && badge.kind === "subscriber" && <svg className="vw-star" viewBox="0 0 16 16" focusable="false"><path d="m8 1.2 2 4.3 4.7.6-3.4 3.2.9 4.7L8 11.7l-4.2 2.3.9-4.7L1.3 6.1 6 5.5z" /></svg>}
  </span>;
}
