/* 리캡 조각 스물아홉 개.
 *
 * 조각 하나가 컴포넌트 하나이고, 받는 props 가 곧 API 응답이다(types.ts).
 * 조각은 자기 데이터만 그린다 — 제목과 순서는 바깥에서 준다.
 */
import { Bubbles, Donut, Figure, HeatGrid, Histogram, LabeledBars, Lead, NetGraph, Note,
  RankBars, RhythmGrid, Sparkline, SpanTrack, StreamChart, num, pct } from "./shapes";
import type * as T from "./types";

const chName = (c: { channelId: string; name: string | null }) =>
  c.name ?? `이름 없는 방 ${c.channelId.slice(0, 6)}`;

const dayOfYear = (from: string, date: string) =>
  (Date.parse(date) - Date.parse(from)) / 86400000;

/* ── 얼마나 ─────────────────────────────────────────────── */

export function TotalChatsBlock({ data }: { data: T.TotalChats }) {
  return (
    <Figure value={num(data.chats)}>
      <Note>
        같은 기간 채팅을 남긴 <strong>{num(data.population)}명</strong> 가운데{" "}
        <strong>{num(data.rank)}위</strong>입니다. 상위 {pct(data.topRatio, 1)}.
      </Note>
      <Note>하루 평균 {num(data.perDay)}번. 안 한 날을 빼면 {num(data.perActiveDay)}번.</Note>
    </Figure>
  );
}

export function ChannelsVisitedBlock({ data }: { data: T.ChannelsVisited }) {
  return (
    <Figure value={num(data.channels)} unit="곳">
      {data.firstPeriodChannels !== null && data.lastPeriodChannels !== null ? (
        <Note>
          처음에는 {data.firstPeriodChannels}곳이었고, 끝에는 {data.lastPeriodChannels}곳이었습니다.
        </Note>
      ) : null}
    </Figure>
  );
}

export function TalkedMinutesBlock({ data }: { data: T.TalkedMinutes }) {
  const hours = Math.floor(data.minutes / 60);
  const rest = data.minutes % 60;
  const perMinute = (data.chats / Math.max(1, data.minutes)).toFixed(1);
  return (
    <Figure value={num(data.minutes)} unit="분">
      <Note>
        {num(hours)}시간 {rest}분입니다. {num(data.chats)}번을 그 안에 나눠 쳤으니 1분에{" "}
        <strong>{perMinute}번</strong>꼴이었습니다.
      </Note>
      <Note>본 시간이 아니라 말한 시간입니다.</Note>
    </Figure>
  );
}

export function LivesJoinedBlock({ data }: { data: T.LivesJoined }) {
  return (
    <>
      <Figure value={num(data.lives)} unit="회" />
      <Sparkline values={data.trend} />
      <Note>방 개수가 아니라 방송 회차입니다.</Note>
    </>
  );
}

/* ── 어디서 ─────────────────────────────────────────────── */

export function ChannelShareBlock({ data }: { data: T.ChannelShare }) {
  const max = Math.max(...data.top.map((c) => c.chats), 1);
  return (
    <>
      <RankBars
        items={data.top.map((c) => ({
          key: c.channelId, label: chName(c), value: num(c.chats), ratio: c.chats / max
        }))}
      />
      <Note>
        상위 세 채널이 <strong>{num(data.topThreeChats)}번</strong>. 전체의 {pct(data.topThreeRatio)}입니다.
        나머지 {data.restChannels}곳을 합쳐도 {num(data.restChats)}번입니다.
      </Note>
    </>
  );
}

export function ChannelBubblesBlock({ data }: { data: T.ChannelShare }) {
  return (
    <>
      <Bubbles items={data.top.map((c) => ({ key: c.channelId, label: chName(c), weight: c.chats }))} />
      <Note>줄 세우지 않고 덩어리 크기로 봅니다.</Note>
    </>
  );
}

export function FirstVisitsBlock({ data }: { data: T.FirstVisits }) {
  const span = Math.max(1, dayOfYear(data.from, data.to));
  return (
    <>
      <SpanTrack
        segments={data.visits.map((v) => ({
          key: v.channelId, left: dayOfYear(data.from, v.firstAt) / span, width: 0.012, kind: "mine" as const
        }))}
        axis={["1월", "4월", "7월", "10월", "12월"]}
      />
      <ul className="mini-list">
        {data.visits.slice(0, 4).map((v) => (
          <li key={v.channelId}>
            <span>{chName(v)}</span>
            <span className="mono">{v.firstAt}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function HoppedDaysBlock({ data }: { data: T.HoppedDays }) {
  return (
    <>
      <HeatGrid values={data.daily.map((d) => (d.channels > 1 ? d.channels : 0))} legend={false} />
      <Note>
        <strong>{num(data.days)}일</strong>은 하루에 두 방 이상 들렀습니다. 말한 날이 {num(data.activeDays)}일이니
        {" "}{pct(data.days / Math.max(1, data.activeDays))} 꼴입니다.
      </Note>
    </>
  );
}

export function ChannelPairsBlock({ data }: { data: T.ChannelPairs }) {
  const weights = new Map<string, number>();
  data.edges.forEach((e) => {
    weights.set(e.a, (weights.get(e.a) ?? 0) + e.weight);
    weights.set(e.b, (weights.get(e.b) ?? 0) + e.weight);
  });
  return (
    <NetGraph
      nodes={data.nodes.map((n) => ({ id: n.channelId, label: chName(n), weight: weights.get(n.channelId) ?? 1 }))}
      edges={data.edges}
    />
  );
}

export function ChannelShiftBlock({ data }: { data: T.ChannelShift }) {
  return (
    <div className="delta">
      <div className="delta-new">
        <h3>{data.laterLabel}에 새로 간 곳</h3>
        <ul>
          {data.appeared.map((c) => (
            <li key={c.channelId}>
              <span className="mark">+</span>
              {chName(c)}
              <span className="count">{num(c.chats)}</span>
            </li>
          ))}
        </ul>
        {data.appearedRest > 0 ? <p className="recap-note mini-note">그밖에 {data.appearedRest}곳</p> : null}
      </div>
      <div className="delta-gone">
        <h3>발길이 끊긴 곳</h3>
        <ul>
          {data.disappeared.map((c) => (
            <li key={c.channelId}>
              <span className="mark">−</span>
              {chName(c)}
              <span className="count">{num(c.chats)}</span>
            </li>
          ))}
        </ul>
        {data.disappearedRest > 0 ? <p className="recap-note mini-note">그밖에 {data.disappearedRest}곳</p> : null}
      </div>
    </div>
  );
}

export function ChannelFlowBlock({ data }: { data: T.ChannelFlow }) {
  return (
    <StreamChart
      buckets={data.buckets}
      series={[
        ...data.series.map((s) => ({ key: s.channelId, label: chName(s), values: s.values })),
        { key: "rest", label: "나머지", values: data.rest }
      ]}
    />
  );
}

export function ChattinessBlock({ data }: { data: T.ChattinessByChannel }) {
  const rates = data.channels.map((c) => ({ ...c, rate: c.chats / Math.max(1, c.minutes) }));
  const max = Math.max(...rates.map((r) => r.rate), 1);
  return (
    <>
      <LabeledBars
        variant="row"
        items={rates.map((r) => ({
          key: r.channelId, label: chName(r), value: `분당 ${r.rate.toFixed(1)}`, ratio: r.rate / max
        }))}
      />
      <Note>같은 사람인데 방마다 말수가 다릅니다.</Note>
    </>
  );
}

/* ── 언제 ───────────────────────────────────────────────── */

export function DailyGridBlock({ data }: { data: T.DailyGrid }) {
  return (
    <>
      <HeatGrid values={data.daily.map((d) => d.chats)} />
      <Note>
        {num(data.daily.length)}칸 중 <strong>{num(data.activeDays)}칸</strong>에 흔적이 있습니다.
        비어 있는 날이 {num(data.emptyDays)}일입니다.
      </Note>
    </>
  );
}

export function RhythmBlock({ data }: { data: T.Rhythm }) {
  return (
    <>
      <Lead>
        하루는 <em>{data.peakHour}시</em>에 가장 시끄러웠습니다
      </Lead>
      <Note>전체 채팅의 {pct(data.peakRatio)}가 그 한 시간에 있었습니다.</Note>
      <RhythmGrid grid={data.grid} />
    </>
  );
}

export function LoudestDayBlock({ data }: { data: T.LoudestDay }) {
  return (
    <>
      <Lead>
        <em>{data.date}</em>, 하루에 {num(data.chats)}번
      </Lead>
      {data.topChannel ? (
        <Note>
          「{chName(data.topChannel)}」에서 {num(data.topChannel.chats)}번. {data.firstAt}에 시작해{" "}
          {data.lastAt}에 멈췄습니다.
        </Note>
      ) : null}
      <Note>
        평소 하루치의 <strong>{data.timesUsual}배</strong>입니다.
      </Note>
    </>
  );
}

export function StreakAndGapBlock({ data }: { data: T.StreakAndGap }) {
  const span = Math.max(1, dayOfYear(data.from, data.to));
  const segments = [];
  if (data.longestStreak) {
    segments.push({
      key: "streak",
      left: dayOfYear(data.from, data.longestStreak.from) / span,
      width: data.longestStreak.days / span,
      kind: "streak" as const
    });
  }
  if (data.longestGap) {
    segments.push({
      key: "gap",
      left: dayOfYear(data.from, data.longestGap.from) / span,
      width: data.longestGap.days / span,
      kind: "gap" as const
    });
  }
  return (
    <>
      <SpanTrack segments={segments} axis={["1월", "4월", "7월", "10월", "12월"]} />
      <div className="span-key">
        {data.longestStreak ? (
          <span>
            <i className="key-streak" />
            제일 오래 이어 간 <strong>{data.longestStreak.days}일</strong> · {data.longestStreak.from}~
            {data.longestStreak.to}
          </span>
        ) : null}
        {data.longestGap ? (
          <span>
            <i className="key-gap" />
            제일 길게 비운 <strong>{data.longestGap.days}일</strong> · {data.longestGap.from}~{data.longestGap.to}
          </span>
        ) : null}
      </div>
      {data.returnedTo ? <Note>돌아와서 처음 말을 건 곳은 「{chName(data.returnedTo)}」였습니다.</Note> : null}
    </>
  );
}

export function AllNightersBlock({ data }: { data: T.AllNighters }) {
  return (
    <>
      <Figure value={num(data.nights)} unit="밤" />
      <Histogram items={data.byHour.map((v, hour) => ({ label: `${hour}시`, count: v }))} unit="시각별 비중" />
      <Note>자정을 넘겨 이어진 밤입니다. 23시에도, 1시에도 켜져 있던 날.</Note>
    </>
  );
}

export function LongestDayBlock({ data }: { data: T.LongestDay }) {
  const hours = Math.floor(data.spanMinutes / 60);
  const rest = data.spanMinutes % 60;
  return (
    <>
      <Lead>
        <em>{data.date}</em>, {hours}시간 {rest}분
      </Lead>
      <Note>
        {data.firstAt}에 첫 마디, {data.lastAt}에 마지막 마디였습니다. 보통은 {data.medianSpanMinutes}분입니다.
      </Note>
    </>
  );
}

/* ── 어떤 방 ────────────────────────────────────────────── */

export function CategoryTasteBlock({ data }: { data: T.CategoryTaste }) {
  return (
    <LabeledBars
      items={data.categories.map((c) => ({
        key: c.category, label: c.category, value: pct(c.ratio), ratio: c.ratio
      }))}
    />
  );
}

export function RoomSizesBlock({ data }: { data: T.RoomSizes }) {
  return (
    <>
      <Histogram items={data.buckets.map((b) => ({ label: b.label, count: b.lives }))} unit="동접 구간" />
      <div className="hist-axis">
        {data.buckets.map((b) => (
          <span key={b.label}>{b.label}</span>
        ))}
      </div>
      <Note>
        함께 있던 방은 보통 <strong>{num(data.medianViewers)}명</strong>짜리였습니다.
      </Note>
    </>
  );
}

export function BusiestRoomBlock({ data }: { data: T.BusiestRoom }) {
  return (
    <>
      <Figure value={num(data.viewers)} unit="명" />
      <Note>
        「{chName(data.channel)}」, {data.observedAt}. 그 자리에 당신도 있었고 {num(data.myChats)}번 말했습니다.
      </Note>
    </>
  );
}

export function StayLengthBlock({ data }: { data: T.StayLength }) {
  const measurable = data.lives.filter((l) => l.lengthMinutes !== null);
  return (
    <>
      <ul className="stay-list">
        {data.lives.map((live) => {
          const length = live.lengthMinutes;
          if (length === null || live.myFirstOffset === null || live.myLastOffset === null) {
            return (
              <li key={live.liveId}>
                <span className="stay-name">{chName(live.channel)}</span>
                <span className="stay-unknown">방송 길이를 재지 못했습니다</span>
              </li>
            );
          }
          return (
            <li key={live.liveId}>
              <span className="stay-name">{chName(live.channel)}</span>
              <span className="stay-track">
                <i
                  style={{
                    left: pct(live.myFirstOffset / length, 1),
                    width: pct((live.myLastOffset - live.myFirstOffset) / length, 1)
                  }}
                />
              </span>
              <span className="stay-len">{length}분</span>
            </li>
          );
        })}
      </ul>
      <Note>
        방송 {num(data.lives.length)}회 중 {num(measurable.length)}회만 길이를 알 수 있었습니다
        (전체의 {pct(data.measuredRatio)}). 본 시간은 여전히 알 수 없습니다.
      </Note>
    </>
  );
}

/* ── 구독 ───────────────────────────────────────────────── */

export function SubscriptionMonthsBlock({ data }: { data: T.SubscriptionMonths }) {
  const max = Math.max(...data.channels.map((c) => c.months), 1);
  return (
    <>
      <LabeledBars
        variant="row"
        items={data.channels.map((c) => ({
          key: c.channelId, label: chName(c), value: `${c.months}개월`, ratio: c.months / max
        }))}
      />
      <Note>말한 그 순간에만 남는 값이라, 말하지 않은 달은 셀 수 없습니다.</Note>
    </>
  );
}

export function SubscribedChatsBlock({ data }: { data: T.SubscribedChats }) {
  return (
    <>
      <Donut ratio={data.subscribed / Math.max(1, data.total)} caption="구독하고 친 말" />
      <Note>
        {num(data.total)}번 중 {num(data.subscribed)}번입니다. 구독 상태를 확인한 채팅이{" "}
        {pct(data.knownRatio)}라 나머지는 셈에서 빠졌습니다.
      </Note>
    </>
  );
}

/* ── 무슨 말 ────────────────────────────────────────────── */

export function TopTokensBlock({ data }: { data: T.TopTokens }) {
  const max = Math.max(...data.tokens.map((t) => t.count), 1);
  return (
    <LabeledBars
      items={data.tokens.map((t) => ({ key: t.token, label: t.token, value: num(t.count), ratio: t.count / max }))}
    />
  );
}

export function MessageLengthBlock({ data }: { data: T.MessageLength }) {
  return (
    <>
      <Histogram items={data.histogram.map((h) => ({ label: `${h.length}자`, count: h.count }))} unit="글자 수" />
      <Note>
        한 마디는 보통 <strong>{data.median}자</strong>였습니다. 평균은 {data.mean}자.
      </Note>
    </>
  );
}

export function DevicesBlock({ data }: { data: T.Devices }) {
  return (
    <LabeledBars
      items={data.devices.map((d) => ({ key: d.os, label: d.os, value: pct(d.ratio, 1), ratio: d.ratio }))}
    />
  );
}

/* ── 마무리 ─────────────────────────────────────────────── */

export function ClosingLineBlock({ data }: { data: T.ClosingLine }) {
  return (
    <>
      <Lead>
        {data.sentences.map((line, index) => (
          <span key={line}>
            {line}
            {index < data.sentences.length - 1 ? <br /> : null}
          </span>
        ))}
      </Lead>
      <Note>고른 조각의 숫자만 넘겨 만든 문장입니다. 채널 아이디와 닉네임은 보내지 않았습니다.</Note>
    </>
  );
}

export function ShareCardBlock({ data }: { data: T.ShareCard }) {
  return (
    <div className="share-card">
      <p className="share-headline">{data.headline}</p>
      <dl className="share-stats">
        {data.stats.map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="share-mark">recap.cheese-lake</p>
    </div>
  );
}
