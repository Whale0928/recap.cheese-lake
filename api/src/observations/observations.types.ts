export interface ObservationChannel {
  channelId: string;
  channelName: string | null;
  channelImageUrl: string | null;
  channelUrl: string;
}
export interface DailyObservations {
  scope: { date: string; from: string; to: string; timeZone: "Asia/Seoul"; dataScope: "collected" };
  generatedAt: string;
  summary: { chatCount: number; participantCount: number; channelCount: number };
  dailyChatLeader: { channel: ObservationChannel; chatCount: number } | null;
  peakChatMinute: { channel: ObservationChannel; from: string; to: string; chatCount: number } | null;
  peakChatHour: { from: string; to: string; chatCount: number } | null;
}
