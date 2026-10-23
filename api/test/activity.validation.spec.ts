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

describe("bundled activities and channel record validation", () => {
  const record = () => ({ channel: { channelId, channelName: "방송", channelImageUrl: null, channelUrl: `https://chzzk.naver.com/${channelId}` }, relationship: { firstActiveDate: "2026-10-01", lastActiveDate: "2026-10-20", chatCount: 10, activeDays: 2, longestConsecutiveActiveDays: 1, mostActiveDay: { date: "2026-10-01", chatCount: 6 }, mostActiveMonth: { month: "2026-10", chatCount: 10 }, share: .5, totalUserChatCount: 20 } });
  it("accepts the exact broadcast scope for a bundled response and rejects other broadcasts", () => {
    const value = { ...response(), trend: { interval: "day", points: [] }, patterns: [] };
    const scoped = { ...value, scope: { ...value.scope, channelIds: [channelId] } };
    expect(activityData("activities", scoped, subject, period, [channelId]).totalChatCount).toBe(10);
    expect(() => activityData("activities", scoped, subject, period, ["c".repeat(32)])).toThrow();
    expect(() => activityData("activities", { ...scoped, trend: { interval: "month", points: [] } }, subject, period, [channelId])).toThrow();
  });
  it("preserves zero records with a nonzero all-channel denominator", () => {
    const value = record();
    const empty = { ...value, relationship: { firstActiveDate: null, lastActiveDate: null, chatCount: 0, activeDays: 0, longestConsecutiveActiveDays: 0, mostActiveDay: null, mostActiveMonth: null, share: 0, totalUserChatCount: 20 } };
    expect(activityData("relationship", empty, subject, period, [channelId]).relationship.totalUserChatCount).toBe(20);
    expect(() => activityData("relationship", empty, subject, period, ["c".repeat(32)])).toThrow();
  });
  it("rejects inconsistent ratios, impossible dates and unsafe channel links", () => {
    const value = record();
    for (const changes of [{ share: .9 }, { firstActiveDate: "2026-02-30" }, { chatCount: 30 }, { longestConsecutiveActiveDays: 3 }]) {
      expect(() => activityData("relationship", { ...value, relationship: { ...value.relationship, ...changes } }, subject, period, [channelId])).toThrow();
    }
    expect(() => activityData("relationship", { ...value, channel: { ...value.channel, channelUrl: "javascript:alert(1)" } }, subject, period, [channelId])).toThrow();
  });
});
