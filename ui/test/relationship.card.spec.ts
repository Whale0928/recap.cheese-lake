import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avatarHref, CARD_HEIGHT, CARD_WIDTH, cardFileName, cardText, cardTheme, drawCard, elapsedDays, shareLabel, wrapChars, type CardCanvas, type CardImage, type CardInput } from "../src/relationship.card.ts";

const root = (...classes: string[]) => ({ classList: { contains: (name: string) => classes.includes(name) } });
const record = { firstActiveDate: "2026-01-01", lastActiveDate: "2026-10-20", chatCount: 1234, activeDays: 56, longestConsecutiveActiveDays: 7, mostActiveDay: { date: "2026-09-15", chatCount: 420 }, mostActiveMonth: { month: "2026-09", chatCount: 2300 }, share: 0.853912, totalUserChatCount: 15000 };
const input = (overrides: Partial<CardInput["relationship"]> = {}, channelName: string | null = "아리사"): CardInput => ({ channelName, today: "2026-10-28", relationship: { ...record, ...overrides } });

// 그리기 호출만 기록하는 가짜 컨텍스트. 글자 폭은 글자 수에 비례한다고 본다.
function fakeCanvas() {
  const texts: string[] = [];
  const images: unknown[] = [];
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const ctx: CardCanvas & { texts: string[]; images: unknown[]; rects: typeof rects } = {
    texts, images, rects, font: "", fillStyle: "", strokeStyle: "", lineWidth: 1, textAlign: "left", textBaseline: "alphabetic", letterSpacing: "0px",
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, arcTo() {}, arc() {}, clip() {}, fill() {}, stroke() {},
    fillRect(x, y, w, h) { rects.push({ x, y, w, h }); },
    fillText(text) { texts.push(text); },
    measureText(text) { return { width: Array.from(text).length * (Number(/(\d+)px/.exec(this.font)?.[1]) || 10) * 0.9 }; },
    drawImage(image) { images.push(image); },
  };
  return ctx;
}
const image = (width: number, height: number): CardImage => ({ source: { width, height } as unknown as CanvasImageSource, width, height });

describe("채널 기록 카드 내려받기", () => {
  it("직접 고른 테마를 우선하고 없으면 시스템 설정을 따른다", () => {
    assert.equal(cardTheme(root("dark"), false), "dark");
    assert.equal(cardTheme(root("light"), true), "light");
    assert.equal(cardTheme(root(), true), "dark");
    assert.equal(cardTheme(root(), false), "light");
  });
  it("프로필 사진은 채널 ID 경로로만 받는다", () => {
    assert.equal(avatarHref("a".repeat(32)), `/api/me/channels/${"a".repeat(32)}/avatar`);
  });
  it("파일 이름에서 금지 문자를 치우고 비어 있으면 기본 이름을 쓴다", () => {
    assert.equal(cardFileName("아리사", "2026-10-27"), "아리사 리캡 2026.10.27.png");
    assert.equal(cardFileName('a/b:c*d?"e<f>g|h\u0000', "2026-10-27"), "a b c d e f g h 리캡 2026.10.27.png");
    assert.equal(cardFileName("   ", "2026-10-27"), "채널 리캡 2026.10.27.png");
    assert.equal(cardFileName(null, "2026-10-27"), "채널 리캡 2026.10.27.png");
    assert.equal(cardFileName("가".repeat(60), "2026-10-27"), `${"가".repeat(40)} 리캡 2026.10.27.png`);
  });
  it("첫 채팅 이후 일수와 비율 표기는 화면과 같다", () => {
    assert.equal(elapsedDays("2026-01-01", "2026-10-27"), 299);
    assert.equal(elapsedDays("2026-10-27", "2026-10-27"), 0);
    assert.equal(elapsedDays("2026-12-01", "2026-10-27"), 0);
    assert.equal(elapsedDays(null, "2026-10-27"), null);
    assert.equal(shareLabel(0.853912), "85.39");
  });
  it("긴 이름은 글자 단위로 두 줄까지 나누고 넘치면 말줄임한다", () => {
    const measure = (text: string) => Array.from(text).length * 10;
    assert.deepEqual(wrapChars("아리사", 100, measure, 2), ["아리사"]);
    assert.deepEqual(wrapChars("가나다라마바사아자차카", 50, measure, 2), ["가나다라마", "바사아자…"]);
    assert.deepEqual(wrapChars("가나다라마바사", 50, measure, 2), ["가나다라마", "바사"]);
    assert.deepEqual(wrapChars("  ", 50, measure, 2), []);
  });
  it("글꼴 미리 받기용 문자열에 카드의 모든 글자가 들어간다", () => {
    const sample = cardText(input());
    for (const piece of ["아리사", "1,234", "85.39%", "15,000", "2026.01.01", "나의 본진", "recap.cheese lake"]) assert.ok(sample.includes(piece), piece);
  });
});

describe("카드 그리기", () => {
  it("화면의 채널 기록 항목을 모두 그리고 사진이 있으면 사진을 넣는다", () => {
    const ctx = fakeCanvas();
    drawCard(ctx, input(), "light", { avatar: image(300, 200), logo: image(64, 64) });
    assert.deepEqual(ctx.rects[0], { x: 0, y: 0, w: CARD_WIDTH, h: CARD_HEIGHT });
    for (const piece of ["나의 채널 기록", "2026", "아리사", "나의 본진", "첫 채팅 이후", "300", "일", "2026.01.01 ~ 2026.10.28", "1,234", "56", "7", "09.15", "2026년 · 채팅 420개", "9월", "2026년 · 채팅 2,300개", "recap.cheese lake", "최근 채팅", "2026.10.20", "전체 채팅", "15,000개", "전체 채팅 중", "85.39%"]) {
      assert.ok(ctx.texts.includes(piece), piece);
    }
    assert.equal(ctx.images.length, 2);
    assert.ok(!ctx.texts.includes("아"), "사진이 있으면 이니셜을 그리지 않는다");
  });
  it("사진이 없으면 이름 첫 글자를 쓰고, 비율과 전체 채팅 수가 없으면 그 줄과 본진 배지를 뺀다", () => {
    const ctx = fakeCanvas();
    drawCard(ctx, input({ share: undefined, totalUserChatCount: undefined }), "dark", { avatar: null, logo: null });
    assert.ok(ctx.texts.includes("아"));
    assert.equal(ctx.images.length, 0);
    for (const piece of ["나의 본진", "전체 채팅", "전체 채팅 중"]) assert.ok(!ctx.texts.includes(piece), piece);
    assert.ok(ctx.texts.includes("최근 채팅"));
  });
  it("기록이 비어 있어도 기록 없음으로 그린다", () => {
    const ctx = fakeCanvas();
    drawCard(ctx, input({ firstActiveDate: null, lastActiveDate: null, mostActiveDay: null, mostActiveMonth: null, share: 0.1, chatCount: 0, activeDays: 0, longestConsecutiveActiveDays: 0 }, null), "light", { avatar: null, logo: null });
    assert.ok(ctx.texts.includes("선택한 채널"));
    assert.ok(ctx.texts.filter(text => text === "기록 없음").length >= 3);
    assert.ok(ctx.texts.includes("기록 없음 ~ 2026.10.28"));
    assert.ok(!ctx.texts.includes("나의 본진"));
  });
});
