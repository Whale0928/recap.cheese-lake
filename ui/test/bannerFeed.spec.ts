import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchBanners, parseBanners } from "../src/bannerFeed.ts";

const src = (n: number) => `/api/banners/images/${n.toString(16).padStart(64, "0")}.webp`;
const themed = (a: number, b: number, width: number, height: number) => ({ light: { src: src(a), width, height }, dark: { src: src(b), width, height } });
const banner = (changes: Record<string, unknown> = {}) => ({
  id: "3f6b1c2e-8d4a-4f0b-9a51-2c7e5d1a9b30",
  href: "https://game.naver.com/lounge/chzzk/board/detail/8298140",
  startsAt: "2026-10-16T10:00:00.000Z",
  endsAt: "2026-11-07T10:00:00.000Z",
  placements: {
    side: { alt: "사이드 문구", desktop: themed(1, 2, 512, 1680) },
    bottom: { alt: "하단 문구", desktop: themed(3, 4, 2304, 400), mobile: themed(5, 6, 720, 480) },
  },
  ...changes,
});

test("API 응답의 배너를 그대로 받는다", () => {
  const [parsed] = parseBanners([banner()]);
  assert.equal(parsed.href, "https://game.naver.com/lounge/chzzk/board/detail/8298140");
  assert.equal(parsed.placements.side?.desktop.dark.src, src(2));
  assert.equal(parsed.placements.bottom?.mobile?.light.width, 720);
});

test("http·https 가 아닌 링크와 모양이 틀린 배너는 버린다", () => {
  for (const changes of [{ href: "javascript:alert(1)" }, { href: "//evil.test" }, { id: 1 }, { startsAt: null }]) {
    assert.deepEqual(parseBanners([banner(changes)]), [], JSON.stringify(changes));
  }
  assert.deepEqual(parseBanners({ items: [] }), []);
});

test("배너 이미지 경로가 아닌 이미지가 있는 슬롯은 버리고 나머지 슬롯은 남긴다", () => {
  const external = banner({ placements: { ...banner().placements, side: { alt: "사이드", desktop: { ...themed(1, 2, 512, 1680), light: { src: "https://evil.test/a.webp", width: 512, height: 1680 } } } } });
  const [parsed] = parseBanners([external]);
  assert.equal(parsed.placements.side, undefined);
  assert.ok(parsed.placements.bottom);
});

test("하단 슬롯은 모바일 이미지까지 있어야 하고, 슬롯이 하나도 없으면 배너를 버린다", () => {
  const noMobile = { alt: "하단", desktop: themed(3, 4, 2304, 400) };
  assert.deepEqual(parseBanners([banner({ placements: { bottom: noMobile } })]), []);
  assert.deepEqual(parseBanners([banner({ placements: { side: { alt: " ", desktop: themed(1, 2, 512, 1680) } } })]), []);
});

test("응답이 실패하거나 네트워크 오류가 나면 빈 목록이다", async () => {
  assert.equal(await fetchBanners(async () => new Response("", { status: 503 })), null);
  assert.equal(await fetchBanners(async () => { throw new TypeError("offline"); }), null);
  assert.deepEqual(await fetchBanners(async () => Response.json([])), [], "관리자가 모두 끈 빈 목록은 실패와 구분한다");
  let sent: RequestInit | undefined;
  await fetchBanners(async (_url, init) => { sent = init; return Response.json([]); });
  assert.equal(sent?.credentials, "omit", "배너 요청은 쿠키를 보내지 않는다");
  const ok = await fetchBanners(async () => Response.json([banner()]));
  assert.equal(ok.length, 1);
});
