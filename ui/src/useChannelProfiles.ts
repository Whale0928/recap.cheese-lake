import { useEffect, useState } from "react";
import type { ChannelProfile, ProfileRefresh } from "./activity.types";
import { refreshProfiles } from "./profileRefresh";

export function useChannelProfiles<T extends ChannelProfile>(channels: readonly T[], refresh: ProfileRefresh | undefined, url: string): T[] {
  const source = JSON.stringify(channels.map(channel => [channel.channelId, channel.channelName, channel.channelImageUrl]));
  const [patch, setPatch] = useState<{ url: string; source: string; channels: Map<string, ChannelProfile> }>({ url: "", source: "", channels: new Map() });
  const key = refresh?.key;
  const retryAt = refresh?.retryAt;
  useEffect(() => {
    if (!key || retryAt === undefined) return;
    const controller = new AbortController();
    void refreshProfiles(url, { key, retryAt }, controller.signal, profiles => {
      setPatch(previous => {
        const next = new Map(previous.url === url && previous.source === source ? previous.channels : []);
        for (const profile of profiles) next.set(profile.channelId, { ...profile, channelImageUrl: profile.channelImageUrl ?? next.get(profile.channelId)?.channelImageUrl ?? null });
        return { url, source, channels: next };
      });
    });
    return () => controller.abort();
  }, [key, retryAt, url, source]);
  return channels.map(channel => {
    const updated = patch.url === url && patch.source === source ? patch.channels.get(channel.channelId) : undefined;
    return updated ? { ...channel, ...updated, channelImageUrl: updated.channelImageUrl ?? channel.channelImageUrl } : channel;
  });
}
