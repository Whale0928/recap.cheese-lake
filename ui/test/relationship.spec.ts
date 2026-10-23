import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { relationshipPreview, rememberRelationshipChannel } from "../src/relationship.data.ts";

const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
let stored: string | null;
beforeEach(() => {
  stored = null;
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: () => stored,
    setItem: (_key: string, value: string) => { stored = value; }
  } });
});
after(() => {
  if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

test("페이지 이동에는 공개 채널 정보만 저장한다", () => {
  const channel = { channelId: "a".repeat(32), channelName: "방송", channelImageUrl: null, channelUrl: "https://chzzk.naver.com/", chatCount: 999, token: "private" };
  rememberRelationshipChannel(channel);
  assert.deepEqual(JSON.parse(stored!), { channelId: channel.channelId, channelName: "방송", channelImageUrl: null });
  assert.equal(relationshipPreview("b".repeat(32)).channel.channelName, null);
});

test("저장소의 임의 이미지 주소나 외부 채널 링크를 신뢰하지 않는다", () => {
  const channelId = "a".repeat(32);
  for (const channelImageUrl of ["javascript:alert(1)", "https://user:password@example.com/image.png"]) {
    stored = JSON.stringify({ channelId, channelName: "방송", channelImageUrl, channelUrl: "https://example.com/" });
    const preview = relationshipPreview(channelId);
    assert.equal(preview.channel.channelImageUrl, null);
    assert.equal(preview.channel.channelUrl, `https://chzzk.naver.com/${channelId}`);
  }
});

test("저장소가 차단되거나 손상되어도 미리보기를 열 수 있다", () => {
  stored = "invalid json";
  assert.equal(relationshipPreview("a".repeat(32)).channel.channelName, null);
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get: () => { throw new Error("Storage denied"); } });
  assert.doesNotThrow(() => rememberRelationshipChannel({ channelId: "a".repeat(32), channelName: "방송", channelImageUrl: null, channelUrl: "https://chzzk.naver.com/" }));
  assert.equal(relationshipPreview("a".repeat(32)).channel.channelImageUrl, null);
});
