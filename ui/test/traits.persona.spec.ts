import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceOrder, fact, keepOrder, persona, stateName, swapLead } from "../src/traits.persona.ts";
import type { ViewerTrait, ViewerTraits } from "../src/traits.types.ts";

const label = (key: string, prevalence: number, evidence: Record<string, number> = {}): ViewerTrait => ({ key, axis: null, prevalence, score: 0.5, evidence });
const viewer = (traits: ViewerTrait[]): ViewerTraits => ({
  scope: { channelId: "a".repeat(32), asOf: "2026-11-07T02:43:17+09:00", timeZone: "Asia/Seoul", dataScope: "collected", rulesetVersion: "2026.10.29" },
  eligibility: { chatCount: 17350, evaluable: true, styleSampled: true, liveMetaAvailable: true },
  traits, states: [], memes: [], gaps: [],
});

test("evidence cells start with the labels behind the card name and modifier", () => {
  // 랩 응답 순서는 순간이동·첫사랑·구독 멀티탭이고, 제목은 가장 드문 구독 멀티탭, 꾸밈말은 첫사랑이다.
  const traits = [label("same_day_multi", 0.24), label("first_still_top", 0.236), label("multi_sub", 0.082), label("late_night", 0.3)];
  const p = persona(viewer(traits));
  assert.equal(p.icon, "multi_sub");
  assert.equal(p.modifierKey, "first_still_top");
  assert.deepEqual(evidenceOrder(traits, p).map(l => l.key), ["multi_sub", "first_still_top", "same_day_multi", "late_night"]);
});

test("evidence cells keep lab order without a modifier and skip unknown keys", () => {
  const traits = [label("unknown_key", 0.01), label("weekend", 0.2), label("late_night", 0.05)];
  assert.deepEqual(evidenceOrder(traits, { icon: "late_night" }).map(l => l.key), ["late_night", "weekend"]);
});

test("a chosen label becomes the card name and the modifier is picked from the rest", () => {
  const traits = [label("same_day_multi", 0.24), label("first_still_top", 0.236), label("multi_sub", 0.082)];
  const p = persona(viewer(traits), "same_day_multi");
  assert.equal(p.title, "순간이동");
  assert.equal(p.rate, 0.24);
  assert.equal(p.modifierKey, "multi_sub");
  assert.equal(p.headline, "당신은 구독한 방송이 여럿인 순간이동입니다");
  // 붙지 않은 라벨을 고르면 무시하고 가장 드문 라벨을 이름으로 쓴다.
  assert.equal(persona(viewer(traits), "late_night").icon, "multi_sub");
});

test("swapping a cell trades places with the card name", () => {
  assert.deepEqual(swapLead(["a", "b", "c", "d"], 2), ["c", "b", "a", "d"]);
  assert.deepEqual(swapLead(["a", "b"], 0), ["a", "b"]);
  assert.deepEqual(swapLead(["a", "b"], 5), ["a", "b"]);
});

test("a saved order is kept only while the labels stay the same", () => {
  assert.deepEqual(keepOrder(["c", "a", "b"], ["a", "b", "c"]), ["c", "a", "b"]);
  assert.deepEqual(keepOrder(["c", "a"], ["a", "b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(keepOrder([], ["a", "b"]), ["a", "b"]);
});

test("state names do not repeat 요즘", () => {
  assert.equal(stateName("trend_surge"), "요즘 불붙은");
  assert.equal(stateName("trend_decline"), "요즘 뜸해진");
  assert.equal(stateName("trend_steady"), "요즘 꾸준한 페이스");
});

test("multi-subscriber shows both of its conditions", () => {
  const multi = label("multi_sub", 0.082, { subscribedChatShare: 0.8461, subscriptions: 3 });
  assert.deepEqual(fact(multi), { text: "구독 3곳 · 구독한 방송 채팅 85%", ratio: 0.8461 });
  // 다른 라벨은 기존처럼 앞선 근거 하나만 쓴다.
  assert.equal(fact(label("stay_subscribed", 0.101, { subscribedChatShare: 0.9, subscriptions: 1 }))?.text, "구독한 방송 채팅 90%");
});

test("steady pace shows both 30-day chat counts", () => {
  const steady = { ...label("trend_steady", 0.186, { last30dChats: 1472, prev30dChats: 1427, ratio: 1.0315 }), axis: "trend" };
  assert.equal(fact(steady)?.text, "최근 30일 1,472건 · 직전 1,427건");
});
