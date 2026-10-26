import { useEffect, useState } from "react";
import "./collectionOverview.css";

type Channel = { channelId: string; channelName: string | null; channelImageUrl: string | null; channelUrl: string };
type Winner = { channel: Channel; chatCount: number };
type Observations = {
  scope: { date: string };
  summary: { chatCount: number; participantCount: number; channelCount: number };
  dailyChatLeader: Winner | null;
  peakChatMinute: (Winner & { from: string; to: string }) | null;
  peakChatHour: { from: string; to: string; chatCount: number } | null;
};
const number = (value: number) => value.toLocaleString("ko-KR");
const time = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

function ChannelWinner({ value, peak = false }: { value: Winner | Observations["peakChatMinute"]; peak?: boolean }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = value?.channel.channelImageUrl;
  const name = value?.channel.channelName || "이름 미확인";
  return <div className="collection-leader">
    <p className="collection-label">{peak ? "순간 최대" : "어제 채팅 최다"}</p>
    {value ? <a href={value.channel.channelUrl} target="_blank" rel="noreferrer" className="collection-channel" title={"from" in value && typeof value.from === "string" ? `${time(value.from)} · 한국 시간` : undefined}>
      <span className="collection-avatar" aria-hidden="true">{image && image !== failedImage ? <img src={image} alt="" width="24" height="24" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} /> : name.slice(0, 1)}</span>
      <span className="collection-channel-name"><strong>{name}</strong><span>{peak && "1분간 "}{number(value.chatCount)}건</span></span>
      <span className="collection-sr-only"> (새 탭에서 열림)</span>
    </a> : <span className="collection-empty">관측 기록 없음</span>}
  </div>;
}

export function CollectionOverview() {
  const [data, setData] = useState<Observations | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch("/api/observations/daily", { credentials: "omit", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Observation unavailable");
        const value = await response.json() as Observations;
        if (!value.scope?.date || !value.summary || !Number.isSafeInteger(value.summary.chatCount)) throw new Error("Invalid observations");
        if (!controller.signal.aborted) setData(value);
      } catch {
        if (!controller.signal.aborted) setData(null);
      } finally {
        if (!controller.signal.aborted) {
          const untilMidnight = 86_400_000 - ((Date.now() + 9 * 3_600_000) % 86_400_000);
          timer = setTimeout(() => { void refresh(); }, Math.min(300_000, untilMidnight + 100));
        }
      }
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  if (!data) return null;
  const total = data.summary.chatCount;
  return <section className="collection-overview" aria-label={`${data.scope.date} 관측 통계`}>
    <div className="collection-volume"><p className="collection-label">관측된 채팅</p><p className="collection-total" aria-label={`${number(total)}건`}><strong>{total >= 10_000 ? (total / 10_000).toFixed(1) : number(total)}{total >= 10_000 && <span>만</span>}</strong><span>건</span></p></div>
    <dl className="collection-counts"><div><dt>채팅 참여자</dt><dd>{number(data.summary.participantCount)}<span>명</span></dd></div><div><dt>관측된 채널</dt><dd>{number(data.summary.channelCount)}<span>개</span></dd></div></dl>
    <ChannelWinner value={data.dailyChatLeader} />
    <ChannelWinner value={data.peakChatMinute} peak />
    <div className="collection-peak"><span className="collection-label">채팅 최다 시간대</span><strong>{data.peakChatHour ? `${time(data.peakChatHour.from)} ~ ${time(data.peakChatHour.to)}` : "관측 기록 없음"}</strong><span className="collection-sr-only">한국 시간</span></div>
  </section>;
}
