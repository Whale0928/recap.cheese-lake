import { useState } from "react";
import type { ActivityChannels, ActivityResult } from "./activity.types";

function ChannelCard({ channel }: { channel: ActivityChannels["channels"][number] }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const name = channel.channelName || "이름 없는 채널";
  const share = (channel.share * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 });

  return <a className="home-channel-card" href={channel.channelUrl} target="_blank" rel="noopener noreferrer">
    <span className="home-channel-image" aria-hidden="true">
      {channel.channelImageUrl && failedImage !== channel.channelImageUrl
        ? <img src={channel.channelImageUrl} alt="" width={112} height={112} referrerPolicy="no-referrer" onError={() => setFailedImage(channel.channelImageUrl)} />
        : <span>{Array.from(name)[0]}</span>}
    </span>
    <div className="home-channel-identity"><span>나의 본진</span><h2>{name}</h2></div>
    <div className="home-channel-ratio"><span>채팅 비율</span><strong>{share}<span>%</span></strong></div>
  </a>;
}

export function HomeChannelCard({ result }: { result: ActivityResult<ActivityChannels> }) {
  if (result.status !== "ready" || result.data.totalChatCount === 0) return null;
  const channels = result.data.channels.filter(channel => channel.chatCount > 0 && channel.share >= 0.5);
  if (!channels.length) return null;

  return <section className="home-channels" aria-label="나의 본진">
    {channels.map(channel => <ChannelCard key={channel.channelId} channel={channel} />)}
  </section>;
}
