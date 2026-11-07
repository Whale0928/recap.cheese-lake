import { test } from "node:test";
import assert from "node:assert/strict";
import { exitGap, fact, minutes, smallPct } from "../src/traits.persona.ts";
import type { ViewerTrait } from "../src/traits.types.ts";

// 2026.11.07 수치 심사의 반영 조건(astra 리뷰)을 고정한다. 라벨마다 설명과 같은 조건의 수치가 나와야 한다.
const label = (key: string, evidence: Record<string, number>): ViewerTrait => ({ key, axis: null, prevalence: 0.1, score: 0.5, evidence });
const text = (key: string, evidence: Record<string, number>) => fact(label(key, evidence))?.text;

test("game_centric shows the game share, never the talk share", () => {
  assert.deepEqual(fact(label("game_centric", { gameShare: 0.93, talkShare: 0.03 })), { text: "카테고리가 확인된 채팅 중 게임 방송 93%", ratio: 0.93 });
  // gameShare 가 빠지면 토크 비율로 돌아가지 않고 수치 줄을 숨긴다.
  assert.equal(fact(label("game_centric", { talkShare: 0.03 })), undefined);
});

test("labels sharing one evidence key get their own sentence", () => {
  assert.equal(text("morning", { bandShare: 0.4 }), "아침 6시~낮 12시 전 채팅 40%");
  assert.equal(text("afternoon", { bandShare: 0.6 }), "낮 12시~저녁 6시 전 채팅 60%");
  assert.equal(text("evening", { bandShare: 0.85 }), "저녁 6시~자정 전 채팅 85%");
  assert.equal(text("late_night", { lateNightShare: 0.55 }), "자정~새벽 6시 전 채팅 55%");
  const m = { messageShare: 0.31, sampled: 300 };
  assert.equal(text("laugh_only", m), "표본 채팅 중 ㅋ·ㅎ로만 쓴 채팅 31%");
  assert.equal(text("question_ending", m), "표본 채팅 중 물음표로 끝난 채팅 31%");
  assert.equal(text("exclaim_mark", m), "표본 채팅 중 느낌표가 들어간 채팅 31%");
  assert.equal(text("emoji_lines", m), "표본 채팅 중 이모티콘만 보낸 채팅 31%");
  assert.equal(text("char_stretch", m), "표본 채팅 중 같은 글자를 네 번 이상 이어 쓴 채팅 31% (ㅋ 제외)");
  // 같은 topChannelShare 를 쓰지만 등록하지 않은 one_home 은 예전 문장 그대로다.
  assert.equal(text("one_home", { topChannelShare: 0.97 }), "1위 방송 비중 97%");
  assert.equal(text("first_still_top", { topChannelShare: 0.85, tenureDays: 310 }), "첫 기록 날의 1위 방송에 전체 채팅의 85%");
});

test("two-condition labels show both numbers and keep the right bar", () => {
  assert.deepEqual(fact(label("length_long", { averageLength: 16.9867, longShare: 0.1167 })), { text: "표본 채팅 평균 17자 · 50자 이상 쓴 채팅 12%", ratio: 0.1167 });
  assert.deepEqual(fact(label("repeats_phrase", { repeatShare: 0.3826, topPhraseShare: 0.1 })), { text: "표본에서 두 번 이상 나온 말 38% · 가장 자주 쓴 한마디 10%", ratio: 0.3826 });
  assert.deepEqual(fact(label("few_regulars", { channels10Plus: 3, thirdChannelShare: 0.12 })), { text: "채팅 10번 이상 한 방송 3곳 · 3위 방송의 채팅 12%", ratio: 0.12 });
  assert.deepEqual(fact(label("multi_sub", { subscriptions: 3, subscribedChatShare: 0.8461 })), { text: "구독 3곳 · 구독한 방송 채팅 85%", ratio: 0.8461 });
  assert.equal(text("new_finds", { newChannels: 2, newChannelChatShare: 0.55 }), "최근 30일 처음 기록된 방송 2곳 · 최근 30일 채팅의 55%가 그곳");
});

test("new_finds stays clear when one of its two numbers is missing", () => {
  assert.deepEqual(fact(label("new_finds", { newChannels: 3 })), { text: "최근 30일 처음 기록된 방송 3곳" });
  assert.deepEqual(fact(label("new_finds", { newChannelChatShare: 0.55 })), { text: "최근 30일 채팅 중 처음 기록된 방송에서 55%", ratio: 0.55 });
  // 방송 수가 깨진 값이면 빠진 것과 같게 본다. 0 으로 채우지 않는다.
  assert.equal(text("new_finds", { newChannels: -1, newChannelChatShare: 0.55 }), "최근 30일 채팅 중 처음 기록된 방송에서 55%");
  assert.equal(fact(label("new_finds", {})), undefined);
});

test("zero is a real value, and a missing half drops only that half", () => {
  // longShare 가 0 이어도 평균 길이 조건으로 붙을 수 있다. 0% 와 0 폭 막대를 그대로 낸다.
  assert.deepEqual(fact(label("length_long", { averageLength: 19, longShare: 0 })), { text: "표본 채팅 평균 19자 · 50자 이상 쓴 채팅 0%", ratio: 0 });
  assert.deepEqual(fact(label("length_long", { averageLength: 19 })), { text: "표본 채팅 평균 19자" });
  assert.equal(fact(label("length_long", {})), undefined);
  assert.equal(fact(label("hour_even", { bandEntropy: 1.72 })), undefined);
});

test("broken values are dropped instead of drawn", () => {
  assert.equal(fact(label("game_centric", { gameShare: Number.NaN })), undefined);
  assert.equal(fact(label("game_centric", { gameShare: 1.2 })), undefined);
  assert.equal(fact(label("game_centric", { gameShare: -0.1 })), undefined);
  assert.equal(fact(label("roaming", { channels10Plus: -1 })), undefined);
  assert.equal(fact(label("small_room", { medianViewers: Number.POSITIVE_INFINITY })), undefined);
  // 비율 하나가 범위 밖이면 그 부분과 막대만 빠진다.
  assert.deepEqual(fact(label("few_regulars", { channels10Plus: 4, thirdChannelShare: 1.5 })), { text: "채팅 10번 이상 한 방송 4곳" });
});

test("entry delay is written in hours and minutes without 60분", () => {
  assert.equal(minutes(59.4), "59분");
  assert.equal(minutes(59.5), "1시간");
  assert.equal(minutes(60), "1시간");
  assert.equal(minutes(119.9), "2시간");
  assert.equal(minutes(200), "3시간 20분");
  assert.equal(text("late_join", { medianEntryMinutes: 325, sessions: 5 }), "관측된 방송 시작 후 첫 채팅까지 보통 5시간 25분");
  assert.equal(text("early_join", { medianEntryMinutes: 4, sessions: 5 }), "관측된 방송 시작 후 첫 채팅까지 보통 4분");
});

test("exit gap keeps its sign and never claims staying to the end", () => {
  assert.equal(exitGap(-30), "마지막 채팅은 관측된 종료 보통 30분 뒤");
  assert.equal(exitGap(-1), "마지막 채팅은 관측된 종료 보통 1분 뒤");
  assert.equal(exitGap(-0.5), "마지막 채팅은 관측된 종료 1분 이내 뒤");
  assert.equal(exitGap(0), "마지막 채팅은 관측된 종료 무렵");
  assert.equal(exitGap(0.5), "마지막 채팅은 관측된 종료 1분 이내 전");
  assert.equal(exitGap(1), "마지막 채팅은 관측된 종료 보통 1분 전");
  assert.deepEqual(fact(label("stays_to_end", { medianExitGapMinutes: -0.5333, longStayShare: 0.68 })), { text: "마지막 채팅은 관측된 종료 1분 이내 뒤 · 채팅 구간이 방송의 절반 이상인 회차 68%", ratio: 0.68 });
});

test("coverage below 1% is not rounded up to 1%", () => {
  assert.equal(smallPct(0), "0%");
  assert.equal(smallPct(0.0099), "1% 미만");
  assert.equal(smallPct(0.01), "1%");
  assert.equal(smallPct(0.0481), "4.8%");
  assert.equal(text("brief_visit", { medianSessionChats: 7, medianCoverage: 0.0099 }), "회차당 채팅 보통 7개 · 첫~마지막 채팅 구간은 방송의 1% 미만");
});

test("record-based labels say the record, not the person", () => {
  assert.equal(text("returned", { longestGapDays: 129, last30dChats: 347 }), "채팅 기록 사이 가장 긴 간격 129일");
  assert.equal(text("tenure_new", { tenureDays: 40 }), "수집된 첫 채팅부터 40일");
  assert.equal(text("tenure_veteran", { tenureDays: 400 }), "수집된 첫 채팅부터 400일");
  assert.equal(text("one_game", { topCategoryShare: 0.95 }), "카테고리가 확인된 채팅 중 가장 많이 채팅한 게임 95%");
});
