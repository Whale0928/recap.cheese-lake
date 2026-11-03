import type { InsightFailure, InsightQuote, InsightRole, InsightState, InsightStatus, InsightTopic, ViewerInsight } from "./insight.types.js";

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
// 카드 문장은 짧지만 인용은 긴 반복 채팅일 수 있다. 한 칸의 상한만 두고 내용은 그대로 옮긴다.
const text = (v: unknown, max = 2_000): v is string => typeof v === "string" && v.length <= max;
const STATES: InsightState[] = ["waiting", "running", "done", "failed", "cancelled"];
const FAILURES: InsightFailure[] = ["refused", "timeout", "check_failed", "error"];
function invalid(): never { throw new Error("Invalid insight response"); }
function list(v: unknown, max: number): unknown[] { return Array.isArray(v) && v.length <= max ? v : invalid(); }
function texts(v: unknown, max: number): string[] { return list(v, max).map(s => text(s) ? s : invalid()); }

function role(v: unknown): InsightRole {
  if (!object(v) || !text(v.name, 100) || !text(v.description)) return invalid();
  return { name: v.name, description: v.description, evidence: texts(v.evidence, 16) };
}
function topic(v: unknown): InsightTopic {
  const base = role(v);
  const mentions = (v as Record<string, unknown>).mentions;
  if (mentions === undefined) return base;
  return count(mentions) ? { ...base, mentions } : invalid();
}
function quote(v: unknown): InsightQuote {
  if (!object(v) || !text(v.text) || !text(v.why)) return invalid();
  if (v.nickname === undefined) return { text: v.text, why: v.why };
  return text(v.nickname, 100) ? { text: v.text, nickname: v.nickname, why: v.why } : invalid();
}

// 카드 본문에서 아는 칸만 옮긴다. 모르는 칸은 버린다 — Lab 이 칸을 늘려도 리캡이 그리지 않는 것은 내보내지 않는다.
export function insightData(value: unknown): ViewerInsight {
  if (!object(value) || !text(value.headline, 300) || !text(value.summary) || !object(value.tone) || !object(value.change)) return invalid();
  const tone = value.tone, change = value.change;
  for (const axis of ["warmth", "speech", "energy", "address", "watch"]) if (!text(tone[axis], 40)) return invalid();
  if (!text(tone.note) || typeof change.found !== "boolean" || !text(change.description)) return invalid();
  const out: ViewerInsight = {
    headline: value.headline, summary: value.summary,
    roles: list(value.roles, 16).map(role),
    quotes: list(value.quotes, 8).map(quote),
    topics: list(value.topics, 16).map(topic),
    tone: { warmth: tone.warmth as string, speech: tone.speech as string, energy: tone.energy as string, address: tone.address as string, watch: tone.watch as string, note: tone.note },
    catchphrases: list(value.catchphrases, 8).map(c => object(c) && text(c.text) && text(c.note) ? { text: c.text, note: c.note } : invalid()),
    change: { found: change.found, description: change.description, evidence: texts(change.evidence, 16) },
    gaps: texts(value.gaps, 16),
  };
  if (value.title !== undefined && value.title !== null) {
    if (!object(value.title) || !text(value.title.name, 100) || !text(value.title.why)) return invalid();
    out.title = { name: value.title.name, why: value.title.why };
  }
  if (value.topWords !== undefined) out.topWords = texts(value.topWords, 32);
  return out;
}

// 상태 응답에서 아는 칸만 옮긴다. 대상이 다르면 다른 사람의 카드이므로 거절한다.
export function insightStatus(value: unknown, subject: string): InsightStatus {
  if (!object(value) || value.channelId !== subject || !count(value.requestId) || !STATES.includes(value.state as InsightState)) return invalid();
  if (typeof value.enqueuedAt !== "string" || !Number.isFinite(Date.parse(value.enqueuedAt))) return invalid();
  const out: InsightStatus = { channelId: subject, requestId: value.requestId, state: value.state as InsightState, enqueuedAt: value.enqueuedAt };
  if (value.finishedAt !== undefined && value.finishedAt !== null) {
    if (typeof value.finishedAt !== "string" || !Number.isFinite(Date.parse(value.finishedAt))) return invalid();
    out.finishedAt = value.finishedAt;
  }
  if (value.queueAhead !== undefined) out.queueAhead = count(value.queueAhead) ? value.queueAhead : invalid();
  if (value.queueEtaSec !== undefined) out.queueEtaSec = count(value.queueEtaSec) ? Math.min(value.queueEtaSec, 86_400) : invalid();
  if (value.failure !== undefined) out.failure = FAILURES.includes(value.failure as InsightFailure) ? value.failure as InsightFailure : invalid();
  if (value.promptVersion !== undefined) out.promptVersion = typeof value.promptVersion === "string" && /^[0-9A-Za-z.-]{1,32}$/.test(value.promptVersion) ? value.promptVersion : invalid();
  if (out.state === "done") out.result = insightData(value.result);
  return out;
}
