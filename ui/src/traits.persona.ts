import { MEME_NAMES, TRAIT_CLASH, TRAIT_LABELS } from "./traits.labels.ts";
import type { ViewerMeme, ViewerTrait, ViewerTraits } from "./traits.types.ts";

const clash = (a: string, b: string) => TRAIT_CLASH.some(([x, y]) => x === a && y === b || x === b && y === a);

// title 은 카드 제목, rate 는 희귀도(이름이 된 라벨의 발동률), modifierKey 는 꾸밈말이 된 라벨이다.
export interface Persona { kind: "combo" | "single" | "record"; title?: string; headline: string; icon?: string; rate?: number; modifierKey?: string }

// 조합 이름(두 번째로 드문 라벨의 꾸밈말 + 가장 드문 라벨의 이름) → 라벨 하나(그 꾸밈말 + 시청자) → 기록 소개 순이다.
// titleKey 는 이용자가 카드 이름으로 올린 라벨이다. 붙은 라벨이 아니면 무시하고 가장 드문 라벨을 쓴다.
export function persona(t: ViewerTraits, titleKey?: string): Persona {
  const known = t.traits.filter(l => TRAIT_LABELS[l.key]?.noun);
  // 고정 타입 이름은 쓰지 않는다. 카드의 말은 2026.10.30 확정한 꾸밈말·이름 38쌍에서만 나온다.
  if (!t.eligibility.evaluable) return { kind: "record", headline: "이번 리캡에서는 하나로 묶을 만큼 기록이 쌓이지 않았어요" };
  const rare = [...known].sort((a, b) => a.prevalence - b.prevalence || b.score - a.score);
  const noun = known.find(l => l.key === titleKey) ?? rare[0];
  if (!noun) return { kind: "record", headline: "이번 리캡에서는 하나로 묶을 만큼 기록이 쌓이지 않았어요" };
  const modifier = rare.find(l => l !== noun && !clash(l.key, noun.key));
  const n = TRAIT_LABELS[noun.key]!.noun!;
  // 라벨 하나로는 「당신은 순간이동입니다」처럼 사람이 아닌 말이 되는 이름이 있어 꾸밈말로 쓴다.
  const card = { title: n, icon: noun.key, rate: noun.prevalence };
  if (!modifier) return { kind: "single", headline: `당신은 ${TRAIT_LABELS[noun.key]!.modifier} 시청자입니다`, ...card };
  return { kind: "combo", headline: `당신은 ${TRAIT_LABELS[modifier.key]!.modifier} ${n}입니다`, ...card, modifierKey: modifier.key };
}

// 카드 이름이 된 라벨, 꾸밈말이 된 라벨, 나머지(랩이 준 순서) 순으로 늘어놓는다.
// 첫째는 제목 아래 설명이 되고 둘째부터 근거 칸이 된다. 화면에 몇 개를 낼지는 카드가 정한다.
export function evidenceOrder(traits: ViewerTrait[], p: Pick<Persona, "icon" | "modifierKey">): ViewerTrait[] {
  const known = traits.filter(l => TRAIT_LABELS[l.key]);
  const lead = [p.icon, p.modifierKey].map(k => known.find(l => l.key === k)).filter((l): l is ViewerTrait => l !== undefined);
  return [...lead, ...known.filter(l => !lead.includes(l))];
}

// 이용자가 바꾼 순서는 라벨 구성이 같을 때만 이어 쓴다. 다시 불러온 판정의 라벨이 달라졌으면 처음 순서로 돌아간다.
export function keepOrder(saved: string[], initial: string[]): string[] {
  return saved.length === initial.length && saved.every(k => initial.includes(k)) ? saved : initial;
}

// 근거 칸 하나를 카드 이름과 맞바꾼다. 원래 이름은 누른 칸 자리로 내려간다.
export function swapLead(order: string[], index: number): string[] {
  if (index <= 0 || index >= order.length) return order;
  const next = [...order];
  [next[0], next[index]] = [next[index]!, next[0]!];
  return next;
}

// 요즘 상태 이름 가운데 「요즘 불붙은」처럼 이미 「요즘」이 든 것이 있어 겹쳐 붙이지 않는다.
export function stateName(key: string): string {
  const name = TRAIT_LABELS[key]?.name ?? key;
  return name.startsWith("요즘") ? name : `요즘 ${name}`;
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

// 라벨별 수치 문장. 2026.11.07 심사(심사 4건 + astra 리뷰 조건부 승인)로 정했다.
// 여러 라벨이 같은 근거 키(bandShare·messageShare 등)를 쓰거나 조건이 둘인 라벨은 FACTS 의 「처음 맞는 키 하나」로는
// 설명과 다른 조건의 수치가 나와서 라벨마다 문장을 둔다. 여기 등록된 라벨은 자기 근거가 하나도 없으면 수치 줄을 숨기고
// FACTS 로 돌아가지 않는다(예: gameShare 가 빠졌다고 토크 비율이 다시 나오면 안 된다).
// 시작·종료는 수집기가 관측한 시각이고, 말투는 최근 회차에서 뽑은 표본, 취향은 카테고리가 확인된 채팅이 분모다.
type Part = { key: string; ratio?: boolean; text: (v: number, e: Record<string, number>) => string | undefined };
const share = (key: string, label: (p: string) => string): Part => ({ key, ratio: true, text: v => label(pct(v)) });
const count = (key: string, label: (n: string) => string): Part => ({ key, text: v => v >= 0 ? label(n(v)) : undefined });
// 총 분을 먼저 반올림한 뒤 시간과 분으로 나눈다. 그래야 「1시간 60분」이 생기지 않는다.
export function minutes(v: number): string {
  const m = Math.round(v);
  return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}`;
}
// 0 은 0%, 0~1% 는 「1% 미만」, 나머지는 소수 한 자리. 반올림하기 전에 1% 미만을 가른다.
export function smallPct(v: number): string {
  return v === 0 ? "0%" : v < 0.01 ? "1% 미만" : `${(Math.round(v * 1000) / 10).toLocaleString("ko-KR")}%`;
}
// 마지막 채팅과 관측된 종료 사이. 관측 종료보다 늦은 채팅이면 음수라 「뒤」로 쓴다. 1분 안쪽도 방향은 지킨다.
// 음수가 왜 생기는지는 추정하지 않는다.
export function exitGap(v: number): string {
  if (v === 0) return "마지막 채팅은 관측된 종료 무렵";
  if (Math.abs(v) < 1) return `마지막 채팅은 관측된 종료 1분 이내 ${v > 0 ? "전" : "뒤"}`;
  return v > 0 ? `마지막 채팅은 관측된 종료 보통 ${minutes(v)} 전` : `마지막 채팅은 관측된 종료 보통 ${minutes(-v)} 뒤`;
}
const isCount = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const sample = (what: string) => (p: string) => `표본 채팅 중 ${what} ${p}`;
const known = (what: string) => (p: string) => `카테고리가 확인된 채팅 중 ${what} ${p}`;
// 첫 채팅까지 걸린 시간은 60분이 넘으면 시간과 분으로 쓴다.
const entryDelay: Part = { key: "medianEntryMinutes", text: v => v >= 0 ? `관측된 방송 시작 후 첫 채팅까지 보통 ${minutes(v)}` : undefined };
const LABEL_FACTS: Record<string, { parts: Part[]; bar?: string }> = {
  late_night: { parts: [share("lateNightShare", p => `자정~새벽 6시 전 채팅 ${p}`)], bar: "lateNightShare" },
  morning: { parts: [share("bandShare", p => `아침 6시~낮 12시 전 채팅 ${p}`)], bar: "bandShare" },
  afternoon: { parts: [share("bandShare", p => `낮 12시~저녁 6시 전 채팅 ${p}`)], bar: "bandShare" },
  evening: { parts: [share("bandShare", p => `저녁 6시~자정 전 채팅 ${p}`)], bar: "bandShare" },
  // 엔트로피는 채팅 비율이 아니라 막대와 섞이면 헷갈린다. 시간대별 비중이 근거로 오기 전까지 수치 없이 둔다.
  hour_even: { parts: [] },
  roaming: { parts: [count("channels10Plus", n => `채팅 10번 이상 한 방송 ${n}곳`)] },
  few_regulars: { parts: [count("channels10Plus", n => `채팅 10번 이상 한 방송 ${n}곳`), share("thirdChannelShare", p => `3위 방송의 채팅 ${p}`)], bar: "thirdChannelShare" },
  first_still_top: { parts: [share("topChannelShare", p => `첫 기록 날의 1위 방송에 전체 채팅의 ${p}`)], bar: "topChannelShare" },
  early_join: { parts: [entryDelay] },
  late_join: { parts: [entryDelay] },
  stays_to_end: { parts: [{ key: "medianExitGapMinutes", text: exitGap }, share("longStayShare", p => `채팅 구간이 방송의 절반 이상인 회차 ${p}`)], bar: "longStayShare" },
  brief_visit: { parts: [count("medianSessionChats", n => `회차당 채팅 보통 ${n}개`), { key: "medianCoverage", ratio: true, text: v => `첫~마지막 채팅 구간은 방송의 ${smallPct(v)}` }] },
  small_room: { parts: [count("medianViewers", n => `채팅한 방송의 시청자 수는 보통 ${n}명`)] },
  big_room: { parts: [count("medianViewers", n => `채팅한 방송의 시청자 수는 보통 ${n}명`)] },
  length_short: { parts: [count("averageLength", n => `표본 채팅 평균 ${n}자`)] },
  length_long: { parts: [count("averageLength", n => `표본 채팅 평균 ${n}자`), share("longShare", p => `50자 이상 쓴 채팅 ${p}`)], bar: "longShare" },
  varied_phrase: { parts: [share("distinctShare", sample("서로 다른 말"))], bar: "distinctShare" },
  repeats_phrase: { parts: [share("repeatShare", p => `표본에서 두 번 이상 나온 말 ${p}`), share("topPhraseShare", p => `가장 자주 쓴 한마디 ${p}`)], bar: "repeatShare" },
  laugh_only: { parts: [share("messageShare", sample("ㅋ·ㅎ로만 쓴 채팅"))], bar: "messageShare" },
  question_ending: { parts: [share("messageShare", sample("물음표로 끝난 채팅"))], bar: "messageShare" },
  exclaim_mark: { parts: [share("messageShare", sample("느낌표가 들어간 채팅"))], bar: "messageShare" },
  emoji_lines: { parts: [share("messageShare", sample("이모티콘만 보낸 채팅"))], bar: "messageShare" },
  char_stretch: { parts: [share("messageShare", p => `표본 채팅 중 같은 글자를 네 번 이상 이어 쓴 채팅 ${p} (ㅋ 제외)`)], bar: "messageShare" },
  multi_sub: { parts: [count("subscriptions", n => `구독 ${n}곳`), share("subscribedChatShare", p => `구독한 방송 채팅 ${p}`)], bar: "subscribedChatShare" },
  one_game: { parts: [share("topCategoryShare", known("가장 많이 채팅한 게임"))], bar: "topCategoryShare" },
  game_centric: { parts: [share("gameShare", known("게임 방송"))], bar: "gameShare" },
  talk_centric: { parts: [share("talkShare", known("토크 방송"))], bar: "talkShare" },
  sports_centric: { parts: [share("sportsShare", known("스포츠 중계"))], bar: "sportsShare" },
  // 방송 수가 빠지면 「그곳」이 가리킬 앞 절이 없어서, 그때는 비율 절만으로 대상을 밝힌다.
  new_finds: { parts: [count("newChannels", n => `최근 30일 처음 기록된 방송 ${n}곳`), { key: "newChannelChatShare", ratio: true, text: (v, e) => isCount(e.newChannels) ? `최근 30일 채팅의 ${pct(v)}가 그곳` : `최근 30일 채팅 중 처음 기록된 방송에서 ${pct(v)}` }], bar: "newChannelChatShare" },
  returned: { parts: [count("longestGapDays", n => `채팅 기록 사이 가장 긴 간격 ${n}일`)] },
  tenure_veteran: { parts: [count("tenureDays", n => `수집된 첫 채팅부터 ${n}일`)] },
  tenure_new: { parts: [count("tenureDays", n => `수집된 첫 채팅부터 ${n}일`)] },
};

// 등록된 라벨의 근거 하나를 읽는다. 값이 없거나 유한하지 않거나, 비율이 0~1 밖이면 그 부분은 뺀다. 0 은 유효한 값이다.
function value(e: Record<string, number>, part: Part): number | undefined {
  const v = e[part.key];
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return part.ratio && (v < 0 || v > 1) ? undefined : v;
}

export function fact(label: ViewerTrait): { text: string; ratio?: number } | undefined {
  const entry = LABEL_FACTS[label.key];
  if (entry) {
    const texts = entry.parts.flatMap(part => {
      const v = value(label.evidence, part);
      const text = v === undefined ? undefined : part.text(v, label.evidence);
      return text ? [text] : [];
    });
    if (!texts.length) return undefined;
    const barPart = entry.parts.find(p => p.key === entry.bar);
    const bar = barPart ? value(label.evidence, barPart) : undefined;
    return { text: texts.join(" · "), ...(bar !== undefined ? { ratio: bar } : {}) };
  }
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
