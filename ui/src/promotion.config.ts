// 배너는 슬롯 규격에 맞춰 완성한 이미지 한 장이다. 문구는 이미지 안에 있으므로 alt 에 그대로 옮긴다.
// 테마마다 따로 그린 이미지를 쓰고, 화면이 좁으면 모바일 이미지로 바꾼다.
// 배너 데이터는 Lab 관리 화면이 recap 스키마에 등록하고, 화면은 /api/banners 에서 받는다(bannerFeed.ts).
export interface BannerImage { src: string; width: number; height: number }
export interface ThemedBannerImage { light: BannerImage; dark: BannerImage }

export interface BannerPlacement {
  alt: string;
  desktop: ThemedBannerImage;
  mobile?: ThemedBannerImage;
}

// 한 화면에는 한 종류만 보인다: 넓은 화면은 side, 그 밖은 bottom.
export type PlacementKind = "side" | "bottom";

// 홍보물 하나. 링크와 노출 기간은 슬롯과 관계없이 같고, 슬롯마다 이미지와 alt 가 다르다.
// 본문 사이에 끼우는 슬롯은 두지 않는다.
export interface BannerCampaign {
  id: string;
  href: string;
  startsAt: string;
  endsAt: string;
  placements: Partial<Record<PlacementKind, BannerPlacement>>;
}
