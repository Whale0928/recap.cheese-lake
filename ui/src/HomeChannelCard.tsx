import { useState } from "react";
import type { ActivityChannels, ActivityResult } from "./activity.types";
import { relationshipHref, rememberRelationshipChannel } from "./relationship.data";

function ChannelCard({ channel }: { channel: ActivityChannels["channels"][number] }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const name = channel.channelName || "이름 없는 채널";
  const share = (channel.share * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 });

  return <a className="home-channel-card" href={relationshipHref(channel.channelId)} onClick={() => rememberRelationshipChannel(channel)}>
    <span className="home-channel-image" aria-hidden="true">
      {channel.channelImageUrl && failedImage !== channel.channelImageUrl
        ? <img src={channel.channelImageUrl} alt="" width={112} height={112} referrerPolicy="no-referrer" onError={() => setFailedImage(channel.channelImageUrl)} />
        : <span>{Array.from(name)[0]}</span>}
    </span>
    <div className="home-channel-identity"><span>나의 본진</span><h2>{name}</h2>
      <p className="home-channel-go" data-image-download-exclude>이 방송에서의 내 기록 보기<svg className="home-channel-go-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg></p>
    </div>
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
