export interface ChannelProfile {
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
  followerCount: number;
  verifiedMark: boolean;
}
export interface MeResponse {
  fetchedAt: string;
  identity: { channelId: string; channelName: string };
  chzzk:
    | { status: "ready"; data: ChannelProfile }
    | { status: "unavailable"; message: string };
}
