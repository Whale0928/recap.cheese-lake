import type { ActivityChannels } from "./activity.types";

export interface ChannelSegment {
  key: string;
  name: string;
  chatCount: number;
  share: number;
  channels: ActivityChannels["channels"];
  other: boolean;
}

export function channelSegments(channels: ActivityChannels["channels"], limit: number): ChannelSegment[] {
  const positive = channels.filter(channel => channel.chatCount > 0);
  const total = positive.reduce((sum, channel) => sum + channel.chatCount, 0);
  if (!total) return [];
  const segments: ChannelSegment[] = positive.slice(0, limit).map(channel => ({
    key: channel.channelId, name: channel.channelName || "이름 없는 채널", chatCount: channel.chatCount,
    share: channel.chatCount / total, channels: [channel], other: false
  }));
  const rest = positive.slice(limit);
  if (rest.length) {
    const chatCount = rest.reduce((sum, channel) => sum + channel.chatCount, 0);
    segments.push({ key: "other", name: "기타", chatCount, share: chatCount / total, channels: rest, other: true });
  }
  return segments;
}

export interface ChannelTile { segment: ChannelSegment; x: number; y: number; width: number; height: number }

export function channelTiles(segments: ChannelSegment[], width: number, height: number): ChannelTile[] {
  const tiles: ChannelTile[] = [];
  const split = (items: ChannelSegment[], x: number, y: number, w: number, h: number) => {
    if (!items.length) return;
    if (items.length === 1) { tiles.push({ segment: items[0], x, y, width: w, height: h }); return; }
    const total = items.reduce((sum, item) => sum + item.chatCount, 0);
    let index = 1, first = items[0].chatCount;
    while (index < items.length - 1 && Math.abs(first + items[index].chatCount - total / 2) < Math.abs(first - total / 2)) first += items[index++].chatCount;
    const fraction = first / total;
    // 긴 변을 나눠 작은 채널이 지나치게 가늘어지는 것을 줄인다.
    if (w >= h) {
      split(items.slice(0, index), x, y, w * fraction, h);
      split(items.slice(index), x + w * fraction, y, w * (1 - fraction), h);
    } else {
      split(items.slice(0, index), x, y, w, h * fraction);
      split(items.slice(index), x, y + h * fraction, w, h * (1 - fraction));
    }
  };
  split(segments, 0, 0, width, height);
  return tiles;
}
