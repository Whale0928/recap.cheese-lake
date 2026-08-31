/* 조각이 먹는 값.
 *
 * 이 파일이 사실상 API 응답 스키마다. 조각을 화면에 그리려면 무엇이 필요한지가
 * 여기 적혀 있고, recap.openapi.yaml 의 스키마는 이걸 옮겨 적은 것이 된다.
 *
 * 원칙 둘.
 *   - 채널은 언제나 channelId 가 신원이다. name 은 표시용이고 없을 수 있다
 *     (집계 쪽에는 아이디만 있다. 이름은 live_census 나 치지직에서 붙인다).
 *   - 비율은 0~1 로 넘긴다. 화면에서 퍼센트로 바꾼다.
 */

/** 채널 하나. name 은 못 붙일 수 있다. */
export type ChannelRef = {
  channelId: string;
  name: string | null;
};

export type ChannelCount = ChannelRef & { chats: number };

/* ── 얼마나 ─────────────────────────────────────────────── */

/** A1 얼마나 떠들었나 */
export type TotalChats = {
  chats: number;
  rank: number;
  population: number;
  /** 상위 몇 %인지. 0~1 */
  topRatio: number;
  perDay: number;
  perActiveDay: number;
};

/** A2 돌아다닌 방 */
export type ChannelsVisited = {
  channels: number;
  firstPeriodChannels: number | null;
  lastPeriodChannels: number | null;
};

/** A3 떠든 시간 — 채팅이 있던 1분 버킷의 개수 */
export type TalkedMinutes = {
  minutes: number;
  chats: number;
};

/** A4 들른 방송 — 회차 수와 기간별 추이 */
export type LivesJoined = {
  lives: number;
  trend: number[];
};

/* ── 어디서 ─────────────────────────────────────────────── */

/** B1 결국 여기였다 · B2 덩어리로 보면 — 같은 값을 두 조각이 나눠 쓴다 */
export type ChannelShare = {
  top: ChannelCount[];
  topThreeChats: number;
  /** 상위 셋이 전체에서 차지하는 비율. 0~1 */
  topThreeRatio: number;
  restChannels: number;
  restChats: number;
};

/** B3 처음 간 날 */
export type FirstVisits = {
  from: string;
  to: string;
  visits: Array<ChannelRef & { firstAt: string }>;
};

/** B4 갈아탄 밤 — 하루에 두 방 이상 들른 날 */
export type HoppedDays = {
  days: number;
  activeDays: number;
  /** 하루씩. 그날 들른 방 수 */
  daily: Array<{ date: string; channels: number }>;
};

/** B5 같이 다닌 방 — 함께 오간 채널 쌍 */
export type ChannelPairs = {
  nodes: ChannelRef[];
  edges: Array<{ a: string; b: string; weight: number }>;
};

/** B6 취향이 바뀌었다 — 앞뒤 두 구간의 채널 집합 차 */
export type ChannelShift = {
  earlierLabel: string;
  laterLabel: string;
  appeared: ChannelCount[];
  disappeared: ChannelCount[];
  appearedRest: number;
  disappearedRest: number;
};

/** B7 옮겨간 자리 — 구간별 채널 구성 */
export type ChannelFlow = {
  buckets: string[];
  series: Array<ChannelRef & { values: number[] }>;
  /** 상위 채널에 들지 못한 나머지 */
  rest: number[];
};

/** B8 어디서 수다스러웠나 — 채널별 분당 말수 */
export type ChattinessByChannel = {
  channels: Array<ChannelRef & { chats: number; minutes: number }>;
};

/* ── 언제 ───────────────────────────────────────────────── */

/** C1 한 해의 결 */
export type DailyGrid = {
  from: string;
  to: string;
  /** 날짜별 채팅 수. 빈 날은 0 */
  daily: Array<{ date: string; chats: number }>;
  activeDays: number;
  emptyDays: number;
};

/** C2 리듬 — 요일 x 시간대. KST 고정 */
export type Rhythm = {
  /** 7 x 24. [요일][시각], 월요일 0시부터 */
  grid: number[][];
  peakHour: number;
  /** 그 한 시간이 차지하는 비율. 0~1 */
  peakRatio: number;
};

/** C3 불탔던 날 */
export type LoudestDay = {
  date: string;
  chats: number;
  topChannel: ChannelCount | null;
  firstAt: string;
  lastAt: string;
  /** 평소 하루치의 몇 배인지 */
  timesUsual: number;
};

/** C4 쭉 가다 뚝 */
export type StreakAndGap = {
  from: string;
  to: string;
  longestStreak: { days: number; from: string; to: string } | null;
  longestGap: { days: number; from: string; to: string } | null;
  /** 공백 직후 첫 마디를 남긴 방 */
  returnedTo: ChannelRef | null;
};

/** C5 밤샘 — 자정을 넘겨 이어진 밤 */
export type AllNighters = {
  nights: number;
  /** 자정을 넘긴 날짜들 */
  dates: string[];
  /** 24칸. 시각별 비중 0~1 */
  byHour: number[];
};

/** C6 끝을 본 날 */
export type LongestDay = {
  date: string;
  firstAt: string;
  lastAt: string;
  spanMinutes: number;
  medianSpanMinutes: number;
};

/* ── 어떤 방 ────────────────────────────────────────────── */

/** D1 뭘 보고 있었나 */
export type CategoryTaste = {
  categories: Array<{ category: string; chats: number; ratio: number }>;
};

/** D2 큰 방 작은 방 */
export type RoomSizes = {
  /** 함께 있던 방들의 동접. 로그 구간별 개수 */
  buckets: Array<{ label: string; lives: number }>;
  medianViewers: number;
};

/** D3 북적였던 방 */
export type BusiestRoom = {
  channel: ChannelRef;
  viewers: number;
  observedAt: string;
  /** 그 방송에서 내가 친 채팅 수 */
  myChats: number;
};

/** D4 끝까지 있었나 */
export type StayLength = {
  /** 방송 하나하나. 길이와 내가 말한 구간 */
  lives: Array<{
    liveId: string;
    channel: ChannelRef;
    lengthMinutes: number | null;
    myFirstOffset: number | null;
    myLastOffset: number | null;
  }>;
  /** 길이를 잴 수 있었던 방송의 비율. 0~1 */
  measuredRatio: number;
};

/* ── 구독 ───────────────────────────────────────────────── */

/** E1 구독한 지 */
export type SubscriptionMonths = {
  channels: Array<ChannelRef & { months: number; tier: number }>;
};

/** E2 구독하고 친 말 */
export type SubscribedChats = {
  subscribed: number;
  total: number;
  /** 구독 상태를 확인한 채팅의 비율. 0~1. 나머지는 미관측 */
  knownRatio: number;
};

/* ── 무슨 말 ────────────────────────────────────────────── */

/** F1 자주 쓴 말 */
export type TopTokens = {
  tokens: Array<{ token: string; count: number }>;
};

/** F3 짧게 치는 편 */
export type MessageLength = {
  /** 글자 수 구간별 개수 */
  histogram: Array<{ length: number; count: number }>;
  median: number;
  mean: number;
};

/** F4 PC 냐 폰이냐 */
export type Devices = {
  devices: Array<{ os: string; chats: number; ratio: number }>;
};

/* ── 마무리 ─────────────────────────────────────────────── */

/** G1 한 줄로 줄이면 */
export type ClosingLine = {
  sentences: string[];
  generatedAt: string;
};

/** G2 공유 카드 */
export type ShareCard = {
  headline: string;
  stats: Array<{ label: string; value: string }>;
  imageUrl: string | null;
};
