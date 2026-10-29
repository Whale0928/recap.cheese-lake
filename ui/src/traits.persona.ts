import { MEME_NAMES, TRAIT_CLASH, TRAIT_LABELS } from "./traits.labels";
import type { ViewerMeme, ViewerTrait, ViewerTraits } from "./traits.types";

const clash = (a: string, b: string) => TRAIT_CLASH.some(([x, y]) => x === a && y === b || x === b && y === a);

// title 은 카드 제목, rate 는 희귀도(이름이 된 라벨의 발동률), modifierKey 는 꾸밈말이 된 라벨이다.
export interface Persona { kind: "combo" | "single" | "record"; title?: string; headline: string; icon?: string; rate?: number; modifierKey?: string }

// 조합 이름(두 번째로 드문 라벨의 꾸밈말 + 가장 드문 라벨의 이름) → 라벨 하나(그 꾸밈말 + 시청자) → 기록 소개 순이다.
export function persona(t: ViewerTraits): Persona {
  const known = t.traits.filter(l => TRAIT_LABELS[l.key]?.noun);
  // 고정 타입 이름은 쓰지 않는다. 카드의 말은 2026.10.30 확정한 꾸밈말·이름 38쌍에서만 나온다.
  if (!t.eligibility.evaluable) return { kind: "record", headline: "이번 리캡에서는 하나로 묶을 만큼 기록이 쌓이지 않았어요" };
  const rare = [...known].sort((a, b) => a.prevalence - b.prevalence || b.score - a.score);
  const noun = rare[0];
  if (!noun) return { kind: "record", headline: "이번 리캡에서는 하나로 묶을 만큼 기록이 쌓이지 않았어요" };
  const modifier = rare.slice(1).find(l => !clash(l.key, noun.key));
  const n = TRAIT_LABELS[noun.key]!.noun!;
  // 라벨 하나로는 「당신은 순간이동입니다」처럼 사람이 아닌 말이 되는 이름이 있어 꾸밈말로 쓴다.
  const card = { title: n, icon: noun.key, rate: noun.prevalence };
  if (!modifier) return { kind: "single", headline: `당신은 ${TRAIT_LABELS[noun.key]!.modifier} 시청자입니다`, ...card };
  return { kind: "combo", headline: `당신은 ${TRAIT_LABELS[modifier.key]!.modifier} ${n}입니다`, ...card, modifierKey: modifier.key };
}

// 희귀도 별: 드물수록 많다. 2% 이하 5개, 4% 이하 4개, 7% 이하 3개, 12% 이하 2개, 그 밖 1개.
export function stars(rate: number): number {
  return rate <= 0.02 ? 5 : rate <= 0.04 ? 4 : rate <= 0.07 ? 3 : rate <= 0.12 ? 2 : 1;
}
export const percent = (rate: number) => `${(rate * 100).toFixed(rate < 0.1 ? 1 : 0)}%`;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n = (v: number) => Math.round(v).toLocaleString("ko-KR");
// 근거 수치 하나를 사람이 읽는 문장으로 바꾼다. 앞에 있는 키가 먼저다.
const FACTS: [string, (v: number, e: Record<string, number>) => string][] = [
  ["weekendShare", v => `주말 채팅 ${pct(v)}`],
  ["lateNightShare", v => `자정~새벽 5시 채팅 ${pct(v)}`],
  ["bandShare", v => `그 시간대 채팅 ${pct(v)}`],
  ["longestStreak", v => `주 방송 ${n(v)}회 연속 출석`],
  ["rank", (v, e) => `주 방송 ${n(v)}위 / ${n(e.senders ?? 0)}명`],
  ["medianViewers", v => `동접 중앙값 ${n(v)}명`],
  ["medianEntryMinutes", v => `첫 채팅까지 ${n(v)}분`],
  ["multiChannelDayShare", v => `여러 방송에 들른 날 ${pct(v)}`],
  ["topChannelShare", v => `1위 방송 비중 ${pct(v)}`],
  ["channels10Plus", v => `자주 간 방송 ${n(v)}곳`],
  ["averageLength", v => `평균 ${n(v)}자`],
  ["repeatShare", v => `다시 나온 말 ${pct(v)}`],
  ["distinctShare", v => `서로 다른 말 ${pct(v)}`],
  ["messageShare", v => `표본 메시지의 ${pct(v)}`],
  ["maxSubscriptionMonths", v => `${n(v)}개월째 구독`],
  ["subscribedChatShare", v => `구독한 방송 채팅 ${pct(v)}`],
  ["subscriptions", v => `구독 ${n(v)}곳`],
  ["topCategoryShare", v => `한 카테고리 ${pct(v)}`],
  ["talkShare", v => `토크 방송 ${pct(v)}`],
  ["sportsShare", v => `스포츠 중계 ${pct(v)}`],
  ["gameShare", v => `게임 방송 ${pct(v)}`],
  ["categories", v => `카테고리 ${n(v)}가지`],
  ["topChangeShare", v => `달마다 1위가 바뀐 비율 ${pct(v)}`],
  ["medianSessionChats", v => `회차당 채팅 ${n(v)}개`],
  ["longStayShare", v => `절반 넘게 본 회차 ${pct(v)}`],
  ["ratio", (v, e) => `최근 30일 ${n(e.last30dChats ?? 0)}건 · 직전 ${n(e.prev30dChats ?? 0)}건`],
  ["longestGapDays", v => `${n(v)}일 만에 돌아옴`],
  ["newChannels", v => `새로 찾은 방송 ${n(v)}곳`],
  ["tenureDays", v => `첫 채팅부터 ${n(v)}일`],
];
// 근거 문장과, 비율 근거면 막대로 그릴 값(0~1)을 준다.
const RATIO_KEYS = new Set(["weekendShare", "lateNightShare", "bandShare", "multiChannelDayShare", "topChannelShare", "repeatShare", "distinctShare", "messageShare", "subscribedChatShare", "topCategoryShare", "talkShare", "sportsShare", "gameShare", "topChangeShare", "longStayShare"]);
export function fact(label: ViewerTrait): { text: string; ratio?: number } | undefined {
  for (const [key, format] of FACTS) {
    const v = label.evidence[key];
    if (typeof v === "number" && Number.isFinite(v)) return { text: format(v, label.evidence), ...(RATIO_KEYS.has(key) ? { ratio: Math.min(1, Math.max(0, v)) } : {}) };
  }
}

// 5번 이상 쓴 밈 중 가장 많이 쓴 것이 시그니처다. 랩이 준 범위는 최근 채팅이라 「요즘」의 밈이다.
export function signature(memes: ViewerMeme[]): ViewerMeme | undefined {
  return memes.find(m => m.count >= 5 && MEME_NAMES[m.key]);
}
export const memeName = (key: string) => MEME_NAMES[key] ?? key;
