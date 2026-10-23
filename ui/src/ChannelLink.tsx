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
  </a>;
}
