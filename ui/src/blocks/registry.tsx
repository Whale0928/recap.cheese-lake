/* 조각 명부.
 *
 * 카탈로그(디자인 캔버스)에서 정한 이름·설명·판정을 코드로 옮긴 것이다.
 * verdict 는 2026.08.30 dev ClickHouse 실측 기준이다.
 *   now     지금 데이터로 값도 나오고 이야기도 된다
 *   partial 값은 나오는데 기간이 짧아 반쪽이다
 *   soon    축 자체가 없다. 기간이 쌓이면 풀린다
 */
import type { ReactNode } from "react";
import * as B from "./blocks";
import * as S from "./samples";

export type Verdict = "now" | "partial" | "soon";

export type BlockGroup = {
  id: string;
  name: string;
  source: string;
};

export type BlockMeta = {
  id: string;
  group: string;
  name: string;
  desc: string;
  /** 이 조각을 채우는 lab 내부 API */
  api: string;
  /** 무엇으로 묶는가 */
  groupBy: string;
  /** 어느 표에서 나오는가 */
  source: string;
  verdict: Verdict;
  /** 실측에서 나온 한 줄 */
  evidence: string;
  /** props 타입 이름. types.ts 를 가리킨다 */
  shape: string;
  sample: unknown;
  render: () => ReactNode;
};

export const GROUPS: BlockGroup[] = [
  { id: "A", name: "얼마나", source: "users/{id}/summary" },
  { id: "B", name: "어디서", source: "users/{id}/channels · channel-pairs" },
  { id: "C", name: "언제", source: "users/{id}/daily · hourly" },
  { id: "D", name: "어떤 방", source: "users/{id}/lives" },
  { id: "E", name: "구독", source: "users/{id}/subscriptions" },
  { id: "F", name: "무슨 말", source: "users/{id}/text-stats" },
  { id: "G", name: "마무리", source: "위 결과를 재료로 쓴다" }
];

export const BLOCKS: BlockMeta[] = [
  {
    id: "A1", group: "A", name: "얼마나 떠들었나",
    desc: "한 해 동안 남긴 채팅 수와 순위. 리캡을 여는 첫 숫자다.",
    api: "users/{id}/summary", groupBy: "user_id", source: "chat_trace", verdict: "now",
    evidence: "전량 집계 7~13초. 1건 유저가 16.5%라 순위는 최소 활동 기준이 필요하다.",
    shape: "TotalChats", sample: S.totalChats,
    render: () => <B.TotalChatsBlock data={S.totalChats} />
  },
  {
    id: "A2", group: "A", name: "돌아다닌 방",
    desc: "한 번이라도 말을 건 방이 몇 곳인가.",
    api: "users/{id}/summary", groupBy: "uniq(channel_id)", source: "chat_trace", verdict: "now",
    evidence: "유저 51.3%가 방 하나뿐이고 p90 이 7곳. 분포가 넓어 조각이 산다.",
    shape: "ChannelsVisited", sample: S.channelsVisited,
    render: () => <B.ChannelsVisitedBlock data={S.channelsVisited} />
  },
  {
    id: "A3", group: "A", name: "떠든 시간",
    desc: "말을 하고 있던 시간. 보고 있던 시간이 아니다.",
    api: "users/{id}/summary", groupBy: "count(bucket_at)", source: "chat_trace", verdict: "now",
    evidence: "분당 말수 중앙값 1.17. 같은 분에 여러 방에 친 유저 21,614명은 정의를 정해야 한다.",
    shape: "TalkedMinutes", sample: S.talkedMinutes,
    render: () => <B.TalkedMinutesBlock data={S.talkedMinutes} />
  },
  {
    id: "A4", group: "A", name: "들른 방송",
    desc: "몇 번의 방송에 목소리를 남겼나. 방 개수가 아니라 회차 수다.",
    api: "users/{id}/summary", groupBy: "uniq(live_id)", source: "chat_trace", verdict: "now",
    evidence: "chat_trace.live_id 100% 채움. 방송 5,384회 전부 단일 채널 귀속.",
    shape: "LivesJoined", sample: S.livesJoined,
    render: () => <B.LivesJoinedBlock data={S.livesJoined} />
  },

  {
    id: "B1", group: "B", name: "결국 여기였다",
    desc: "제일 많이 간 방 몇 곳과 그 비중. 넓게 다닌 줄 알았는데 실은 몇 곳뿐이더라는 낙차.",
    api: "users/{id}/channels", groupBy: "channel_id", source: "chat_trace(by_user)", verdict: "now",
    evidence: "두 방 이상 다닌 사람의 1위 지분 중앙값 66%.",
    shape: "ChannelShare", sample: S.channelShare,
    render: () => <B.ChannelShareBlock data={S.channelShare} />
  },
  {
    id: "B2", group: "B", name: "덩어리로 보면",
    desc: "앞 조각과 같은 값을 다르게 보여 준다. 줄 세우지 않고 덩어리 크기로.",
    api: "users/{id}/channels", groupBy: "channel_id", source: "chat_trace(by_user)", verdict: "now",
    evidence: "앞 조각과 같은 집계다. 따로 볼 게 없었다.",
    shape: "ChannelShare", sample: S.channelShare,
    render: () => <B.ChannelBubblesBlock data={S.channelShare} />
  },
  {
    id: "B3", group: "B", name: "처음 간 날",
    desc: "방마다 처음 말을 건 날. 시작점을 한 줄에 늘어놓는다.",
    api: "users/{id}/channels", groupBy: "min(bucket_at) by channel_id", source: "chat_trace", verdict: "partial",
    evidence: "수집이 08-22 시작이라 유저·채널 쌍 12%가 첫날에 몰린다. 왼쪽이 잘렸다.",
    shape: "FirstVisits", sample: S.firstVisits,
    render: () => <B.FirstVisitsBlock data={S.firstVisits} />
  },
  {
    id: "B4", group: "B", name: "갈아탄 밤",
    desc: "하루에 두 방 이상 들른 날. 옮겨 다닌 흔적이 격자에 남는다.",
    api: "users/{id}/daily", groupBy: "(toDate, uniq(channel_id) > 1)", source: "chat_trace", verdict: "now",
    evidence: "0.9초. 유저 36.3%가 하루에 두 방 이상 친 날을 가지고 있다.",
    shape: "HoppedDays", sample: S.hoppedDays,
    render: () => <B.HoppedDaysBlock data={S.hoppedDays} />
  },
  {
    id: "B5", group: "B", name: "같이 다닌 방",
    desc: "이 방 보는 사람이 저 방도 보더라. lab 이 원래 보려던 게 그대로 조각이 됐다.",
    api: "users/{id}/channel-pairs", groupBy: "channel_id 쌍", source: "chat_trace(by_user)", verdict: "now",
    evidence: "by_user 프로젝션 사용 확인. 전 유저 쌍 집계 1.3~2.5초, 유효 쌍 266,598개.",
    shape: "ChannelPairs", sample: S.channelPairs,
    render: () => <B.ChannelPairsBlock data={S.channelPairs} />
  },
  {
    id: "B6", group: "B", name: "취향이 바뀌었다",
    desc: "앞뒤로 갈라 보면 다니는 방이 바뀐다. 새로 간 곳과 발길이 끊긴 곳.",
    api: "users/{id}/channels", groupBy: "(구간, channel_id)", source: "chat_trace", verdict: "soon",
    evidence: "반기가 없다. 주 단위로 내려도 실질 2주뿐이고 첫 주가 주말 이틀이라 왜곡된다.",
    shape: "ChannelShift", sample: S.channelShift,
    render: () => <B.ChannelShiftBlock data={S.channelShift} />
  },
  {
    id: "B7", group: "B", name: "옮겨간 자리",
    desc: "구간이 갈수록 무게중심이 어디로 옮겨 갔나. 층층이 쌓아 흐름으로 본다.",
    api: "users/{id}/channels", groupBy: "(구간, channel_id)", source: "chat_trace", verdict: "soon",
    evidence: "월이 202608 하나뿐이다. 같은 집계를 일 단위로 돌리면 지금도 그려진다.",
    shape: "ChannelFlow", sample: S.channelFlow,
    render: () => <B.ChannelFlowBlock data={S.channelFlow} />
  },
  {
    id: "B8", group: "B", name: "어디서 수다스러웠나",
    desc: "같은 사람이 방마다 말수가 다르다. 분당 몇 마디였는지로 잰다.",
    api: "users/{id}/channels", groupBy: "msg_count / count(bucket_at)", source: "chat_trace", verdict: "now",
    evidence: "6초. 유저·채널 쌍의 54.4%가 활동 5분 미만이다. 최소 체류 기준을 정해야 한다.",
    shape: "ChattinessByChannel", sample: S.chattiness,
    render: () => <B.ChattinessBlock data={S.chattiness} />
  },

  {
    id: "C1", group: "C", name: "한 해의 결",
    desc: "일자별 격자. 채운 칸보다 빈 칸이 말을 한다.",
    api: "users/{id}/daily", groupBy: "toDate(bucket_at)", source: "chat_trace", verdict: "partial",
    evidence: "실질 9일(08-22~30). 371칸 중 362칸이 빈다. 연말이면 130일치가 쌓인다.",
    shape: "DailyGrid", sample: { from: S.dailyGrid.from, to: S.dailyGrid.to, activeDays: S.dailyGrid.activeDays, emptyDays: S.dailyGrid.emptyDays, daily: S.dailyGrid.daily.slice(0, 3) },
    render: () => <B.DailyGridBlock data={S.dailyGrid} />
  },
  {
    id: "C2", group: "C", name: "리듬",
    desc: "무슨 요일 몇 시에 제일 시끄러웠나. 격자는 0시가 아니라 6시에서 시작한다.",
    api: "users/{id}/hourly", groupBy: "(dayOfWeek, hour)", source: "chat_trace", verdict: "partial",
    evidence: "시간대 축은 KST 로 확정돼 믿을 수 있다. 요일 축은 월~금이 한 표본씩뿐이다.",
    shape: "Rhythm", sample: { peakHour: S.rhythm.peakHour, peakRatio: S.rhythm.peakRatio, grid: "7 x 24" },
    render: () => <B.RhythmBlock data={S.rhythm} />
  },
  {
    id: "C3", group: "C", name: "불탔던 날",
    desc: "제일 많이 친 날. 어느 방이었고 몇 시에 시작해 몇 시에 멈췄나.",
    api: "users/{id}/daily", groupBy: "(toDate, channel_id)", source: "chat_trace", verdict: "now",
    evidence: "표본 다섯 명 전원 산출. 최다 발화일과 그날 상위 방, 첫·마지막 버킷이 다 나온다.",
    shape: "LoudestDay", sample: S.loudestDay,
    render: () => <B.LoudestDayBlock data={S.loudestDay} />
  },
  {
    id: "C4", group: "C", name: "쭉 가다 뚝",
    desc: "제일 오래 이어 간 날들과 제일 길게 비운 날들을 한 줄에 놓는다.",
    api: "users/{id}/daily", groupBy: "toDate(bucket_at)", source: "chat_trace", verdict: "partial",
    evidence: "최장 연속의 상한이 9일이다. 23,016명이 만근이라 변별력이 없다.",
    shape: "StreakAndGap", sample: S.streakAndGap,
    render: () => <B.StreakAndGapBlock data={S.streakAndGap} />
  },
  {
    id: "C5", group: "C", name: "밤샘",
    desc: "자정을 넘겨 이어진 밤. 23시에도 1시에도 켜져 있던 날.",
    api: "users/{id}/daily", groupBy: "자정 교차 버킷", source: "chat_trace", verdict: "now",
    evidence: "23시에서 익일 1시까지 이어 친 유저 50,852명, 93,639 유저·일 실측.",
    shape: "AllNighters", sample: { nights: S.allNighters.nights, dates: S.allNighters.dates.slice(0, 2), byHour: "24칸" },
    render: () => <B.AllNightersBlock data={S.allNighters} />
  },
  {
    id: "C6", group: "C", name: "끝을 본 날",
    desc: "첫 채팅과 마지막 채팅 사이가 가장 멀었던 날. 방송 길이가 아니라 내 하루다.",
    api: "users/{id}/daily", groupBy: "max(bucket) − min(bucket)", source: "chat_trace", verdict: "now",
    evidence: "유저·일 116만 건에서 중앙값 94분, p90 1,298분. 24시간 봇은 걸러야 한다.",
    shape: "LongestDay", sample: S.longestDay,
    render: () => <B.LongestDayBlock data={S.longestDay} />
  },

  {
    id: "D1", group: "D", name: "뭘 보고 있었나",
    desc: "말을 건 방송이 무슨 카테고리였나. 게임인지 토크인지가 여기서 갈린다.",
    api: "users/{id}/lives", groupBy: "category", source: "live_census", verdict: "partial",
    evidence: "채널+10분 슬롯 조인으로 99.43% 매칭. 발목을 잡는 건 census 엿새다.",
    shape: "CategoryTaste", sample: S.categoryTaste,
    render: () => <B.CategoryTasteBlock data={S.categoryTaste} />
  },
  {
    id: "D2", group: "D", name: "큰 방 작은 방",
    desc: "있던 방들이 몇 명짜리였나. 큰 방을 찾아다녔는지 작은 방에 머물렀는지.",
    api: "users/{id}/lives", groupBy: "viewers", source: "live_census", verdict: "partial",
    evidence: "표본 다섯 명의 중앙 동접 114~4,985 실산출. 걸리는 건 census 엿새뿐이다.",
    shape: "RoomSizes", sample: S.roomSizes,
    render: () => <B.RoomSizesBlock data={S.roomSizes} />
  },
  {
    id: "D3", group: "D", name: "북적였던 방",
    desc: "가장 사람이 많던 순간, 그리고 그때 당신도 거기 있었다는 것.",
    api: "users/{id}/lives", groupBy: "max(viewers)", source: "live_census", verdict: "partial",
    evidence: "LCK 208,845 동접 실측, 그 방송에 발화한 유저 13,867명 확인. 엿새 창 안에서만 참이다.",
    shape: "BusiestRoom", sample: S.busiestRoom,
    render: () => <B.BusiestRoomBlock data={S.busiestRoom} />
  },
  {
    id: "D4", group: "D", name: "끝까지 있었나",
    desc: "방송이 몇 분짜리였고 그중 몇 분에 말했나. 본 시간은 여전히 알 수 없다.",
    api: "users/{id}/lives", groupBy: "live_id 별 관측 구간", source: "live_census + chat_trace", verdict: "partial",
    evidence: "채팅이 있던 방송의 58%만 길이를 잴 수 있다. 겹침 자체는 실재한다(상관 0.612).",
    shape: "StayLength", sample: S.stayLength,
    render: () => <B.StayLengthBlock data={S.stayLength} />
  },

  {
    id: "E1", group: "E", name: "구독한 지",
    desc: "어느 방을 몇 달째 구독하고 있었나. 말한 그 순간에만 남는 값이다.",
    api: "users/{id}/subscriptions", groupBy: "(channel_id, max(sub_months))",
    source: "chat_subscription_state", verdict: "partial",
    evidence: "값은 정확하고 표본 다섯 명 모두 나온다. 실효 관측이 08-26~30 닷새뿐인 것만 걸린다.",
    shape: "SubscriptionMonths", sample: S.subscriptionMonths,
    render: () => <B.SubscriptionMonthsBlock data={S.subscriptionMonths} />
  },
  {
    id: "E2", group: "E", name: "구독하고 친 말",
    desc: "구독 중일 때 친 채팅의 비율. 언제부터 안쪽 사람이 됐는지.",
    api: "users/{id}/subscriptions", groupBy: "sub_tier > 0",
    source: "chat_subscription_state", verdict: "partial",
    evidence: "두 원천 값이 같다. 하루 237,761쌍 중 한 쌍만 불일치. 같은 닷새 제약을 받는다.",
    shape: "SubscribedChats", sample: S.subscribedChats,
    render: () => <B.SubscribedChatsBlock data={S.subscribedChats} />
  },

  {
    id: "F1", group: "F", name: "자주 쓴 말",
    desc: "제일 많이 친 말 몇 개. 워드클라우드 대신 순위 막대로 짧고 정확하게.",
    api: "users/{id}/text-stats", groupBy: "토큰 빈도", source: "chat_messages", verdict: "now",
    evidence: "공백 분리에 반복 문자 정규화를 얹으니 상위 토큰이 나온다. 필러 쏠림만 선별하면 된다.",
    shape: "TopTokens", sample: S.topTokens,
    render: () => <B.TopTokensBlock data={S.topTokens} />
  },
  {
    id: "F3", group: "F", name: "짧게 치는 편",
    desc: "한 마디가 몇 글자였나. 툭툭 던지는 편인지 길게 쓰는 편인지.",
    api: "users/{id}/text-stats", groupBy: "length(body)", source: "chat_messages", verdict: "now",
    evidence: "플레이스홀더 제거가 필수다. 이모티콘 메시지의 94.8%가 이모티콘만 있는 메시지다.",
    shape: "MessageLength", sample: { median: S.messageLength.median, mean: S.messageLength.mean, histogram: S.messageLength.histogram.slice(0, 3) },
    render: () => <B.MessageLengthBlock data={S.messageLength} />
  },
  {
    id: "F4", group: "F", name: "PC 냐 폰이냐",
    desc: "자리에 앉아 친 말과 걸으며 친 말.",
    api: "users/{id}/text-stats", groupBy: "os_type", source: "chat_messages", verdict: "now",
    evidence: "PC 68.98 · AOS 22.52 · IOS 7.97 · 빈 값 0.53%. 표본 유저별로도 깨끗하다.",
    shape: "Devices", sample: S.devices,
    render: () => <B.DevicesBlock data={S.devices} />
  },

  {
    id: "G1", group: "G", name: "한 줄로 줄이면",
    desc: "고른 조각의 숫자만 넘겨받아 쓴 마무리 문장. 채널 아이디와 닉네임은 보내지 않는다.",
    api: "(lab 호출 없음)", groupBy: "—", source: "외부 LLM", verdict: "now",
    evidence: "넣을 집계값이 전부 나온다. 구독 조각을 담으면 닷새 제약이 문장에도 전파된다.",
    shape: "ClosingLine", sample: S.closingLine,
    render: () => <B.ClosingLineBlock data={S.closingLine} />
  },
  {
    id: "G2", group: "G", name: "공유 카드",
    desc: "고른 조각을 한 장으로 줄인 이미지. 무엇을 넣고 뺄지는 여기서 정한다.",
    api: "(lab 호출 없음)", groupBy: "—", source: "고른 조각 전부", verdict: "now",
    evidence: "새 원천이 필요 없다. 무엇을 담았느냐에 따라 판정이 그대로 따라온다.",
    shape: "ShareCard", sample: S.shareCard,
    render: () => <B.ShareCardBlock data={S.shareCard} />
  }
];

export const VERDICT_LABEL: Record<Verdict, string> = {
  now: "지금 됨",
  partial: "값은 나오나 반쪽",
  soon: "기간이 쌓이면"
};
