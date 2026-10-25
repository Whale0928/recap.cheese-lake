import type { BannerCampaign, BannerImage, BannerPlacement, PlacementKind, ThemedBannerImage } from "./promotion.config";

// /api/banners 응답을 화면이 쓰는 모양으로 확인한다. 모양이 어긋난 슬롯·배너는 조용히 버리고,
// 링크는 http·https, 이미지는 recap 이 내주는 배너 이미지 경로만 받는다.
const IMAGE_SRC = /^\/api\/banners\/images\/[0-9a-f]{64}\.webp$/;
const REQUIRED: Record<PlacementKind, readonly ("desktop" | "mobile")[]> = { side: ["desktop"], bottom: ["desktop", "mobile"] };

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

function image(value: unknown): BannerImage | undefined {
  const v = record(value);
  if (!v || typeof v.src !== "string" || !IMAGE_SRC.test(v.src)) return undefined;
  const width = v.width, height = v.height;
  return Number.isInteger(width) && Number.isInteger(height) && (width as number) > 0 && (height as number) > 0
    ? { src: v.src, width: width as number, height: height as number } : undefined;
}

function themed(value: unknown): ThemedBannerImage | undefined {
  const v = record(value);
  const light = image(v?.light), dark = image(v?.dark);
  return light && dark ? { light, dark } : undefined;
}

function placement(kind: PlacementKind, value: unknown): BannerPlacement | undefined {
  const v = record(value);
  if (!v || typeof v.alt !== "string" || !v.alt.trim()) return undefined;
  const desktop = themed(v.desktop);
  const mobile = REQUIRED[kind].includes("mobile") ? themed(v.mobile) : undefined;
  if (!desktop || (REQUIRED[kind].includes("mobile") && !mobile)) return undefined;
  return { alt: v.alt, desktop, ...(mobile ? { mobile } : {}) };
}

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : undefined;
  } catch {
    // 주소로 읽을 수 없는 링크는 배너째 버린다.
    return undefined;
  }
}

export function parseBanners(body: unknown): BannerCampaign[] {
  if (!Array.isArray(body)) return [];
  return body.flatMap(item => {
    const v = record(item);
    const href = httpUrl(v?.href);
    if (!v || typeof v.id !== "string" || !href || typeof v.startsAt !== "string" || typeof v.endsAt !== "string") return [];
    const raw = record(v.placements);
    const placements: BannerCampaign["placements"] = {};
    for (const kind of Object.keys(REQUIRED) as PlacementKind[]) {
      const parsed = placement(kind, raw?.[kind]);
      if (parsed) placements[kind] = parsed;
    }
    return placements.side || placements.bottom ? [{ id: v.id, href, startsAt: v.startsAt, endsAt: v.endsAt, placements }] : [];
  });
}

/**
 * 배너 목록을 받는다. 받지 못하면 null 이다 — 진짜 빈 목록(관리자가 모두 끔)과 구분해야
 * 다시 받기에 실패했을 때 보이던 배너를 지우지 않는다. 배너는 로그인과 무관하므로 쿠키를 보내지 않는다.
 */
export async function fetchBanners(fetchImpl: typeof fetch = fetch): Promise<BannerCampaign[] | null> {
  try {
    const response = await fetchImpl("/api/banners", { headers: { Accept: "application/json" }, credentials: "omit" });
    return response.ok ? parseBanners(await response.json()) : null;
  } catch {
    // 배너는 부가 요소라 네트워크·응답 오류를 화면 오류로 올리지 않는다.
    return null;
  }
}
