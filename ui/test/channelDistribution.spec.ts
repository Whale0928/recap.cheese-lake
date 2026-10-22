import assert from "node:assert/strict";
import { test } from "node:test";
import { channelSegments, channelTiles } from "../src/channelDistribution.layout.ts";

const channels = (count: number) => Array.from({ length: count }, (_, index) => ({
  channelId: String(index), channelName: `방송 ${index}`, channelUrl: "https://chzzk.naver.com/",
  channelImageUrl: null, chatCount: count - index, activeDays: 1, share: 0
}));

test("기타로 묶어도 채팅 총합과 채널이 보존된다", () => {
  for (const count of [0, 1, 14, 15, 16, 65, 1000]) {
    const input = channels(count);
    const segments = channelSegments(input, 15);
    assert.equal(segments.length, Math.min(count, 15) + (count > 15 ? 1 : 0));
    assert.equal(segments.reduce((sum, segment) => sum + segment.chatCount, 0), input.reduce((sum, channel) => sum + channel.chatCount, 0));
    assert.deepEqual(segments.flatMap(segment => segment.channels), input);
    if (count) assert.ok(Math.abs(segments.reduce((sum, segment) => sum + segment.share, 0) - 1) < 1e-10);
  }
});

test("0건 채널은 차트와 기타에서 제외한다", () => {
  const input = channels(1).map(channel => ({ ...channel, chatCount: 0 }));
  assert.deepEqual(channelSegments(input, 15), []);
  assert.deepEqual(channelTiles([], 240, 320), []);
});

test("트리맵은 비율에 맞는 면적을 겹침 없이 채운다", () => {
  for (const count of [1, 15, 16, 65]) {
    const segments = channelSegments(channels(count), 15);
    for (const [width, height] of [[240, 320], [800, 360]]) {
      const tiles = channelTiles(segments, width, height);
      assert.equal(tiles.length, segments.length);
      for (const tile of tiles) {
        assert.ok(tile.width > 0 && tile.height > 0);
        assert.ok(tile.x >= 0 && tile.y >= 0 && tile.x + tile.width <= width + 1e-8 && tile.y + tile.height <= height + 1e-8);
        assert.ok(Math.abs(tile.width * tile.height / (width * height) - tile.segment.share) < 1e-10);
      }
      for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i], b = tiles[j];
        assert.ok(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) < 1e-8 || Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) < 1e-8);
      }
    }
  }
});
