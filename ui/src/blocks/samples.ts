/* 갤러리용 표본. 전부 가짜다.
 *
 * 숫자는 서로 아귀가 맞게 맞춰 두었다 — 총 12,480건, 채널 37곳,
 * 상위 세 곳이 6,862건(55%), 나머지 32곳이 4,304건.
 * 조각끼리 어긋나면 화면에서 바로 들통나기 때문이다.
 */
import type {
  AllNighters, BusiestRoom, CategoryTaste, ChannelFlow, ChannelPairs, ChannelShare,
  ChannelShift, ChannelsVisited, ChattinessByChannel, ClosingLine, DailyGrid, Devices,
  FirstVisits, HoppedDays, LivesJoined, LongestDay, LoudestDay, MessageLength, Rhythm,
  RoomSizes, ShareCard, StayLength, StreakAndGap, SubscribedChats, SubscriptionMonths,
  TalkedMinutes, TopTokens, TotalChats
} from "./types";

const CH = {
  dawn: { channelId: "8f3a1c04b7e2569d0a4f2b81cc37e05a", name: "새벽정비소" },
  book: { channelId: "2b7de91f4a0c5837e6d1908b3f45a2c7", name: "고래책방" },
  ramen: { channelId: "c05e48a3719d2f6b8e04c71a5d93b620", name: "라면과기타" },
  radio: { channelId: "4d91f7b208c3e5a6019f2d84bb7c3e15", name: "초저녁라디오" },
  forest: { channelId: "a67c02e8d54b193f7028ae61c9f04d3b", name: "목요일의숲" },
  /** 이름을 못 붙인 채널. 화면이 이 경우를 견디는지 보려고 하나 남겨 둔다. */
  unnamed: { channelId: "6e1b9a70c2d84f35a0b7e9312c4d8f66", name: null }
};

let seed = 20261231;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const DAYS_FROM = new Date("2026-01-01T00:00:00+09:00");
const dateAt = (offset: number) => {
  const d = new Date(DAYS_FROM.getTime() + offset * 86400000);
  return d.toISOString().slice(0, 10);
};

const daily = Array.from({ length: 365 }, (_, index) => {
  const summerGap = index >= 182 && index < 223;
  const weekend = index % 7 >= 5;
  const roll = rand() * (weekend ? 1.4 : 1) * (summerGap ? 0.04 : 1);
  return { date: dateAt(index), chats: roll < 0.22 ? 0 : Math.round(roll * 78) };
});
const activeDays = daily.filter((d) => d.chats > 0).length;

export const totalChats: TotalChats = {
  chats: 12480, rank: 56, population: 11170, topRatio: 0.005, perDay: 34, perActiveDay: 42
};

export const channelsVisited: ChannelsVisited = {
  channels: 37, firstPeriodChannels: 5, lastPeriodChannels: 9
};

export const talkedMinutes: TalkedMinutes = { minutes: 4182, chats: 12480 };

export const livesJoined: LivesJoined = {
  lives: 612,
  trend: [28, 41, 63, 52, 48, 39, 12, 22, 44, 58, 61, 55]
};

export const channelShare: ChannelShare = {
  top: [
    { ...CH.dawn, chats: 3204 },
    { ...CH.book, chats: 2118 },
    { ...CH.ramen, chats: 1540 },
    { ...CH.radio, chats: 884 },
    { ...CH.forest, chats: 430 }
  ],
  topThreeChats: 6862,
  topThreeRatio: 0.55,
  restChannels: 32,
  restChats: 4304
};

export const firstVisits: FirstVisits = {
  from: dateAt(0),
  to: dateAt(364),
  visits: [
    { ...CH.dawn, firstAt: dateAt(2) },
    { ...CH.ramen, firstAt: dateAt(41) },
    { ...CH.book, firstAt: dateAt(63) },
    { ...CH.unnamed, firstAt: dateAt(148) },
    { ...CH.forest, firstAt: dateAt(196) },
    { ...CH.radio, firstAt: dateAt(288) }
  ]
};

export const hoppedDays: HoppedDays = {
  days: 74,
  activeDays,
  daily: daily.map((d) => ({ date: d.date, channels: d.chats === 0 ? 0 : d.chats > 46 ? 3 : d.chats > 22 ? 2 : 1 }))
};

export const channelPairs: ChannelPairs = {
  nodes: [CH.dawn, CH.book, CH.ramen, CH.radio, CH.forest, CH.unnamed],
  edges: [
    { a: CH.dawn.channelId, b: CH.book.channelId, weight: 184 },
    { a: CH.dawn.channelId, b: CH.ramen.channelId, weight: 121 },
    { a: CH.book.channelId, b: CH.radio.channelId, weight: 96 },
    { a: CH.ramen.channelId, b: CH.forest.channelId, weight: 54 },
    { a: CH.book.channelId, b: CH.unnamed.channelId, weight: 38 },
    { a: CH.dawn.channelId, b: CH.radio.channelId, weight: 27 }
  ]
};

export const channelShift: ChannelShift = {
  earlierLabel: "상반기",
  laterLabel: "하반기",
  appeared: [
    { ...CH.radio, chats: 418 },
    { ...CH.forest, chats: 257 },
    { ...CH.unnamed, chats: 96 }
  ],
  disappeared: [
    { ...CH.ramen, chats: 612 },
    { channelId: "9c47a1f30b58e6d2714a0c93fe28b5d1", name: "반지하스튜디오", chats: 344 },
    { channelId: "3fa0c7d918e45b26cd10937af5b2e084", name: "금요일의창", chats: 129 }
  ],
  appearedRest: 8,
  disappearedRest: 5
};

export const channelFlow: ChannelFlow = {
  buckets: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
  series: [
    { ...CH.dawn, values: [420, 380, 612, 340, 300, 260, 90, 120, 180, 210, 160, 132] },
    { ...CH.book, values: [80, 140, 120, 110, 90, 72, 60, 210, 280, 320, 340, 296] },
    { ...CH.ramen, values: [190, 220, 300, 290, 280, 260, 0, 0, 0, 0, 0, 0] },
    { ...CH.radio, values: [0, 0, 0, 0, 0, 0, 60, 110, 140, 180, 210, 184] }
  ],
  rest: [300, 340, 420, 380, 400, 420, 380, 400, 420, 440, 430, 404]
};

export const chattiness: ChattinessByChannel = {
  channels: [
    { ...CH.dawn, chats: 3204, minutes: 1338 },
    { ...CH.book, chats: 2118, minutes: 1412 },
    { ...CH.ramen, chats: 1540, minutes: 604 },
    { ...CH.radio, chats: 884, minutes: 588 },
    { ...CH.forest, chats: 430, minutes: 240 }
  ]
};

export const dailyGrid: DailyGrid = {
  from: dateAt(0),
  to: dateAt(364),
  daily,
  activeDays,
  emptyDays: 365 - activeDays
};

export const rhythm: Rhythm = {
  grid: Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => {
      let distance = Math.abs(hour - 23);
      if (distance > 12) distance = 24 - distance;
      const peak = Math.exp(-Math.pow(distance / 3.2, 2));
      return Math.round(peak * (day >= 5 ? 1.3 : 1) * (0.6 + rand() * 0.7) * 240);
    })
  ),
  peakHour: 23,
  peakRatio: 0.18
};

export const loudestDay: LoudestDay = {
  date: dateAt(72),
  chats: 612,
  topChannel: { ...CH.dawn, chats: 473 },
  firstAt: "22:14",
  lastAt: "03:02",
  timesUsual: 18
};

export const streakAndGap: StreakAndGap = {
  from: dateAt(0),
  to: dateAt(364),
  longestStreak: { days: 23, from: dateAt(7), to: dateAt(29) },
  longestGap: { days: 41, from: dateAt(182), to: dateAt(222) },
  returnedTo: CH.book
};

export const allNighters: AllNighters = {
  nights: 46,
  dates: [dateAt(12), dateAt(31), dateAt(58), dateAt(96), dateAt(140), dateAt(268)],
  byHour: Array.from({ length: 24 }, (_, hour) => {
    let distance = Math.abs(hour - 1);
    if (distance > 12) distance = 24 - distance;
    return Math.max(0, 1 - distance / 6);
  })
};

export const longestDay: LongestDay = {
  date: dateAt(72),
  firstAt: "22:14",
  lastAt: "03:02",
  spanMinutes: 288,
  medianSpanMinutes: 94
};

export const categoryTaste: CategoryTaste = {
  categories: [
    { category: "토크", chats: 5741, ratio: 0.46 },
    { category: "종합 게임", chats: 2621, ratio: 0.21 },
    { category: "공포 게임", chats: 2246, ratio: 0.18 },
    { category: "리듬 게임", chats: 1123, ratio: 0.09 },
    { category: "그 밖에", chats: 749, ratio: 0.06 }
  ]
};

export const roomSizes: RoomSizes = {
  buckets: [
    { label: "~100", lives: 38 },
    { label: "~500", lives: 122 },
    { label: "~2천", lives: 214 },
    { label: "~1만", lives: 168 },
    { label: "1만+", lives: 70 }
  ],
  medianViewers: 1840
};

export const busiestRoom: BusiestRoom = {
  channel: CH.dawn,
  viewers: 38412,
  observedAt: `${dateAt(72)} 23:40`,
  myChats: 473
};

export const stayLength: StayLength = {
  lives: [
    { liveId: "184203941", channel: CH.dawn, lengthMinutes: 288, myFirstOffset: 12, myLastOffset: 276 },
    { liveId: "184208877", channel: CH.book, lengthMinutes: 194, myFirstOffset: 96, myLastOffset: 188 },
    { liveId: "184211203", channel: CH.ramen, lengthMinutes: 142, myFirstOffset: 4, myLastOffset: 61 },
    { liveId: "184219550", channel: CH.radio, lengthMinutes: null, myFirstOffset: null, myLastOffset: null }
  ],
  measuredRatio: 0.58
};

export const subscriptionMonths: SubscriptionMonths = {
  channels: [
    { ...CH.dawn, months: 14, tier: 1 },
    { ...CH.book, months: 8, tier: 1 },
    { ...CH.ramen, months: 3, tier: 2 },
    { ...CH.radio, months: 2, tier: 1 }
  ]
};

export const subscribedChats: SubscribedChats = { subscribed: 7862, total: 12480, knownRatio: 0.61 };

export const topTokens: TopTokens = {
  tokens: [
    { token: "ㅋㅋ", count: 1842 },
    { token: "ㅇㅈ", count: 604 },
    { token: "미쳤다", count: 388 },
    { token: "ㄱㄱ", count: 301 },
    { token: "개웃기네", count: 244 }
  ]
};

export const messageLength: MessageLength = {
  histogram: Array.from({ length: 20 }, (_, index) => ({
    length: index + 1,
    count: Math.round(1800 * Math.exp(-Math.pow((index - 3) / 5, 2)))
  })),
  median: 5,
  mean: 6.2
};

export const devices: Devices = {
  devices: [
    { os: "PC", chats: 8609, ratio: 0.69 },
    { os: "AOS", chats: 2811, ratio: 0.225 },
    { os: "IOS", chats: 994, ratio: 0.08 },
    { os: "알 수 없음", chats: 66, ratio: 0.005 }
  ]
};

export const closingLine: ClosingLine = {
  sentences: [
    "서른일곱 군데를 기웃거렸지만 결국 세 곳의 단골이었고,",
    "여름을 지나며 자리를 옮겨 한 해를 닫았습니다."
  ],
  generatedAt: `${dateAt(364)} 09:12`
};

export const shareCard: ShareCard = {
  headline: "2026년, 12,480번 말했습니다",
  stats: [
    { label: "채팅", value: "12,480" },
    { label: "방", value: "37곳" },
    { label: "정점", value: "23시" }
  ],
  imageUrl: null
};
