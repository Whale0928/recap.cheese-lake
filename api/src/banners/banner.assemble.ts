// recap.banners · banner_placements · banner_images 의 행을 화면이 쓰는 모양으로 묶는다.
// 슬롯에 필요한 이미지가 하나라도 없으면 그 슬롯을 빼고, 남는 슬롯이 없으면 배너를 뺀다.

export type BannerSlot = "side" | "bottom";
export type BannerDevice = "desktop" | "mobile";
export type BannerTheme = "light" | "dark";

export interface BannerRow { id: string; link_url: string; starts_at: Date | string; ends_at: Date | string }
export interface PlacementRow { banner_id: string; slot: string; alt_text: string }
export interface ImageRow { banner_id: string; slot: string; device: string; theme: string; content_hash: string; width: number; height: number }

export interface BannerImage { src: string; width: number; height: number }
export interface ThemedBannerImage { light: BannerImage; dark: BannerImage }
export interface BannerPlacement { alt: string; desktop: ThemedBannerImage; mobile?: ThemedBannerImage }
export interface BannerResponse {
  id: string;
  href: string;
  startsAt: string;
  endsAt: string;
  placements: Partial<Record<BannerSlot, BannerPlacement>>;
}

// 슬롯마다 필요한 기기. side 는 넓은 화면에서만 보이므로 모바일 이미지가 없다.
const REQUIRED: Record<BannerSlot, readonly BannerDevice[]> = { side: ["desktop"], bottom: ["desktop", "mobile"] };
const HASH = /^[0-9a-f]{64}$/;
const IMAGE_FILE = /^([0-9a-f]{64})\.webp$/;

export const bannerImageSrc = (hash: string) => `/api/banners/images/${hash}.webp`;

/** 이미지 경로의 파일명에서 해시를 꺼낸다. 64자리 소문자 16진수 + .webp 가 아니면 undefined. */
export function imageHashFromFile(file: string): string | undefined {
  return IMAGE_FILE.exec(file)?.[1];
}

const iso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();

export function assembleBanners(banners: readonly BannerRow[], placements: readonly PlacementRow[], images: readonly ImageRow[]): BannerResponse[] {
  const result: BannerResponse[] = [];
  for (const banner of banners) {
    const out: BannerResponse["placements"] = {};
    for (const slot of Object.keys(REQUIRED) as BannerSlot[]) {
      const placement = placements.find(p => p.banner_id === banner.id && p.slot === slot);
      if (!placement) continue;
      const themed = (device: BannerDevice): ThemedBannerImage | undefined => {
        const pick = (theme: BannerTheme): BannerImage | undefined => {
          // CHAR(64) 는 공백으로 채워질 수 있어 비교 전에 다듬는다.
          const row = images.find(i => i.banner_id === banner.id && i.slot === slot && i.device === device && i.theme === theme);
          const hash = row?.content_hash.trim();
          return row && hash && HASH.test(hash) ? { src: bannerImageSrc(hash), width: Number(row.width), height: Number(row.height) } : undefined;
        };
        const light = pick("light"), dark = pick("dark");
        return light && dark ? { light, dark } : undefined;
      };
      const devices = REQUIRED[slot].map(device => [device, themed(device)] as const);
      if (devices.some(([, value]) => !value)) continue;
      const desktop = devices.find(([device]) => device === "desktop")![1]!;
      const mobile = devices.find(([device]) => device === "mobile")?.[1];
      out[slot] = { alt: placement.alt_text, desktop, ...(mobile ? { mobile } : {}) };
    }
    if (!out.side && !out.bottom) continue;
    result.push({ id: banner.id, href: banner.link_url, startsAt: iso(banner.starts_at), endsAt: iso(banner.ends_at), placements: out });
  }
  return result;
}
