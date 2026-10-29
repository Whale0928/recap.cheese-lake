import type { ViewerMeme, ViewerTrait, ViewerTraits } from "./traits.types.js";

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const ratio = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const key = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(v);
function invalid(): never { throw new Error("Invalid traits response"); }
function list(v: unknown, max: number): unknown[] { return Array.isArray(v) && v.length <= max ? v : invalid(); }

function trait(v: unknown): ViewerTrait {
  if (!object(v) || !key(v.key) || !(v.axis === null || key(v.axis)) || !ratio(v.prevalence) || typeof v.score !== "number" || !Number.isFinite(v.score) || v.score < 0 || !object(v.evidence)) return invalid();
  const entries = Object.entries(v.evidence);
  if (entries.length > 20) return invalid();
  const evidence: Record<string, number> = {};
  for (const [name, value] of entries) {
    if (!/^[A-Za-z0-9]{1,40}$/.test(name) || typeof value !== "number" || !Number.isFinite(value)) return invalid();
    evidence[name] = value;
  }
  return { key: v.key, axis: v.axis, prevalence: v.prevalence, score: v.score, evidence };
}

function meme(v: unknown): ViewerMeme {
  if (!object(v) || !key(v.key) || !count(v.count) || v.count < 1 || typeof v.native !== "boolean") return invalid();
  return { key: v.key, count: v.count, native: v.native };
}

// 응답에서 아는 필드만 옮긴다. 조회 주체가 다르면 다른 사람의 판정이므로 거절한다.
export function traitsData(value: unknown, subject: string): ViewerTraits {
  if (!object(value) || !object(value.scope) || !object(value.eligibility)) return invalid();
  const s = value.scope, e = value.eligibility;
  if (s.channelId !== subject || s.timeZone !== "Asia/Seoul" || s.dataScope !== "collected" || typeof s.rulesetVersion !== "string" || !/^[0-9A-Za-z.-]{1,32}$/.test(s.rulesetVersion)) return invalid();
  if (typeof s.asOf !== "string" || !Number.isFinite(Date.parse(s.asOf))) return invalid();
  if (!count(e.chatCount) || typeof e.evaluable !== "boolean" || typeof e.styleSampled !== "boolean" || typeof e.liveMetaAvailable !== "boolean") return invalid();
  const traits = list(value.traits, 64).map(trait), states = list(value.states, 16).map(trait), memes = list(value.memes, 32).map(meme);
  const gaps = list(value.gaps, 32).map(g => typeof g === "string" && /^[a-z0-9_.-]{1,60}$/.test(g) ? g : invalid());
  if (!e.evaluable && (traits.length || states.length)) return invalid();
  return {
    scope: { channelId: subject, asOf: s.asOf, timeZone: "Asia/Seoul", dataScope: "collected", rulesetVersion: s.rulesetVersion },
    eligibility: { chatCount: e.chatCount, evaluable: e.evaluable, styleSampled: e.styleSampled, liveMetaAvailable: e.liveMetaAvailable },
    traits, states, memes, gaps,
  };
}
