import type { ActivityResult } from "./activity.types";

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
/** null 은 아직 한 번도 요청하지 않은 것이다 */
export interface InsightResponse { fetchedAt: string; insight: ActivityResult<InsightStatus | null> }
