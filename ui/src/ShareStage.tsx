import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { dateInput } from "./ActivityView";
import type { ReceivedShare } from "./relationship.share";
import { ShareAvatar } from "./ShareAvatar";
import { FIELDS, StageMotion } from "./shareStageMotion";
import { daysSince, elapsed, fanPoses, fanStep, invertOrder, shareName, shuffleOrder, skyPoses, tierOf, viewerBadge, type Pose, type ShareItem, type StageMode } from "./sharedViews";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// 별자리·카드 보기를 한 무대에서 그린다. 시청자마다 요소 하나를 두고 보기가 바뀌면 위치만 옮기므로,
// 보기를 바꾸면 별이 카드로, 다시 별로 변한다. 움직임은 브라우저에서만 계산한다(shareStageMotion).
// onSelect 는 고르기만, onOpen 은 누르는 즉시 기록을 여는 동작이다. shuffleTick 이 바뀌면 카드를 섞고, pickTick 이 바뀌면 무작위로 한 명을 고르며.
export function ShareStage({ shares, mode, selectedId, onSelect, onOpen, shuffleTick, pickTick }: {
  shares: ReceivedShare[]; mode: StageMode; selectedId: string; onSelect: (id: string) => void; onOpen: (id: string) => void;
  shuffleTick: number; pickTick: number;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pathRef = useRef<SVGPathElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const now = useMemo(() => Date.now(), [shares]);
  const items = useMemo<ShareItem[]>(() => shares.map(share => ({ id: share.ownerChannelId, consentedAt: share.consentedAt })), [shares]);
  const infos = useMemo(() => shares.map(share => {
    const days = daysSince(share.consentedAt, now);
    return { days, tier: tierOf(days), date: dateInput(share.consentedAt).replaceAll("-", "."), ...elapsed(days) };
  }), [shares, now]);
  const selectedIndex = Math.max(0, shares.findIndex(share => share.ownerChannelId === selectedId));
  const sky = useRef<{ items?: ShareItem[]; now?: number; w?: number; h?: number; poses: Pose[] }>({ poses: [] });
  // 카드 덱: order[i] 는 i 번째 시청자의 덱 위치이고 focus 는 덱 위치 기준이다. stack 은 셔플 연출 단계(0 부채, 1 두 더미, 2 한 더미)다.
  const deck = useRef({ order: items.map((_, i) => i), inverse: items.map((_, i) => i), stack: 0 });
  const focus = useRef(selectedIndex);
  const latest = useRef({ mode, items, now, size, selectedIndex });
  latest.current = { mode, items, now, size, selectedIndex };
  const engine = useMemo(() => new StageMotion(() => {
    const { mode: current, items: list, now: at, size: box } = latest.current;
    if (current === "fan") return fanPoses(list.length, focus.current, box.w, box.h, deck.current.order, deck.current.stack);
    // 별 배치는 겹침을 푸는 계산이 들어가므로 크기·목록이 바뀔 때만 다시 구한다.
    const cache = sky.current;
    if (cache.items !== list || cache.now !== at || cache.w !== box.w || cache.h !== box.h) sky.current = { items: list, now: at, w: box.w, h: box.h, poses: skyPoses(list, at, box.w, box.h) };
    return sky.current.poses;
  }), []);
  const lineOrder = useMemo(() => items.map((_, i) => i).sort((a, b) => Date.parse(items[a].consentedAt) - Date.parse(items[b].consentedAt)), [items]);

  // 목록이 바뀌면 덱을 처음 순서로 되돌린다.
  useMemo(() => { deck.current = { order: items.map((_, i) => i), inverse: items.map((_, i) => i), stack: 0 }; }, [items]);

  useLayoutEffect(() => {
    engine.setNodes(nodeRefs.current.slice(0, shares.length).map(root => ({ root: root!, dot: root!.children[1] as HTMLElement, card: root!.children[2] as HTMLElement })));
    if (latest.current.size.w) engine.retarget(10);
  }, [shares, engine]);

  useEffect(() => {
    const el = stageRef.current!;
    const read = () => setSize(prev => {
      const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight);
      return prev.w === w && prev.h === h ? prev : { w, h };
    });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 크기가 처음 정해지면 시청자가 중심에서 퍼져 나가고, 이후 크기 변화는 제자리에서 따라간다.
  const placed = useRef(false);
  useEffect(() => {
    if (!size.w) return;
    engine.halfW = size.w / 2;
    if (!placed.current) { placed.current = true; engine.retarget(12); } else engine.kick();
  }, [size, engine]);

  useEffect(() => {
    // 카드 보기로 들어올 때는 고른 시청자가 맨 앞에 온다.
    focus.current = deck.current.order[latest.current.selectedIndex] ?? 0;
    if (placed.current) engine.retarget(9);
  }, [mode, engine]);

  useEffect(() => {
    engine.selected = selectedIndex;
    if (mode === "fan") focus.current = deck.current.order[selectedIndex] ?? 0;
    engine.kick();
  }, [selectedIndex, mode, engine]);

  useEffect(() => {
    engine.onFrame = cur => {
      const path = pathRef.current;
      if (!path || latest.current.mode !== "sky") return;
      path.setAttribute("d", lineOrder.map((i, k) => `${k ? "L" : "M"}${cur[i * FIELDS].toFixed(1)} ${cur[i * FIELDS + 1].toFixed(1)}`).join(""));
    };
  }, [engine, lineOrder]);

  // 움직임을 줄이는 설정이면 보기 전환도 즉시 끝낸다. 화면 밖에 있거나 탭이 가려지면 루프를 멈춘다.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => { engine.reduced = query.matches; engine.kick(); };
    apply();
    query.addEventListener("change", apply);
    const observer = new IntersectionObserver(entries => {
      const visible = entries[entries.length - 1].isIntersecting;
      engine.paused = !visible;
      if (visible) engine.kick(); else engine.stop();
    });
    observer.observe(stageRef.current!);
    return () => { query.removeEventListener("change", apply); observer.disconnect(); engine.stop(); };
  }, [engine]);

  // 셔플: 카드가 두 더미로 갈라졌다가 한 더미로 겹친 뒤, 새 순서로 다시 부채꼴로 펼쳐진다. 맨 앞에 온 시청자가 선택된다.
  const timers = useRef<number[]>([]);
  const shuffling = useRef(false);
  const seenShuffle = useRef(shuffleTick);
  useEffect(() => {
    if (seenShuffle.current === shuffleTick) return;
    seenShuffle.current = shuffleTick;
    if (latest.current.mode !== "fan" || shuffling.current || items.length < 2) return;
    shuffling.current = true;
    // 움직임을 줄이는 설정이면 연출 없이 바로 섞는다.
    const wait = (ms: number) => engine.reduced ? 0 : ms;
    const at = (ms: number, run: () => void) => timers.current.push(window.setTimeout(run, wait(ms)));
    deck.current.stack = 1; engine.retarget(3);
    at(320, () => { deck.current.stack = 2; engine.retarget(2); });
    at(640, () => {
      const order = shuffleOrder(items.length);
      deck.current = { order, inverse: invertOrder(order), stack: 0 };
      focus.current = 0;
      engine.retarget(7);
      onSelect(items[deck.current.inverse[0]].id);
    });
    at(1300, () => { shuffling.current = false; });
  }, [shuffleTick, engine, items, onSelect]);
  useEffect(() => () => { for (const id of timers.current) clearTimeout(id); }, []);

  // 무작위 선택: 카드 보기에서는 룰렛처럼 카드가 빠르게 넘어가다 서서히 멈추고, 나머지 보기에서는 바로 한 명이 골라진다.
  // 고른 시청자는 아래 선택 효과를 받으며, 기록은 열지 않고 선택만 한다. 지금 고른 시청자는 다시 고르지 않는다.
  const picking = useRef(0);
  const seenPick = useRef(pickTick);
  const cancelPick = () => { cancelAnimationFrame(picking.current); picking.current = 0; };
  useEffect(() => {
    if (seenPick.current === pickTick) return;
    seenPick.current = pickTick;
    if (items.length < 2 || shuffling.current) return;
    cancelPick();
    let target = Math.floor(Math.random() * items.length);
    if (target === latest.current.selectedIndex) target = (target + 1) % items.length;
    if (latest.current.mode !== "fan" || engine.reduced) { onSelect(items[target].id); return; }
    const to = deck.current.order[target], last = items.length - 1;
    // 멀리 있는 카드는 도착 24장 전에서 출발해 서서히 느려지며 멈춘다.
    const from = Math.abs(to - focus.current) > 24 ? clamp(to + (to > focus.current ? -24 : 24), 0, last) : focus.current;
    const start = performance.now(), duration = 1600;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      focus.current = from + (to - from) * (1 - (1 - k) ** 4);
      engine.kick();
      if (k < 1) picking.current = requestAnimationFrame(step); else { picking.current = 0; onSelect(items[target].id); }
    };
    picking.current = requestAnimationFrame(step);
  }, [pickTick, engine, items, onSelect]);
  useEffect(() => () => cancelAnimationFrame(picking.current), []);

  // 선택이 바뀔 때마다 잠깐 효과를 준다(고리 퍼짐, 아바타 통통 튐). 짧게 켰다 꺼서 다음 선택에서 다시 재생된다.
  const prevSelected = useRef(selectedIndex);
  useEffect(() => {
    if (prevSelected.current === selectedIndex) return;
    prevSelected.current = selectedIndex;
    const el = nodeRefs.current[selectedIndex];
    if (!el) return;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
    const id = window.setTimeout(() => el.classList.remove("pop"), 1000);
    // 다음 선택으로 넘어가면 이전 요소의 효과도 바로 걷어 낸다(타이머가 취소되어도 클래스가 남지 않게).
    return () => { clearTimeout(id); el.classList.remove("pop"); };
  }, [selectedIndex]);

  const focusAfter = useRef(false);
  useEffect(() => {
    if (!focusAfter.current) return;
    focusAfter.current = false;
    nodeRefs.current[selectedIndex]?.focus({ preventScroll: true });
  }, [selectedIndex]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = shares.length - 1;
    // 별자리는 오른쪽이 최근이고, 원판과 카드는 오른쪽·아래가 이전 시청자다. 카드는 덱 순서를 따라 움직인다.
    const arrows: Record<string, number> = mode === "sky" ? { ArrowRight: -1, ArrowUp: -1, ArrowLeft: 1, ArrowDown: 1 } : { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const { order, inverse } = deck.current;
    const step = (to: number) => mode === "fan" ? inverse[clamp(to, 0, last)] : clamp(to, 0, last);
    const here = mode === "fan" ? order[selectedIndex] : selectedIndex;
    const next = event.key === "Home" ? step(0) : event.key === "End" ? step(last) : event.key in arrows ? step(here + arrows[event.key]) : null;
    if (next === null) return;
    event.preventDefault();
    if (next === selectedIndex) return;
    focusAfter.current = true;
    onSelect(items[next].id);
  };

  // 카드 보기에서는 좌우로 끌어 넘긴다. 짧게 누른 것은 끌기가 아니라 선택으로 본다.
  type Drag = { x0: number; y0: number; f0: number; moved: boolean; lastX: number; lastT: number; v: number };
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  // 끌기를 끝내는 이벤트(버튼을 놓음·취소·창 포커스 이탈)가 무대까지 오지 않는 환경이 있어서, 끌기가 시작되면 창에서도 함께 듣는다.
  // 놓은 뒤에도 마우스를 따라다니는 일이 없도록 어느 쪽이든 먼저 오는 쪽에서 끌기를 끝낸다.
  const endRef = useRef<() => void>(() => undefined);
  const detach = useRef<(() => void) | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (mode !== "fan" || (event.pointerType === "mouse" && event.button !== 0)) return;
    drag.current = { x0: event.clientX, y0: event.clientY, f0: focus.current, moved: false, lastX: event.clientX, lastT: event.timeStamp, v: 0 };
    cancelPick();
    detach.current?.();
    const stop = () => endRef.current();
    const types = ["pointerup", "pointercancel", "blur"] as const;
    for (const type of types) window.addEventListener(type, stop);
    detach.current = () => { for (const type of types) window.removeEventListener(type, stop); };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // 버튼이 이미 떼어진 상태로 움직임만 오면 놓는 이벤트를 놓친 것이므로 끌기를 끝낸다.
    if (event.pointerType === "mouse" && event.buttons === 0) { endRef.current(); return; }
    const dx = event.clientX - d.x0, dt = Math.max(1, event.timeStamp - d.lastT);
    if (!d.moved) {
      if (Math.hypot(dx, event.clientY - d.y0) < 6) return;
      d.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    d.v = .8 * d.v + .2 * ((event.clientX - d.lastX) / dt);
    d.lastX = event.clientX; d.lastT = event.timeStamp;
    focus.current = clamp(d.f0 - dx / fanStep(size.w, size.h), 0, shares.length - 1);
    engine.kick();
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    detach.current?.();
    detach.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    // 놓는 순간의 속도만큼 더 미끄러진 뒤 가장 가까운 카드에 멈춘다.
    const glide = clamp(clamp(d.v, -2, 2) * 140 / fanStep(size.w, size.h), -3, 3);
    const position = Math.round(clamp(focus.current - glide, 0, shares.length - 1));
    focus.current = position;
    onSelect(items[deck.current.inverse[position]].id);
    engine.kick();
  };

  endRef.current = endDrag;
  useEffect(() => () => { detach.current?.(); }, []);

  const first = dateInput(items[lineOrder[0]].consentedAt).replaceAll("-", ".");
  return <div ref={stageRef} className={`share-stage is-${mode}`} role="group" aria-label={`시청자 ${shares.length}명. 방향키로 시청자를 옮기고 엔터로 기록을 열 수 있어요.`}
    onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={event => { if (event.target === event.currentTarget) endDrag(); }} onDragStart={event => event.preventDefault()}
>
    <svg className="share-line" aria-hidden="true"><path ref={pathRef} /></svg>
    <span className="share-axis share-axis-start" aria-hidden="true">{first} 첫 공유</span>
    <span className="share-axis share-axis-end" aria-hidden="true">최근</span>
    {shares.map((share, i) => {
      const info = infos[i], name = shareName(share), selected = i === selectedIndex, badge = viewerBadge(share);
      return <button key={share.ownerChannelId} ref={el => { nodeRefs.current[i] = el; }} type="button" className={`share-node tier-${info.tier}${info.days <= 7 ? " is-fresh" : ""}`}
        data-kind={badge.kind} data-fx={badge.tier} data-medal={badge.medal ?? undefined}
        aria-pressed={selected} aria-haspopup="dialog" aria-label={`${name}, ${info.date}부터${info.days === 0 ? ", 오늘 시작" : `, ${info.days}일째`}${badge.rank ? `, 랭킹 ${badge.rank}위` : ""}${badge.months ? `, 구독 ${badge.months}개월` : ""}. 누르면 기록이 열려요.`} tabIndex={selected ? 0 : -1}
        onClick={() => { if (!suppressClick.current) onOpen(share.ownerChannelId); }}>
        <span className="share-ring" aria-hidden="true" />
        <span className="share-dot" aria-hidden="true"><ShareAvatar share={share} px={72} /></span>
        <span className="share-card" aria-hidden="true">
          <span className="share-card-head"><span>나에게 보여 준 기록</span><span>{info.date.slice(0, 4)}</span></span>
          <span className="share-card-id">
            <span className="share-card-avatar"><ShareAvatar share={share} px={72} large /></span>
            <strong>{name}</strong>
          </span>
          <span className="share-card-days"><span>{info.label}</span><span className="share-card-big"><strong>{info.big}</strong><small>{info.unit}</small></span></span>
          <span className="share-card-foot"><span>{info.date}부터</span>{(badge.rank || badge.months > 0) && <span className="share-card-chips">{badge.rank ? <span data-chip="rank">랭킹 {badge.rank}위</span> : null}{badge.months > 0 ? <span data-chip="sub">구독 {badge.months}개월</span> : null}</span>}</span>
        </span>
        <span className="share-tip" aria-hidden="true">{name}</span>
      </button>;
    })}
  </div>;
}
