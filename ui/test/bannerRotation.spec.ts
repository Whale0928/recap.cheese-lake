import assert from "node:assert/strict";
import { test } from "node:test";
import { activeCampaigns, assignSlots, nextBoundary, rankedCampaigns } from "../src/bannerRotation.ts";
import type { BannerCampaign } from "../src/promotion.config.ts";

const image = { light: { src: "/l.webp", width: 1, height: 1 }, dark: { src: "/d.webp", width: 1, height: 1 } };
const campaign = (id: string, startsAt: string, endsAt: string, kinds: ("side" | "bottom")[] = ["side", "bottom"]): BannerCampaign => ({
  id, href: `https://example.com/${id}`, startsAt, endsAt,
  placements: Object.fromEntries(kinds.map(kind => [kind, { alt: `${id} ${kind}`, desktop: image }])),
});
const at = (iso: string) => Date.parse(iso);

test("노출 기간은 시작 시각을 포함하고 종료 시각을 제외한다", () => {
  const list = [campaign("a", "2026-11-07T10:00:00+09:00", "2026-11-07T19:00:00+09:00")];
  assert.deepEqual(activeCampaigns(list, at("2026-11-07T09:59:59+09:00")), []);
  assert.equal(activeCampaigns(list, at("2026-11-07T10:00:00+09:00")).length, 1);
  assert.equal(activeCampaigns(list, at("2026-11-07T18:59:59+09:00")).length, 1);
  assert.deepEqual(activeCampaigns(list, at("2026-11-07T19:00:00+09:00")), []);
});

test("시각을 읽을 수 없는 홍보물은 노출하지 않는다", () => {
  assert.deepEqual(activeCampaigns([campaign("a", "언제", "2026-11-07T19:00:00+09:00")], at("2026-11-01T00:00:00+09:00")), []);
});

test("홍보물이 여럿이어도 모든 슬롯이 대표 홍보물을 쓰고 좌우는 같다", () => {
  const slots = assignSlots([campaign("a", "", ""), campaign("b", "", "")]);
  for (const slot of ["bottom", "left", "right"] as const) assert.equal(slots[slot]?.campaignId, "a");
  assert.equal(slots.left?.placement, slots.right?.placement);
  assert.equal(slots.bottom?.placement.alt, "a bottom");
});

test("홍보물이 없으면 모든 슬롯이 빈다", () => {
  assert.deepEqual(assignSlots([]), { bottom: null, left: null, right: null });
});

test("대표에 해당 슬롯 이미지가 없으면 다음 홍보물로 채우고 좌우는 여전히 같다", () => {
  const slots = assignSlots([campaign("a", "", "", ["side"]), campaign("b", "", "", ["bottom", "side"])]);
  assert.equal(slots.bottom?.campaignId, "b");
  assert.equal(slots.left?.campaignId, "a");
  assert.equal(slots.right?.campaignId, "a");
});

test("방문 동안 무작위 순서를 유지하고 새 배너에만 순번을 새로 뽑는다", () => {
  const rank = new Map<string, number>();
  const draws = [0.9, 0.1];
  const first = rankedCampaigns([campaign("a", "", ""), campaign("b", "", "")], rank, () => draws.shift()!);
  assert.deepEqual(first.map(c => c.id), ["b", "a"]);
  const again = rankedCampaigns([campaign("a", "", ""), campaign("b", "", ""), campaign("c", "", "")], rank, () => 0.5);
  assert.deepEqual(again.map(c => c.id), ["b", "c", "a"], "다시 받아도 a·b 의 앞뒤는 그대로다");
  assert.deepEqual(rankedCampaigns([campaign("a", "", "")], rank).map(c => c.id), ["a"], "꺼진 배너는 빠지고 남은 것으로 고른다");
});

test("다음 다시 계산 시각은 지금 뒤의 가장 이른 시작·종료 시각이다", () => {
  const list = [campaign("a", "2026-11-01T00:00:00+09:00", "2026-11-07T19:00:00+09:00"), campaign("b", "2026-11-03T00:00:00+09:00", "2026-11-13T22:00:00+09:00")];
  assert.equal(nextBoundary(list, at("2026-11-02T00:00:00+09:00")), at("2026-11-03T00:00:00+09:00"));
  assert.equal(nextBoundary(list, at("2026-11-04T00:00:00+09:00")), at("2026-11-07T19:00:00+09:00"));
  assert.equal(nextBoundary(list, at("2026-11-14T00:00:00+09:00")), undefined);
  assert.equal(nextBoundary([campaign("x", "언제", "언제")], 0), undefined);
});
