import { useSyncExternalStore } from "react";
import { createBannerStore, type Slots } from "./bannerStore";
import type { SlotBanner } from "./bannerRotation";
import "./banners.css";

type Theme = "light" | "dark";

// 본문이 한 단으로 바뀌는 기준과 같다. 이보다 좁으면 데스크톱 이미지의 글자를 읽을 수 없다.
const mobileQuery = "(max-width: 860px)";
const store = createBannerStore();

// 받기 전에는 아무 배너도 그리지 않는다. 서버 렌더링(prerender)에서는 구독하지 않아 배너가 없다.
function useSlots(): Slots | null {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
}

function BannerLink({ banner, theme }: { banner: SlotBanner; theme: Theme }) {
  const desktop = banner.placement.desktop[theme];
  const mobile = banner.placement.mobile?.[theme];
  return <a className="banner-link" href={banner.href} target="_blank" rel="noopener noreferrer" aria-label={`${banner.placement.alt} (새 창)`}>
    <picture>
      {mobile && <source media={mobileQuery} srcSet={mobile.src} width={mobile.width} height={mobile.height} />}
      <img src={desktop.src} width={desktop.width} height={desktop.height} alt="" loading="lazy" decoding="async" />
    </picture>
  </a>;
}

// 한 화면에는 한 종류의 슬롯만 보인다. 사이드가 들어가는 넓은 화면은 사이드만, 그 밖에는 하단만 쓴다(banners.css).
export function BottomBanner({ theme }: { theme: Theme }) {
  const banner = useSlots()?.bottom;
  if (!banner) return null;
  return <aside className="banner-slot banner-bottom" aria-label="홍보 배너" data-banner={banner.campaignId}>
    <BannerLink banner={banner} theme={theme} />
  </aside>;
}

export function SideBanners({ theme }: { theme: Theme }) {
  const slots = useSlots();
  if (!slots) return null;
  return <>{(["left", "right"] as const).map(side => {
    const banner = slots[side];
    return banner ? <aside key={side} className={`banner-side banner-side-${side}`} aria-label={`${side === "left" ? "왼쪽" : "오른쪽"} 홍보 배너`} data-banner={banner.campaignId}>
      <BannerLink banner={banner} theme={theme} />
    </aside> : null;
  })}</>;
}
