import { promotionSlots, type Promotion } from "./promotion.config";
import "./sideBanners.css";

const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).split("/").reverse().join(".");

function PromotionPanel({ promotion }: { promotion: Promotion }) {
  return <a className="promotion-panel" href={promotion.href} target="_blank" rel="noopener noreferrer" aria-label={`${promotion.title} ${promotion.linkLabel} (새 창)`}>
    <span className="promotion-source">{promotion.source}</span>
    {promotion.image && <div className="promotion-art" aria-hidden="true"><img src={promotion.image.src} alt="" width={promotion.image.width} height={promotion.image.height} loading="lazy" decoding="async" /></div>}
    <div className="promotion-copy"><h2>{promotion.title}</h2>{promotion.description && <p>{promotion.description}</p>}</div>
    {promotion.schedule && <div className="promotion-schedule"><span>{promotion.schedule.label}</span><p><time dateTime={promotion.schedule.startsAt}>{dateLabel(promotion.schedule.startsAt)}</time> ~ <time dateTime={promotion.schedule.endsAt}>{dateLabel(promotion.schedule.endsAt)}</time></p>{promotion.schedule.note && <span>{promotion.schedule.note}</span>}</div>}
    <span className="promotion-link-label">{promotion.linkLabel}</span>
  </a>;
}

export function SideBanners() {
  return <>{(["left", "right"] as const).map(side => {
    const slot = promotionSlots[side];
    return slot ? <aside key={side} className={`side-banner side-banner-${side}`} data-layout={slot.layout} data-promotion={slot.promotion.id} aria-label={`${side === "left" ? "왼쪽" : "오른쪽"} 홍보 패널`}><PromotionPanel promotion={slot.promotion} /></aside> : null;
  })}</>;
}
