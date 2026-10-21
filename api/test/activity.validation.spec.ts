import { activityData } from "../src/activity/activity.validation.js";

const subject = "a".repeat(32);
const channelId = "b".repeat(32);
const period = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-22T00:00:00.000Z", interval: "day" as const };
const channel = { channelId, channelName: "방송 이름", channelUrl: `https://chzzk.naver.com/${channelId}`, channelImageUrl: "https://nng-phinf.pstatic.net/profile.png", chatCount: 10, activeDays: 2, share: 1 };
const response = (changes: Record<string, unknown> = {}) => ({
  scope: { channelId: subject, channelIds: [], from: period.from, to: period.to, timeZone: "Asia/Seoul", dataScope: "collected" },
  totalChatCount: 10,
  channels: [{ ...channel, ...changes }],
});

describe("activity channel metadata validation", () => {
  it("preserves the channel name, address and image", () => {
    expect(activityData("channels", response(), subject, period).channels[0]).toEqual(channel);
  });

  it("accepts missing profile metadata represented as null", () => {
    expect(activityData("channels", response({ channelName: null, channelImageUrl: null }), subject, period).channels[0]).toEqual({ ...channel, channelName: null, channelImageUrl: null });
  });

  it("normalizes a blank channel name to null", () => {
    expect(activityData("channels", response({ channelName: "  " }), subject, period).channels[0].channelName).toBeNull();
  });

  it.each([
    { channelName: 42 },
    { channelName: undefined },
    { channelUrl: "javascript:alert(1)" },
    { channelUrl: "https://chzzk.naver.com.evil.test/" + channelId },
    { channelUrl: "https://chzzk.naver.com/" + subject },
    { channelImageUrl: "javascript:alert(1)" },
    { channelImageUrl: "https://user:password@example.com/image.png" },
    { channelImageUrl: undefined },
  ])("rejects invalid profile metadata: %j", changes => {
    expect(() => activityData("channels", response(changes), subject, period)).toThrow("Invalid Lab response");
  });
});
