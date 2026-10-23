import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ActivityChannels } from "./activity.types";
import { number } from "./ActivityView";
import { ChannelAvatar, ChannelLink } from "./ChannelLink";
import { channelSegments, channelTiles, type ChannelSegment } from "./channelDistribution.layout";
import "./channelDistribution.css";

const percent = (value: number) => `${(value * 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
const chartColor = (index: number, other: boolean) => other ? "var(--muted-foreground)" : `color-mix(in oklab, var(--chart-${index % 5 + 1}) ${100 - Math.floor(index / 5) * 18}%, var(--card))`;

function SegmentAvatar({ segment }: { segment: ChannelSegment }) {
  return segment.other ? <span className="activity-channel-avatar channel-other-avatar" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"><rect x="2" y="2" width="6" height="6" rx="1" /><rect x="12" y="2" width="6" height="6" rx="1" /><rect x="2" y="12" width="6" height="6" rx="1" /><rect x="12" y="12" width="6" height="6" rx="1" /></svg></span> : <ChannelAvatar channel={segment.channels[0]} />;
}

function SegmentInfo({ segment, compact = false }: { segment: ChannelSegment; compact?: boolean }) {
  return <div className="channel-segment-info" data-compact={compact}>
    <SegmentAvatar segment={segment} />
    <span className="channel-segment-name">{segment.name}</span>
    <strong>{percent(segment.share)}</strong>
    {!compact && <small>채팅 {number(segment.chatCount)}개<br />{segment.other ? `${number(segment.channels.length)}개 방송` : `활동일 ${number(segment.channels[0].activeDays)}일`}</small>}
  </div>;
}

export function ChannelDistribution({ channels, view, limit }: { channels: ActivityChannels["channels"]; view: "donut" | "treemap"; limit: number }) {
  const segments = useMemo(() => channelSegments(channels, limit), [channels, limit]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [width, setWidth] = useState(640);
  const plot = useRef<HTMLDivElement>(null);
  const detailId = useId();
  const active = segments.find(segment => segment.key === (hovered ?? selected)) ?? segments[0];
  const height = width < 420 ? 320 : 360;
  const tiles = useMemo(() => channelTiles(segments, width, height), [segments, width, height]);
  const activeTile = tiles.find(tile => tile.segment.key === active?.key);
  const smallActiveTile = activeTile && (activeTile.width < 180 || activeTile.height < 200);
  const paint = (index: number) => `color-mix(in oklab, ${chartColor(index, segments[index].other)} 30%, var(--card))`;
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(200, element.getBoundingClientRect().width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const choose = (key: string) => { setSelected(key); setHovered(null); };
  const reset = () => {
    setSelected(null); setHovered(null);
    plot.current?.parentElement?.querySelector<HTMLButtonElement>(".channel-chart-select")?.focus({ preventScroll: true });
  };
  const keyboard = (event: KeyboardEvent<SVGElement>, key: string) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(key); }
  };
  const controls = (segment: ChannelSegment) => ({
    role: "button" as const, tabIndex: 0,
    "aria-label": `${segment.name}${segment.other ? ` ${segment.channels.length}개 방송` : ""}, 채팅 ${number(segment.chatCount)}개, ${percent(segment.share)}`,
    "aria-pressed": (selected ?? segments[0]?.key) === segment.key,
    "aria-controls": detailId,
    onClick: () => choose(segment.key),
    onKeyDown: (event: KeyboardEvent<SVGElement>) => keyboard(event, segment.key),
    onPointerEnter: (event: PointerEvent) => { if (event.pointerType === "mouse") setHovered(segment.key); },
    onFocus: () => setHovered(segment.key)
  });
  let offset = 0;
  return <div className={`channel-distribution channel-distribution-${view}`} onPointerLeave={() => setHovered(null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(null); }} onKeyDown={event => { if (event.key === "Escape") reset(); }}>
    <div className="channel-distribution-plot" id={detailId} ref={plot}>
      {!active ? <p className="activity-notice">활동 기록 없음</p> : view === "donut" ? <div className="channel-donut">
        <svg viewBox="0 0 280 280" role="group" aria-label="방송별 채팅 비율 도넛 차트">
          {segments.map((segment, index) => {
            const start = offset;
            offset += segment.share;
            return <circle key={segment.key} className="channel-donut-segment" data-active={active?.key === segment.key} cx="140" cy="140" r="108" fill="none" stroke={paint(index)} strokeWidth="38" strokeDasharray={`${segment.share * 2 * Math.PI * 108} ${2 * Math.PI * 108}`} strokeDashoffset={-start * 2 * Math.PI * 108} transform="rotate(-90 140 140)" {...controls(segment)} />;
          })}
        </svg>
        <div className="channel-donut-center" aria-live="polite" aria-atomic="true">{active ? <SegmentInfo segment={active} /> : <span>활동 기록 없음</span>}</div>
      </div> : <>
        <svg className="channel-treemap" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="방송별 채팅 비율 트리맵">
          {tiles.map(({ segment, x, y, width: w, height: h }, index) => <g key={segment.key} className="channel-tile" data-active={active?.key === segment.key} {...controls(segment)}>
            <rect x={x} y={y} width={w} height={h} fill={paint(index)} />
            {w > 90 && h > 100 && <foreignObject x={x + 8} y={y + 8} width={Math.max(0, w - 16)} height={Math.max(0, h - 16)} pointerEvents="none" aria-hidden="true">
              <div className="channel-tile-content"><SegmentInfo segment={segment} compact={w < 180 || h < 200} /></div>
            </foreignObject>}
          </g>)}
        </svg>
        {active && smallActiveTile && <div className="channel-chart-preview" aria-live="polite" aria-atomic="true"><SegmentInfo segment={active} /></div>}
      </>}
    </div>
    <div className="channel-chart-sidebar">
      <div className="channel-chart-legend" role="group" aria-label="차트 채널 선택">
        {segments.map((segment, index) => <div key={segment.key} className="channel-chart-key" data-active={active?.key === segment.key} onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(segment.key); }} onFocus={() => setHovered(segment.key)}>
          <svg className="channel-key-surface" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="100" fill={paint(index)} /></svg>
          {segment.other ? <button type="button" className="channel-chart-identity" onClick={() => choose(segment.key)} aria-controls={detailId}><SegmentAvatar segment={segment} /><span>기타 <small>{number(segment.channels.length)}개 방송</small></span></button> : <ChannelLink channel={segment.channels[0]} />}
          <button type="button" className="channel-chart-select" aria-label={`${segment.name} 비율 선택`} aria-pressed={(selected ?? segments[0]?.key) === segment.key} aria-controls={detailId} onClick={() => choose(segment.key)}>{percent(segment.share)}</button>
        </div>)}
      </div>
      {active?.other && <div className="channel-other-popover" role="region" aria-label="기타 방송 상세">
        <div className="channel-other-heading"><div><strong>기타 {number(active.channels.length)}개 방송</strong><span>채팅 {number(active.chatCount)}개 · {percent(active.share)}</span></div><button type="button" aria-label="기타 목록 닫기" onClick={reset}>닫기</button></div>
        <ul className="channel-other-list" aria-label="기타 방송 목록">{active.channels.map(channel => <li key={channel.channelId}><ChannelLink channel={channel} /><span>{number(channel.chatCount)}개</span><strong>{percent(channel.share)}</strong></li>)}</ul>
      </div>}
    </div>
  </div>;
}
