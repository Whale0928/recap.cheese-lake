import { useState } from "react";
import type { ActivityChannels } from "./activity.types";
import { relationshipHref, rememberRelationshipChannel } from "./relationship.data";

export function ChannelAvatar({ channel }: { channel: Pick<ActivityChannels["channels"][number], "channelName" | "channelImageUrl"> }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return <span className="activity-channel-avatar" aria-hidden="true">
      {channel.channelImageUrl && failedImage !== channel.channelImageUrl
        ? <img src={channel.channelImageUrl} alt="" loading="lazy" width={36} height={36} referrerPolicy="no-referrer" onError={() => setFailedImage(channel.channelImageUrl)} />
        : <span>{channel.channelName ? Array.from(channel.channelName)[0] : "?"}</span>}
    </span>;
}

export function ChannelLink({ channel }: { channel: ActivityChannels["channels"][number] }) {
  const name = channel.channelName || "이름 없는 채널";
  return <a className="activity-channel" href={relationshipHref(channel.channelId)} onClick={() => rememberRelationshipChannel(channel)}>
    <ChannelAvatar channel={channel} />
    <span className="activity-channel-name">{name}</span>
    {/* 눌러서 채널 기록으로 들어갈 수 있다는 표시. 저장 이미지에서는 뺀다. */}
    <svg className="activity-channel-go" data-image-download-exclude viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
  </a>;
}
