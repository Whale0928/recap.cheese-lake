import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardFileName, cardHref, cardTheme } from "../src/relationship.card.ts";

const root = (...classes: string[]) => ({ classList: { contains: (name: string) => classes.includes(name) } });

describe("채널 기록 카드 내려받기", () => {
  it("직접 고른 테마를 우선하고 없으면 시스템 설정을 따른다", () => {
    assert.equal(cardTheme(root("dark"), false), "dark");
    assert.equal(cardTheme(root("light"), true), "light");
    assert.equal(cardTheme(root(), true), "dark");
    assert.equal(cardTheme(root(), false), "light");
  });
  it("카드 주소는 채널 ID 경로와 테마만 담는다", () => {
    assert.equal(cardHref("a".repeat(32), "dark"), `/api/me/channels/${"a".repeat(32)}/card.png?theme=dark`);
  });
  it("파일 이름에서 금지 문자를 치우고 비어 있으면 기본 이름을 쓴다", () => {
    assert.equal(cardFileName("아리사", "2026-10-27"), "아리사 리캡 2026.10.27.png");
    assert.equal(cardFileName('a/b:c*d?"e<f>g|h\u0000', "2026-10-27"), "a b c d e f g h 리캡 2026.10.27.png");
    assert.equal(cardFileName("   ", "2026-10-27"), "채널 리캡 2026.10.27.png");
    assert.equal(cardFileName(null, "2026-10-27"), "채널 리캡 2026.10.27.png");
    assert.equal(cardFileName("가".repeat(60), "2026-10-27"), `${"가".repeat(40)} 리캡 2026.10.27.png`);
  });
});
