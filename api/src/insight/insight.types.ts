// Lab 의 GET/POST /internal/v1/channels/{channelId}/insight 응답 중 리캡이 쓰는 필드다.
// 카드 본문은 Lab 의 응답 스펙을 서버가 검사해 저장한 모양 그대로이고, 리캡은 아는 칸만 옮겨 화면에 그린다.
export type InsightState = "waiting" | "running" | "done" | "failed" | "cancelled";
export type InsightFailure = "refused" | "timeout" | "check_failed" | "error";

export interface InsightRole { name: string; description: string; evidence: string[] }
export interface InsightTopic extends InsightRole { mentions?: number }
export interface InsightQuote { text: string; nickname?: string; why: string }
export interface InsightTone { warmth: string; speech: string; energy: string; address: string; watch: string; note: string }
export interface ViewerInsight {
  headline: string;
  summary: string;
  title?: { name: string; why: string };
  topWords?: string[];
  roles: InsightRole[];
  quotes: InsightQuote[];
  topics: InsightTopic[];
  tone: InsightTone;
  catchphrases: { text: string; note: string }[];
  change: { found: boolean; description: string; evidence: string[] };
  gaps: string[];
}
export interface InsightStatus {
  channelId: string;
  requestId: number;
  state: InsightState;
  enqueuedAt: string;
  finishedAt?: string | null;
  queueAhead?: number;
  queueEtaSec?: number;
  failure?: InsightFailure;
  promptVersion?: string;
  result?: ViewerInsight;
}
