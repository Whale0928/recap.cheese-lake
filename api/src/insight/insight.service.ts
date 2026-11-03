import { Injectable } from "@nestjs/common";
import { LabConfig } from "../activity/lab.config.js";
import type { ActivityResult } from "../activity/activity.types.js";
import { insightStatus } from "./insight.validation.js";
import type { InsightStatus } from "./insight.types.js";

// 시청자 분석 카드는 Lab 의 대기열이 만든다 (Lab ADR-0030). 리캡은 넣고 · 상태를 보고 · 결과를 받을 뿐이고
// 채팅 원문 · 프롬프트 · 비용은 받지 않는다. 끝난 결과는 Lab 이 잠깐 기억하고, 대기 중은 순서가 바뀌므로
// 여기서는 아무것도 기억하지 않는다. null 은 「한 번도 요청한 적 없음」이다.
// created 는 POST 가 새 요청을 만들었을 때(202)만 true 다. 리캡은 이때만 티켓을 쓴 것으로 친다.
export type InsightResult = ActivityResult<InsightStatus | null> & { created?: boolean };

@Injectable()
export class InsightService {
  constructor(private readonly config: LabConfig) {}

  get(subject: string): Promise<InsightResult> { return this.call(subject, "GET"); }

  // refresh 는 끝난 카드가 있어도 새로 만든다. 대기 · 진행 중이면 Lab 이 그 건을 돌려주고 새로 넣지 않는다.
  request(subject: string, refresh: boolean): Promise<InsightResult> { return this.call(subject, "POST", refresh); }

  private async call(subject: string, method: "GET" | "POST", refresh = false): Promise<InsightResult> {
    if (!/^[0-9a-f]{32}$/.test(subject)) throw new Error("Invalid authenticated subject");
    if (!this.config.apiKey) return { status: "unavailable", reason: "not_configured" };
    try {
      const url = new URL(`/internal/v1/channels/${encodeURIComponent(subject)}/insight`, this.config.baseUrl);
      if (method === "POST" && refresh) url.searchParams.set("refresh", "true");
      const response = await fetch(url, { method, headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (method === "GET" && response.status === 404) return { status: "ready", data: null };
      if (response.status === 429 || response.status === 503) {
        const retry = Number(response.headers.get("Retry-After"));
        return { status: "unavailable", reason: "rate_limited", retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.min(300, Math.ceil(retry)) : 1 };
      }
      if (!response.ok) return { status: "unavailable", reason: "upstream" };
      const data = insightStatus(await response.json(), subject);
      return method === "POST" ? { status: "ready", data, created: response.status === 202 } : { status: "ready", data };
    } catch { return { status: "unavailable", reason: "upstream" }; }
  }
}
