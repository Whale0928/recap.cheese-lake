import { assembleBanners, imageHashFromFile, type ImageRow } from "../src/banners/banner.assemble.js";
import { BannerController } from "../src/banners/banner.controller.js";
import { BannerStore } from "../src/banners/banner.store.js";
import { isPublicCachePath } from "../src/app.js";

const id = "3f6b1c2e-8d4a-4f0b-9a51-2c7e5d1a9b30";
const banner = { id, link_url: "https://game.naver.com/lounge/chzzk/board/detail/8298140", starts_at: new Date("2026-10-16T10:00:00Z"), ends_at: new Date("2026-11-07T10:00:00Z") };
const placements = [{ banner_id: id, slot: "side", alt_text: "사이드 문구" }, { banner_id: id, slot: "bottom", alt_text: "하단 문구" }];
const hash = (n: number) => n.toString(16).padStart(64, "0");
const size = { side: [512, 1680], desktop: [2304, 400], mobile: [720, 480] } as const;
const image = (slot: string, device: string, theme: string, n: number): ImageRow => {
  const [width, height] = slot === "side" ? size.side : device === "mobile" ? size.mobile : size.desktop;
  return { banner_id: id, slot, device, theme, content_hash: hash(n), width, height };
};
const allImages = [
  image("side", "desktop", "light", 1), image("side", "desktop", "dark", 2),
  image("bottom", "desktop", "light", 3), image("bottom", "desktop", "dark", 4),
  image("bottom", "mobile", "light", 5), image("bottom", "mobile", "dark", 6),
];

describe("banner response assembly", () => {
  it("builds both slots with image URLs keyed by content hash", () => {
    const [result] = assembleBanners([banner], placements, allImages);
    expect(result).toEqual({
      id, href: banner.link_url, startsAt: "2026-10-16T10:00:00.000Z", endsAt: "2026-11-07T10:00:00.000Z",
      placements: {
        side: { alt: "사이드 문구", desktop: { light: { src: `/api/banners/images/${hash(1)}.webp`, width: 512, height: 1680 }, dark: { src: `/api/banners/images/${hash(2)}.webp`, width: 512, height: 1680 } } },
        bottom: {
          alt: "하단 문구",
          desktop: { light: { src: `/api/banners/images/${hash(3)}.webp`, width: 2304, height: 400 }, dark: { src: `/api/banners/images/${hash(4)}.webp`, width: 2304, height: 400 } },
          mobile: { light: { src: `/api/banners/images/${hash(5)}.webp`, width: 720, height: 480 }, dark: { src: `/api/banners/images/${hash(6)}.webp`, width: 720, height: 480 } },
        },
      },
    });
  });

  it("drops a slot when any required image is missing and keeps the other", () => {
    const [result] = assembleBanners([banner], placements, allImages.filter(i => !(i.device === "mobile" && i.theme === "dark")));
    expect(result.placements.bottom).toBeUndefined();
    expect(result.placements.side?.alt).toBe("사이드 문구");
  });

  it("drops a slot without a placement row", () => {
    const [result] = assembleBanners([banner], placements.filter(p => p.slot !== "side"), allImages);
    expect(result.placements.side).toBeUndefined();
    expect(result.placements.bottom).toBeDefined();
  });

  it("drops the banner when no slot is complete", () => {
    expect(assembleBanners([banner], placements, allImages.filter(i => i.theme === "light"))).toEqual([]);
  });

  it("trims CHAR padding and ignores malformed hashes", () => {
    const padded = allImages.map(i => i.slot === "side" ? { ...i, content_hash: `${i.content_hash} ` } : i);
    expect(assembleBanners([banner], placements, padded)[0].placements.side).toBeDefined();
    const broken = allImages.map(i => i.slot === "side" && i.theme === "dark" ? { ...i, content_hash: "Z".repeat(64) } : i);
    expect(assembleBanners([banner], placements, broken)[0].placements.side).toBeUndefined();
  });
});

describe("banner image file name", () => {
  it("accepts only a lower-case 64 hex hash with .webp", () => {
    const h = "ab12".repeat(16);
    expect(imageHashFromFile(`${h}.webp`)).toBe(h);
    for (const file of [`${h}.png`, `${h.toUpperCase()}.webp`, h, `../${h}.webp`, `${h.slice(1)}.webp`, `${h}.webp.webp`]) {
      expect(imageHashFromFile(file)).toBeUndefined();
    }
  });
});

describe("banner public cache boundary", () => {
  it("skips the session only for banner GET/HEAD paths", () => {
    expect(isPublicCachePath({ method: "GET", path: "/api/banners" })).toBe(true);
    expect(isPublicCachePath({ method: "HEAD", path: `/api/banners/images/${hash(1)}.webp` })).toBe(true);
    expect(isPublicCachePath({ method: "POST", path: "/api/banners" })).toBe(false);
    expect(isPublicCachePath({ method: "GET", path: "/api/bannersx" })).toBe(false);
    expect(isPublicCachePath({ method: "GET", path: "/api/session" })).toBe(false);
    expect(isPublicCachePath({ method: "GET", path: "/api/me" })).toBe(false);
  });

  it("matches the router's case-insensitive and trailing-slash variants but nothing wider", () => {
    for (const path of ["/api/banners/", "/API/BANNERS", "/Api/Banners/", `/api/banners/IMAGES/${hash(1)}.webp`, `/api/banners/images/${hash(1)}.webp/`]) {
      expect(isPublicCachePath({ method: "GET", path })).toBe(true);
    }
    for (const path of ["/api/banners//", "/api/banners/images/", "/api/banners/images/../../me", "/api/banners/images/a/b", "/api/banners/other"]) {
      expect(isPublicCachePath({ method: "GET", path })).toBe(false);
    }
  });

  const response = () => {
    const headers: Record<string, string> = {};
    return { headers, res: { setHeader: (name: string, value: string) => { headers[name] = value; }, status: () => undefined } as unknown as import("express").Response };
  };

  it("marks only a successful list as publicly cacheable", async () => {
    const ok = response();
    await new BannerController({ listUpcoming: async () => [] } as unknown as BannerStore).list(ok.res);
    expect(ok.headers["Cache-Control"]).toBe("public, max-age=60, stale-while-revalidate=300");

    const failed = response();
    await expect(new BannerController({ listUpcoming: async () => { throw new Error("db down"); } } as unknown as BannerStore).list(failed.res)).rejects.toThrow("Banners unavailable");
    expect(failed.headers["Cache-Control"]).toBe("no-store");
  });

  it("does not cache an image lookup failure", async () => {
    const failed = response();
    const controller = new BannerController({ imageData: async () => { throw new Error("db down"); } } as unknown as BannerStore);
    await expect(controller.image(`${hash(1)}.webp`, { headers: {} } as import("express").Request, failed.res)).rejects.toThrow("Banner image unavailable");
    expect(failed.headers["Cache-Control"]).toBe("no-store");
  });
});
